# Flutterwave Integration

Implement payment features for LuxAId using Flutterwave. Read `.agents/rules/security.md`, `.agents/rules/architecture.md`, and the reference implementation in `webhook-handler.ts` before working on any payment code.

## Core Rules

- Flutterwave is the payment provider. Do not introduce Paystack or another provider.
- Never grant value based on a browser redirect, client-side state, a customer screenshot, or an unverified webhook payload alone.
- Every payment that can change an order state must be verified server-side with Flutterwave before value is granted.
- Treat the Flutterwave secret key and webhook secret/hash as server-side secrets. Never expose them to browser code.

## Structure

- All Flutterwave API calls go through the `lib/flutterwave.ts` wrapper. Do not call the Flutterwave API directly from route handlers or server actions.
- Payment verification and state transitions live in `features/payments/`.
- The webhook receiver lives at `src/app/api/webhooks/flutterwave/route.ts`.

## Payment Flow

1. Create a unique transaction reference.
2. Create the Flutterwave checkout/payment link server-side through `lib/flutterwave.ts`.
3. Persist the internal payment attempt before redirecting the customer.
4. Return the hosted payment link to the customer-facing flow.
5. Handle the payment redirect without treating it as proof of payment. The success page shows "Verifying your payment..." and never marks the order paid.
6. Receive authenticated Flutterwave webhooks.
7. Record webhook events idempotently (see below).
8. Re-query Flutterwave to verify the transaction.
9. Compare verified transaction reference, status, amount, and currency against the expected payment attempt.
10. Update the payment and order atomically according to the valid state transitions in `architecture.md`.

## Webhook Security

- Preserve the raw request body before JSON parsing; signature verification needs it.
- Verify the `flutterwave-signature` header using the current documented mechanism (HMAC-SHA256 base64 of the raw body with the webhook secret hash, compared with a timing-safe comparison). The reference implementation in `webhook-handler.ts` computes this correctly.
- Reject unauthenticated requests with `401`.
- Do not rely on source IP allowlists as the primary authenticity mechanism.
- Acknowledge accepted receipt promptly (HTTP 200). Never perform long-running work before acknowledging if it risks the provider timeout.

## Idempotency

- Webhook processing must be idempotent.
- Record the provider event identity before applying irreversible business effects.
- A duplicate webhook must not create another order, confirm payment twice, or duplicate value delivery.
- Use a database unique constraint on the event key (or an equivalent transaction) so concurrent duplicate deliveries cannot both pass the duplicate check. A lookup-only check is not sufficient.
- Payment creation and verification side effects must also be idempotent.

## Verification Before Confirmation

- The webhook payload alone is not authoritative for the final transaction state.
- Re-query Flutterwave for the transaction and require all of the following to match the application's payment attempt:
  - Transaction/reference identity.
  - Expected amount.
  - Expected currency.
  - Successful final transaction status.
- Only then update the payment and order atomically.
- If the verified transaction does not match, leave the payment attempt in its current state and log the mismatch. Never mark the order paid.

## Pending Payments

- Keep a recovery path for pending transactions if webhook delivery fails.
- Pending payment attempts that are not confirmed within a defined window must be re-queried against Flutterwave, not silently left stuck.
- The success redirect is not proof of payment and must not change order state.

## Errors

- Business-logic payment failures return `PAYMENT_FAILED` with HTTP `422`.
- Log provider verification failures with the structured logger, including the internal transaction reference and tenant ID. Never log the full payment credentials, authorization headers, or unredacted provider payloads.

## Tests

Payment and webhook code requires integration tests that verify database state. Cover:

- Happy path (verified successful payment).
- Invalid signature.
- Malformed payload.
- Duplicate webhook delivery (idempotency).
- Amount mismatch.
- Currency mismatch.
- Reference mismatch.
- Provider verification failure.
- Unknown transaction reference.
- State-conflict transitions.

Tests must explicitly verify idempotency and amount/currency/reference matching.
