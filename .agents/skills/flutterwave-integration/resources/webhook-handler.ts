/**
 * Flutterwave webhook reference implementation.
 *
 * This file is intentionally framework-neutral. Adapt the exported functions
 * to the project's HTTP runtime (Next.js route handler) and queue/worker
 * infrastructure without changing the security, idempotency, or verification
 * sequence.
 *
 * Contract:
 * 1. Preserve the raw request body before JSON parsing.
 * 2. Verify authenticity with the CURRENT Flutterwave mechanism
 *    (`flutterwave-signature` = base64 HMAC-SHA256 of the raw body using the
 *    webhook secret hash). Fall back to the legacy `verif-hash` equality
 *    header only when the HMAC header is absent.
 * 3. Acknowledge accepted receipt promptly (HTTP 200) and do the
 *    verification/state-change work asynchronously. Never run long provider
 *    round-trips before acknowledging.
 * 4. Deduplicate on the provider event identity, backed by a UNIQUE
 *    constraint. Lookup-only checks are not sufficient.
 * 5. Never treat the webhook payload as final proof of payment. Re-query
 *    Flutterwave and compare reference, status, amount, and currency against
 *    the application's payment attempt before changing state.
 * 6. Apply the payment/order state change and the verification audit record
 *    atomically in one transaction, following the state machine in
 *    architecture.md. On a state conflict, leave everything unchanged.
 * 7. Log through the structured logger with safe identifiers only. Never log
 *    the raw payload, credentials, or authorization headers.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface FlutterwaveWebhookRequest {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface FlutterwaveWebhookResponse {
  status: number;
  body?: string;
}

export interface FlutterwaveWebhookEvent {
  id?: string;
  timestamp?: number;
  type?: string;
  data?: {
    id?: number | string;
    reference?: string;
    tx_ref?: string;
    status?: string;
    amount?: number;
    currency?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Computes the HMAC-SHA256 base64 signature documented by Flutterwave.
 */
export function computeFlutterwaveSignature(rawBody: string, secretHash: string): string {
  return createHmac("sha256", secretHash).update(rawBody).digest("base64");
}

/**
 * Uses a timing-safe comparison for webhook signatures.
 */
export function isValidFlutterwaveSignature(
  rawBody: string,
  receivedSignature: string | undefined,
  secretHash: string | undefined,
): boolean {
  if (!receivedSignature || !secretHash) return false;

  const expected = computeFlutterwaveSignature(rawBody, secretHash);
  const received = Buffer.from(receivedSignature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (received.length !== expectedBuffer.length) return false;

  return timingSafeEqual(received, expectedBuffer);
}

/**
 * Legacy `verif-hash` mechanism: a plain equality check against the configured
 * secret hash. Kept only for tenants still on legacy dashboard configuration.
 * Prefer the HMAC `flutterwave-signature` mechanism when both are present.
 */
export function isLegacyVerifHashValid(
  receivedHash: string | undefined,
  secretHash: string | undefined,
): boolean {
  if (!receivedHash || !secretHash) return false;
  return receivedHash === secretHash;
}

function getHeader(
  headers: FlutterwaveWebhookRequest["headers"],
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];

  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Validate the minimum event structure before handing it to domain logic.
 */
export function parseFlutterwaveEvent(rawBody: string): FlutterwaveWebhookEvent {
  const payload: unknown = JSON.parse(rawBody);

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Flutterwave webhook payload");
  }

  const event = payload as FlutterwaveWebhookEvent;

  if (!event.type || !event.data || typeof event.data !== "object") {
    throw new Error("Incomplete Flutterwave webhook payload");
  }

  return event;
}

/**
 * Amounts are stored as integer minor units (kobo). Normalize to an integer so
 * a provider that returns a string or a float cannot silently pass or fail a
 * strict comparison. Returns null when the value is not a finite integer.
 */
export function normalizeAmount(value: number | string | undefined): number | null {
  if (value === undefined || value === null) return null;

  const normalized = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(normalized) || !Number.isInteger(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Provider-specific transaction verification contract.
 *
 * The actual implementation should call Flutterwave's transaction
 * verification endpoint and return the authoritative provider response.
 */
export interface FlutterwaveTransactionVerifier {
  verify(transactionId: string | number): Promise<{
    status: string;
    amount: number;
    currency: string;
    reference?: string;
    tx_ref?: string;
  }>;
}

export interface PaymentAttempt {
  id: string;
  tenantId: string;
  orderId: string;
  expectedAmount: number;
  expectedCurrency: string;
  transactionReference: string;
  status: string;
}

/**
 * Thrown by applyVerifiedPayment when the payment/order state machine rejects
 * the transition. The state is left unchanged; the attempt stays pending and
 * reconciliation can retry.
 */
export class PaymentStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentStateConflictError";
  }
}

