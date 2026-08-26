import { randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { PaymentAttemptStatus, Prisma } from '@prisma/client';
import { logAudit } from '../auth/audit';
import { logger } from '../../lib/logger';
import {
  createPaymentLink,
  verifyTransaction,
  FlutterwaveTransactionData,
} from '../../lib/flutterwave';

const PAYMENTS_SCOPE = 'payments' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, PAYMENTS_SCOPE);
}

export type PaymentAttemptRecord = Prisma.PaymentAttemptGetPayload<
  Record<string, never>
>;

export interface InitiatePaymentResult {
  attempt: PaymentAttemptRecord;
  paymentLink?: string;
}

/**
 * Initiates a payment attempt for an order and generates a Flutterwave checkout link.
 */
export async function initiatePayment(
  userId: string,
  requestedBusinessId: string,
  orderId: string,
  options?: {
    redirectUrl?: string;
  },
): Promise<InitiatePaymentResult> {
  const membership = await resolveMembership(userId, requestedBusinessId);

  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId: membership.businessId },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      business: { select: { id: true, name: true } },
    },
  });

  if (!order) {
    throw new AppError('UNKNOWN_ORDER', 'Order not found.');
  }

  if (order.status !== 'AWAITING_PAYMENT') {
    throw new AppError(
      'STATE_CONFLICT',
      `Cannot initiate payment for an order in ${order.status} status.`,
    );
  }

  const transactionReference = `tx_${randomBytes(16).toString('hex')}`;

  const attempt = await prisma.paymentAttempt.create({
    data: {
      businessId: membership.businessId,
      orderId: order.id,
      status: PaymentAttemptStatus.PENDING,
      amount: order.totalAmount,
      currency: 'NGN',
      transactionReference,
    },
  });

  let paymentLink: string | undefined;

  try {
    const linkResult = await createPaymentLink({
      tx_ref: transactionReference,
      amountInKobo: order.totalAmount,
      currency: 'NGN',
      redirect_url: options?.redirectUrl,
      customer: {
        email: order.customer.email,
        name: order.customer.name,
        phonenumber: order.customer.phone,
      },
      customizations: {
        title: order.business.name,
        description: `Payment for Order #${order.id.slice(-6)}`,
      },
    });
    paymentLink = linkResult.link;
  } catch (error) {
    // If Flutterwave is not configured or in test environments, log error but preserve attempt
    logger.warn('flutterwave.payment_link_generation_skipped', {
      orderId: order.id,
      attemptId: attempt.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await logAudit({
    businessId: membership.businessId,
    eventType: 'PAYMENT_INITIATED',
    actorType: 'USER',
    actorId: userId,
    payload: {
      paymentAttemptId: attempt.id,
      orderId: order.id,
      amount: order.totalAmount,
      transactionReference,
      paymentLink,
    },
  });

  return {
    attempt,
    paymentLink,
  };
}

export interface ApplyVerifiedPaymentInput {
  transactionReference: string;
  providerTransactionId: string | number;
  verifiedAmountInKobo: number;
  verifiedCurrency: string;
  verifiedStatus: string;
  providerVerification: Prisma.InputJsonValue;
}

export type ApplyPaymentOutcome =
  | { outcome: 'APPLIED'; paymentAttempt: PaymentAttemptRecord }
  | { outcome: 'DUPLICATE'; paymentAttempt: PaymentAttemptRecord }
  | { outcome: 'UNKNOWN_REFERENCE' }
  | { outcome: 'MISMATCH'; reason: string }
  | { outcome: 'STATE_CONFLICT'; reason: string };

/**
 * Atomically updates PaymentAttempt to SUCCESSFUL and Order to PAID in a Prisma transaction,
 * with strict verification matching and state machine conflict guards.
 */
export async function applyVerifiedPayment(
  input: ApplyVerifiedPaymentInput,
): Promise<ApplyPaymentOutcome> {
  return await prisma.$transaction(async (tx) => {
    // Lock the row to prevent concurrent webhook delivery from applying twice.
    // Without FOR UPDATE, two concurrent transactions can both read PENDING and
    // both proceed to update, resulting in a double-application race.
    const [lockedAttempt] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "PaymentAttempt" WHERE "transactionReference" = ${input.transactionReference} FOR UPDATE`;

    if (!lockedAttempt) {
      logger.warn('payment.apply.unknown_reference', {
        transactionReference: input.transactionReference,
      });
      return { outcome: 'UNKNOWN_REFERENCE' };
    }

    const attempt = await tx.paymentAttempt.findUnique({
      where: { id: lockedAttempt.id },
      include: { order: true },
    });

    if (!attempt) {
      logger.warn('payment.apply.unknown_reference', {
        transactionReference: input.transactionReference,
      });
      return { outcome: 'UNKNOWN_REFERENCE' };
    }

    // Idempotency: duplicate webhook / verification on already successful payment
    if (attempt.status === PaymentAttemptStatus.SUCCESSFUL) {
      logger.info('payment.apply.already_successful', {
        paymentAttemptId: attempt.id,
        transactionReference: attempt.transactionReference,
      });
      return { outcome: 'DUPLICATE', paymentAttempt: attempt };
    }

    // Verify amount match (integer kobo comparison)
    if (attempt.amount !== input.verifiedAmountInKobo) {
      logger.warn('payment.apply.amount_mismatch', {
        paymentAttemptId: attempt.id,
        expectedAmount: attempt.amount,
        verifiedAmount: input.verifiedAmountInKobo,
      });
      return {
        outcome: 'MISMATCH',
        reason: `Amount mismatch: expected ${attempt.amount} kobo, got ${input.verifiedAmountInKobo} kobo`,
      };
    }

    // Verify currency match
    if (
      attempt.currency.toUpperCase() !== input.verifiedCurrency.toUpperCase()
    ) {
      logger.warn('payment.apply.currency_mismatch', {
        paymentAttemptId: attempt.id,
        expectedCurrency: attempt.currency,
        verifiedCurrency: input.verifiedCurrency,
      });
      return {
        outcome: 'MISMATCH',
        reason: `Currency mismatch: expected ${attempt.currency}, got ${input.verifiedCurrency}`,
      };
    }

    // Verify provider status
    if (input.verifiedStatus.toLowerCase() !== 'successful') {
      logger.warn('payment.apply.status_not_successful', {
        paymentAttemptId: attempt.id,
        verifiedStatus: input.verifiedStatus,
      });
      return {
        outcome: 'MISMATCH',
        reason: `Status not successful: got ${input.verifiedStatus}`,
      };
    }

    // State machine guard: order must be in AWAITING_PAYMENT state
    if (attempt.order.status !== 'AWAITING_PAYMENT') {
      logger.warn('payment.apply.order_state_conflict', {
        orderId: attempt.orderId,
        orderStatus: attempt.order.status,
      });
      return {
        outcome: 'STATE_CONFLICT',
        reason: `Order ${attempt.orderId} is in ${attempt.order.status} status, cannot mark as PAID.`,
      };
    }

    // Update payment attempt to SUCCESSFUL
    const updatedAttempt = await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentAttemptStatus.SUCCESSFUL,
        gatewayReference: String(input.providerTransactionId),
        providerVerification: input.providerVerification,
      },
    });

    // Update order status to PAID
    await tx.order.update({
      where: { id: attempt.orderId },
      data: { status: 'PAID' },
    });

    // Write audit logs
    await tx.auditLog.create({
      data: {
        businessId: attempt.businessId,
        eventType: 'PAYMENT_VERIFIED',
        actorType: 'SYSTEM',
        actorId: 'flutterwave',
        payload: {
          paymentAttemptId: attempt.id,
          orderId: attempt.orderId,
          transactionReference: attempt.transactionReference,
          gatewayReference: String(input.providerTransactionId),
          amount: attempt.amount,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: attempt.businessId,
        eventType: 'ORDER_STATUS_UPDATED',
        actorType: 'SYSTEM',
        actorId: 'flutterwave',
        payload: {
          orderId: attempt.orderId,
          from: 'AWAITING_PAYMENT',
          to: 'PAID',
        },
      },
    });

    logger.info('payment.apply.success', {
      paymentAttemptId: attempt.id,
      orderId: attempt.orderId,
      transactionReference: attempt.transactionReference,
    });

    return { outcome: 'APPLIED', paymentAttempt: updatedAttempt };
  });
}

/**
 * Re-queries Flutterwave for authoritative transaction data and applies the verified payment.
 */
export async function reconcilePaymentByReference(
  transactionReference: string,
  providerTransactionId?: string | number,
): Promise<ApplyPaymentOutcome> {
  const queryId = providerTransactionId ?? transactionReference;
  const verifiedData: FlutterwaveTransactionData =
    await verifyTransaction(queryId);

  // Normalize amount from Naira (float) to kobo (integer)
  const verifiedAmountInKobo = Math.round(Number(verifiedData.amount) * 100);

  return await applyVerifiedPayment({
    transactionReference: verifiedData.tx_ref || transactionReference,
    providerTransactionId: verifiedData.id,
    verifiedAmountInKobo,
    verifiedCurrency: String(verifiedData.currency).toUpperCase(),
    verifiedStatus: String(verifiedData.status),
    providerVerification: verifiedData as unknown as Prisma.InputJsonValue,
  });
}

/**
 * Tenant-scoped manual or scheduled payment verification for a single payment attempt.
 */
export async function verifyPaymentAttempt(
  userId: string,
  requestedBusinessId: string,
  paymentAttemptId: string,
): Promise<PaymentAttemptRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);

  const attempt = await prisma.paymentAttempt.findFirst({
    where: { id: paymentAttemptId, businessId: membership.businessId },
  });

  if (!attempt) {
    throw new AppError('VALIDATION_ERROR', 'Payment attempt not found.');
  }

  if (attempt.status === PaymentAttemptStatus.SUCCESSFUL) {
    return attempt;
  }

  const queryId = attempt.gatewayReference || attempt.transactionReference;
  const outcome = await reconcilePaymentByReference(
    attempt.transactionReference,
    queryId,
  );

  if (outcome.outcome === 'APPLIED' || outcome.outcome === 'DUPLICATE') {
    return outcome.paymentAttempt;
  }

  if (outcome.outcome === 'MISMATCH') {
    throw new AppError('PAYMENT_MISMATCH', outcome.reason);
  }

  if (outcome.outcome === 'STATE_CONFLICT') {
    throw new AppError('STATE_CONFLICT', outcome.reason);
  }

  throw new AppError(
    'PAYMENT_UNVERIFIED',
    'Payment could not be verified with Flutterwave.',
  );
}

/**
 * Retrieve a payment attempt by ID, enforcing tenant boundaries.
 */
export async function getPaymentAttempt(
  userId: string,
  requestedBusinessId: string,
  attemptId: string,
): Promise<PaymentAttemptRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);

  const attempt = await prisma.paymentAttempt.findFirst({
    where: { id: attemptId, businessId: membership.businessId },
  });

  if (!attempt) {
    throw new AppError('VALIDATION_ERROR', 'Payment attempt not found.');
  }

  return attempt;
}
