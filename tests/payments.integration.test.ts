import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';
import * as paymentService from '../src/features/payments/payment.service';
import { OrderStatus, PaymentAttemptStatus } from '@prisma/client';
import { AppError } from '../src/lib/errors';

describe('Payment Service Integration Tests', () => {
  const originalFetch = global.fetch;

  beforeAll(async () => {
    process.env.FLW_SECRET_KEY = 'FLWSECK_TEST-mock-key';
    process.env.FLW_SECRET_HASH = 'test-secret-hash';
  });

  beforeEach(async () => {
    await resetDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    delete process.env.FLW_SECRET_KEY;
    delete process.env.FLW_SECRET_HASH;
    await prisma.$disconnect();
  });

  it('initiates payment for an AWAITING_PAYMENT order with link generation', async () => {
    const { user, business } = await createUserInBusiness('merchant_init@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Grace', email: 'grace@example.com', phone: '+2348011223344' },
    });
    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.AWAITING_PAYMENT,
        totalAmount: 1500000, // 15,000 NGN
      },
    });

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/payments')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            message: 'Hosted Link',
            data: { link: 'https://checkout.flutterwave.com/v3/hosted/pay/mock_link_123' },
          }),
        };
      }
      return { ok: false, status: 400, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const result = await paymentService.initiatePayment(
      user.id,
      business.id,
      order.id,
      { redirectUrl: 'https://example.com/checkout/success' },
    );

    expect(result.attempt).toBeDefined();
    expect(result.attempt.status).toBe(PaymentAttemptStatus.PENDING);
    expect(result.attempt.amount).toBe(1500000);
    expect(result.attempt.transactionReference).toMatch(/^tx_/);
    expect(result.paymentLink).toBe('https://checkout.flutterwave.com/v3/hosted/pay/mock_link_123');

    // Audit log check
    const auditLogs = await prisma.auditLog.findMany({
      where: { businessId: business.id, eventType: 'PAYMENT_INITIATED' },
    });
    expect(auditLogs.length).toBe(1);
  });

  it('rejects initiating payment for an order not in AWAITING_PAYMENT status', async () => {
    const { user, business } = await createUserInBusiness('merchant_reject@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Grace', email: 'grace@example.com' },
    });
    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.PAID,
        totalAmount: 100000,
      },
    });

    await expect(
      paymentService.initiatePayment(user.id, business.id, order.id),
    ).rejects.toThrow(AppError);
  });

  it('enforces multi-tenant authorization (cannot initiate payment for another business order)', async () => {
    const { user: userA, business: businessA } = await createUserInBusiness('user_a@test.com');
    const { business: businessB } = await createUserInBusiness('user_b@test.com');

    const customerB = await prisma.customer.create({
      data: { businessId: businessB.id, name: 'B Customer', email: 'bcust@example.com' },
    });
    const orderB = await prisma.order.create({
      data: {
        businessId: businessB.id,
        customerId: customerB.id,
        status: OrderStatus.AWAITING_PAYMENT,
        totalAmount: 500000,
      },
    });

    // User A attempts to initiate payment using Business A against Business B's order
    await expect(
      paymentService.initiatePayment(userA.id, businessA.id, orderB.id),
    ).rejects.toThrow(AppError);
  });

  it('verifies and reconciles pending payment attempt', async () => {
    const { user, business } = await createUserInBusiness('reconcile@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Helen', email: 'helen@example.com' },
    });
    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.AWAITING_PAYMENT,
        totalAmount: 750000, // 7,500 NGN in kobo
      },
    });
    const txRef = 'tx_flw_reconcile_test';
    const attempt = await prisma.paymentAttempt.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        status: PaymentAttemptStatus.PENDING,
        amount: 750000,
        currency: 'NGN',
        transactionReference: txRef,
      },
    });

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/verify')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: {
              id: 998877,
              tx_ref: txRef,
              amount: 7500, // 7,500 NGN
              currency: 'NGN',
              status: 'successful',
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const verified = await paymentService.verifyPaymentAttempt(
      user.id,
      business.id,
      attempt.id,
    );

    expect(verified.status).toBe(PaymentAttemptStatus.SUCCESSFUL);
    expect(verified.gatewayReference).toBe('998877');

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe(OrderStatus.PAID);
  });
});