/**
 * The persistence contract for webhook processing.
 *
 * Implementations MUST:
 * - Back `recordReceipt` with a UNIQUE constraint on `eventId` and translate a
 *   unique-constraint violation into the `"duplicate"` result (never throw on
 *   duplicates). A lookup-only duplicate check is not sufficient.
 * - Apply `applyVerifiedPayment` in ONE transaction: record the verification
 *   audit data, mark the webhook event processed, and transition the payment
 *   and order together. Any of those steps failing must roll the whole thing
 *   back so the receipt row remains pending for reconciliation.
 * - Leave the payment attempt unchanged (never mark the order paid) when a
 *   state machine guard rejects the transition; throw PaymentStateConflictError
 *   instead.
 */
export interface WebhookEventStore {
  recordReceipt(input: {
    eventId: string;
    eventType: string;
    transactionId: string;
    transactionReference: string;
  }): Promise<"recorded" | "duplicate">;

  findByTransactionReference(reference: string): Promise<PaymentAttempt | null>;

  applyVerifiedPayment(input: {
    paymentAttemptId: string;
    orderId: string;
    tenantId: string;
    eventId: string;
    providerTransactionId: string;
    transactionReference: string;
    verifiedAmount: number;
    verifiedCurrency: string;
    verifiedStatus: string;
  }): Promise<void>;
}

/**
 * The async dispatch contract. Acknowledge the webhook first, then hand the
 * event to a durable queue/worker so provider round-trips never run before the
 * HTTP 200 is returned.
 */
export interface FlutterwaveWebhookWorker {
  enqueue(event: {
    eventId: string;
    transactionId: string;
    transactionReference: string;
  }): Promise<void>;
}

function isAuthentic(request: FlutterwaveWebhookRequest, secretHash: string | undefined): boolean {
  const signature = getHeader(request.headers, "flutterwave-signature");

  if (signature !== undefined) {
    return isValidFlutterwaveSignature(request.rawBody, signature, secretHash);
  }

  const legacyHash = getHeader(request.headers, "verif-hash");
  return isLegacyVerifHashValid(legacyHash, secretHash);
}

/**
 * Handle a Flutterwave webhook.
 *
 * This function only authenticates, deduplicates, and enqueues. It returns
 * HTTP 200 promptly (or 401/400 for invalid requests) and never performs a
 * provider round-trip before acknowledging.
 *
 * If the event was already recorded, it is returned as 200; if its async
 * processing was subsequently lost, the pending-payment reconciliation job
 * re-queries the provider and completes the state change. The receipt row is
 * the durable pending state that recovery relies on.
 */
export async function handleFlutterwaveWebhook(
  request: FlutterwaveWebhookRequest,
  dependencies: {
    secretHash: string | undefined;
    store: WebhookEventStore;
    worker: FlutterwaveWebhookWorker;
    logger: Logger;
  },
): Promise<FlutterwaveWebhookResponse> {
  if (!isAuthentic(request, dependencies.secretHash)) {
    dependencies.logger.info("webhook.rejected", { reason: "invalid_signature" });
    return { status: 401, body: "Invalid webhook signature" };
  }

  let event: FlutterwaveWebhookEvent;

  try {
    event = parseFlutterwaveEvent(request.rawBody);
  } catch {
    dependencies.logger.info("webhook.rejected", { reason: "invalid_payload" });
    return { status: 400, body: "Invalid webhook payload" };
  }

  dependencies.logger.info("webhook.received", { eventId: event.id });

  // Ignore non-payment events here unless the product explicitly adds them.
  if (event.type !== "charge.completed") {
    return { status: 200 };
  }

  const eventId = event.id;
  const transactionId = event.data?.id;
  const transactionReference = event.data?.tx_ref ?? event.data?.reference;

  if (!eventId || !transactionId || !transactionReference) {
    return { status: 400, body: "Incomplete payment webhook" };
  }

  // Idempotency barrier: the unique constraint on eventId is what stops
  // concurrent duplicate deliveries from both passing. A lookup-only check is
  // not sufficient (see AGENTS.md and integrations.md).
  const receipt = await dependencies.store.recordReceipt({
    eventId,
    eventType: event.type,
    transactionId: String(transactionId),
    transactionReference,
  });

  if (receipt === "duplicate") {
    dependencies.logger.info("webhook.duplicate", { eventId });
    return { status: 200 };
  }

  // Do not create a payment/order from an unknown reference.
  const paymentAttempt = await dependencies.store.findByTransactionReference(transactionReference);

  if (!paymentAttempt) {
    dependencies.logger.warn("webhook.unknown_reference", {
      eventId,
      transactionReference,
    });
    return { status: 200 };
  }

  try {
    // Acknowledge promptly; the provider round-trip and state change happen in
    // the worker. On enqueue failure, return 500 so Flutterwave retries; the
    // receipt row keeps the retry idempotent, and the reconciliation job
    // covers a processing loss after acknowledgement.
    await dependencies.worker.enqueue({
      eventId,
      transactionId: String(transactionId),
      transactionReference,
    });
  } catch {
    dependencies.logger.error("webhook.enqueue_failed", { eventId });
    return { status: 500, body: "Webhook not accepted" };
  }

  dependencies.logger.info("webhook.accepted", { eventId });
  return { status: 200 };
}

