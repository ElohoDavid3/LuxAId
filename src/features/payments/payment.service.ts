import { randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { PaymentAttemptStatus, Prisma } from '@prisma/client';
import { logAudit } from '../auth/audit';

const PAYMENTS_SCOPE = 'payments' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, PAYMENTS_SCOPE);
}

export type PaymentAttemptRecord = Prisma.PaymentAttemptGetPayload<
  Record<string, never>
>;

export async function initiatePayment(
  userId: string,
  requestedBusinessId: string,
  orderId: string,
): Promise<PaymentAttemptRecord> {
  const membership = await resolveMembership(userId, requestedBusinessId);

  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId: membership.businessId },
    select: { id: true, status: true, totalAmount: true },
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

  const attempt = await prisma.paymentAttempt.create({
    data: {
      businessId: membership.businessId,
      orderId: order.id,
      status: PaymentAttemptStatus.PENDING,
      amount: order.totalAmount,
      currency: 'NGN',
      transactionReference: `tx_${randomBytes(16).toString('hex')}`,
    },
  });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'PAYMENT_INITIATED',
    actorType: 'AI',
    actorId: userId,
    payload: {
      paymentAttemptId: attempt.id,
      orderId: order.id,
      amount: order.totalAmount,
    },
  });

  return attempt;
}
