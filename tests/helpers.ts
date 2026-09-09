import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/features/auth/password.service';
import { applyVerifiedPayment } from '../src/features/payments/payment.service';
import { MembershipRole, MembershipStatus, PaymentAttemptStatus } from '@prisma/client';

export const TEST_PASSWORD = 'Correct-horse-battery-1';

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Business", "User" CASCADE');
}

/**
 * Transition an order to PAID through the verified payment path only.
 *
 * Mirrors the production guarantee that PAID is reachable exclusively via
 * server-side payment verification (applyVerifiedPayment), not updateStatus.
 */
export async function markOrderPaid(
  orderId: string,
  providerTransactionId: string | number = `provider_${Date.now()}`,
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`markOrderPaid: order ${orderId} not found`);

  const transactionReference = `tx_test_paid_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  await prisma.paymentAttempt.create({
    data: {
      businessId: order.businessId,
      orderId: order.id,
      status: PaymentAttemptStatus.PENDING,
      amount: order.totalAmount,
      currency: 'NGN',
      transactionReference,
    },
  });

  const outcome = await applyVerifiedPayment({
    transactionReference,
    providerTransactionId,
    verifiedAmountInKobo: order.totalAmount,
    verifiedCurrency: 'NGN',
    verifiedStatus: 'successful',
    providerVerification: { source: 'test-helper' },
  });

  if (outcome.outcome !== 'APPLIED') {
    throw new Error(
      `markOrderPaid failed for order ${orderId}: ${outcome.outcome}`,
    );
  }
}

export async function createUser(
  email: string,
  password: string = TEST_PASSWORD,
) {
  return prisma.user.create({
    data: {
      name: email.split('@')[0],
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
    },
  });
}

export function createBusiness(name: string) {
  return prisma.business.create({ data: { name } });
}

export function createMembership(
  userId: string,
  businessId: string,
  role: MembershipRole = MembershipRole.OWNER,
  status: MembershipStatus = MembershipStatus.ACTIVE,
) {
  return prisma.businessMembership.create({
    data: { userId, businessId, role, status },
  });
}

export type UserWithMembership = {
  user: Awaited<ReturnType<typeof prisma.user.create>>;
  business: Awaited<ReturnType<typeof prisma.business.create>>;
  membership: Awaited<ReturnType<typeof prisma.businessMembership.create>>;
};

export async function createUserInBusiness(
  email: string,
  role: MembershipRole = MembershipRole.OWNER,
  status: MembershipStatus = MembershipStatus.ACTIVE,
): Promise<UserWithMembership> {
  const user = await createUser(email);
  const business = await createBusiness(`${email.split('@')[0]}'s Shop`);
  const membership = await createMembership(user.id, business.id, role, status);
  return { user, business, membership };
}