/**
 * Asynchronous verification and state application. Called by the queue worker
 * and reused by the pending-payment reconciliation job.
 *
 * Never mark the order paid unless the re-queried provider transaction matches
 * the application's payment attempt on reference, status, amount, and currency.
 */
export async function processFlutterwaveWebhook(
  input: {
    eventId: string;
    transactionId: string;
    transactionReference: string;
  },
  dependencies: {
    verifier: FlutterwaveTransactionVerifier;
    store: WebhookEventStore;
    logger: Logger;
  },
): Promise<"applied" | "ignored" | "state-conflict"> {
  const paymentAttempt = await dependencies.store.findByTransactionReference(
    input.transactionReference,
  );

  if (!paymentAttempt) {
    dependencies.logger.warn("webhook.process.unknown_reference", {
      eventId: input.eventId,
      transactionReference: input.transactionReference,
    });
    return "ignored";
  }

  // The webhook payload is not authoritative enough to grant value.
  const verified = await dependencies.verifier.verify(input.transactionId);

  const verifiedAmount = normalizeAmount(verified.amount);
  const expectedAmount = normalizeAmount(paymentAttempt.expectedAmount);

  const mismatches: string[] = [];
  if (verified.status !== "successful") mismatches.push("status");
  if (verifiedAmount !== expectedAmount) mismatches.push("amount");
  if (String(verified.currency).toUpperCase() !== paymentAttempt.expectedCurrency.toUpperCase()) {
    mismatches.push("currency");
  }
  if ((verified.tx_ref ?? verified.reference) !== paymentAttempt.transactionReference) {
    mismatches.push("reference");
  }

  if (mismatches.length > 0) {
    // Leave the payment attempt in its current state. Never mark the order
    // paid. The mismatch is expected for genuinely failed transactions and
    // must remain recoverable via the pending-payment reconciliation job.
    dependencies.logger.warn("webhook.process.mismatch", {
      eventId: input.eventId,
      transactionReference: input.transactionReference,
      mismatches,
    });
    return "ignored";
  }

  try {
    // Atomic: verification audit record + webhook-event processed marker +
    // payment and order state transition in a single transaction. A state
    // conflict or any failure rolls the whole thing back and leaves the
    // receipt row pending for reconciliation.
    await dependencies.store.applyVerifiedPayment({
      paymentAttemptId: paymentAttempt.id,
      orderId: paymentAttempt.orderId,
      tenantId: paymentAttempt.tenantId,
      eventId: input.eventId,
      providerTransactionId: input.transactionId,
      transactionReference: paymentAttempt.transactionReference,
      verifiedAmount: verifiedAmount as number,
      verifiedCurrency: String(verified.currency).toUpperCase(),
      verifiedStatus: verified.status,
    });
  } catch (error) {
    if (error instanceof PaymentStateConflictError) {
      dependencies.logger.warn("webhook.process.state_conflict", {
        eventId: input.eventId,
        orderId: paymentAttempt.orderId,
      });
      return "state-conflict";
    }

    // Transient failure: rethrow so the worker can retry with backoff. The
    // receipt row is still pending, so retries remain idempotent.
    dependencies.logger.error("webhook.process.failed", {
      eventId: input.eventId,
      orderId: paymentAttempt.orderId,
    });
    throw error;
  }

  dependencies.logger.info("webhook.process.applied", {
    eventId: input.eventId,
    orderId: paymentAttempt.orderId,
  });
  return "applied";
}
