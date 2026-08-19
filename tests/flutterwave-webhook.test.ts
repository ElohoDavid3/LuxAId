import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';
import { computeFlutterwaveSignature } from '../src/features/payments/signature';
import { PaymentAttemptStatus, OrderStatus } from '@prisma/client';

const TEST_SECRET_HASH = 'test-webhook-secret-hash-xyz';

function createSignedRequest(body: string, headers: Record<string, string> = {}) {
  const signature = computeFlutterwaveSignature(body, TEST_SECRET_HASH);
  const reqHeaders = new Headers({
    'Content-Type': 'application/json',
    'flutterwave-signature': signature,
    ...headers,
  });

  return new Request('http://localhost:3000/api/webhooks/flutterwave', {
    method: 'POST',
    headers: reqHeaders,
    body,
  });
}

describe('Flutterwave webhook route handler', () => {
  const originalFetch = global.fetch;

  beforeAll(async () => {
    process.env.FLW_SECRET_HASH = TEST_SECRET_HASH;
    process.env.FLW_SECRET_KEY = 'FLWSECK_TEST-mock-key';
  });

  beforeEach(async () => {
    await resetDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    delete process.env.FLW_SECRET_HASH;
    delete process.env.FLW_SECRET_KEY;
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const { POST } = await import('../src/app/api/webhooks/flutterwave/route');

    const body = JSON.stringify({ event: 'charge.completed', data: { id: 1 } });
    const request = new Request('http://localhost:3000/api/webhooks/flutterwave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(request as any);
    expect(response.status).toBe(401);
    const json = (await response.json()) as { error?: string };
    expect(json.error).toBe('Invalid webhook signature');
  });

  it('rejects invalid JSON with 400', async () => {
    const { POST } = await import('../src/app/api/webhooks/flutterwave/route');

    const invalidBody = '{ invalid-json ';
    const request = createSignedRequest(invalidBody);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(request as any);
    expect(response.status).toBe(400);
    const json = (await response.json()) as { error?: string };
    expect(json.error).toBe('Invalid JSON payload');
  });

  it('rejects invalid payload shape with 400', async () => {
    const { POST } = await import('../src/app/api/webhooks/flutterwave/route');

    const body = JSON.stringify({ event: 'charge.completed', data: { status: 'ok' } }); // missing tx_ref and id
    const request = createSignedRequest(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(request as any);
    expect(response.status).toBe(400);
  });

  it('ignores non-charge events with 200', async () => {
    const { POST } = await import('../src/app/api/webhooks/flutterwave/route');

    const body = JSON.stringify({
      event: 'transfer.completed',
      data: { id: 999, tx_ref: 'tx_transfer_1', amount: 1000, status: 'successful' },
    });
    const request = createSignedRequest(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { status?: string };
    expect(json.status).toBe('ignored');
  });

  it('handles unknown transaction reference with 200 (does not throw or create records)', async () => {
    const { POST } = await import('../src/app/api/webhooks/flutterwave/route');

    const body = JSON.stringify({
      event: 'charge.completed',
      data: { id: 99999, tx_ref: 'tx_unknown_ref_123', amount: 5000, status: 'successful' },
    });
    const request = createSignedRequest(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { status?: string };
    expect(json.status).toBe('unknown_reference');
  });

  it('successfully verifies and transitions order to PAID and attempt to SUCCESSFUL', async () => {
    const { business } = await createUserInBusiness('merchant@flwtest.com');

    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Alice Customer', email: 'alice@example.com' },
    });

    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.AWAITING_PAYMENT,
        totalAmount: 500000, // 5,000 NGN in kobo
      },
    });

    const txRef = 'tx_flw_successful_123';
    const attempt = await prisma.paymentAttempt.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        status: PaymentAttemptStatus.PENDING,
        amount: 500000,
        currency: 'NGN',
        transactionReference: txRef,
      },
    });

    // Mock Flutterwave verify API endpoint
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/transactions/123456/verify')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: {
              id: 123456,
              tx_ref: txRef,
              flw_ref: 'FLW-MOCK-REF-1',
              amount: 5000, // 5000 Naira
              currency: 'NGN',
              status: 'successful',
              customer: { email: 'alice@example.com', name: 'Alice Customer' },
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as unknown as typeof fetch;

    const { POST } = await import('../src/app/api/webhooks/flutterwave/route');

    const body = JSON.stringify({
      event: 'charge.completed',
      data: {
        id: 123456,
        tx_ref: txRef,
        amount: 5000,
        currency: 'NGN',
        status: 'successful',
      },
    });
    const request = createSignedRequest(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { status?: string };
    expect(json.status).toBe('applied');

    // Verify DB records
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder?.status).toBe(OrderStatus.PAID);

    const updatedAttempt = await prisma.paymentAttempt.findUnique({ where: { id: attempt.id } });
    expect(updatedAttempt?.status).toBe(PaymentAttemptStatus.SUCCESSFUL);
    expect(updatedAttempt?.gatewayReference).toBe('123456');

    // Verify AuditLog
    const auditLogs = await prisma.auditLog.findMany({
      where: { businessId: business.id, eventType: 'PAYMENT_VERIFIED' },
    });
    expect(auditLogs.length).toBe(1);
  });

  it('is idempotent: duplicate webhook delivery does not re-apply or error', async () => {
    const { business } = await createUserInBusiness('duplicate@flwtest.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Bob', email: 'bob@example.com' },
    });
    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.PAID,
        totalAmount: 300000,
      },
    });
    const txRef = 'tx_flw_duplicate_456';
    await prisma.paymentAttempt.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        status: PaymentAttemptStatus.SUCCESSFUL,
        amount: 300000,
        currency: 'NGN',
        transactionReference: txRef,
        gatewayReference: '78910',
      },
    });

    const { POST } = await import('../src/app/api/webhooks/flutterwave/route');

    const body = JSON.stringify({
      event: 'charge.completed',
      data: { id: 78910, tx_ref: txRef, amount: 3000, currency: 'NGN', status: 'successful' },
    });
    const request = createSignedRequest(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { status?: string };
    expect(json.status).toBe('duplicate');
  });

  it('handles amount mismatch safely without marking order paid', async () => {
    const { business } = await createUserInBusiness('mismatch@flwtest.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Charlie', email: 'charlie@example.com' },
    });
    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.AWAITING_PAYMENT,
        totalAmount: 1000000, // 10,000 NGN in kobo
      },
    });
    const txRef = 'tx_flw_mismatch_789';
    const attempt = await prisma.paymentAttempt.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        status: PaymentAttemptStatus.PENDING,
        amount: 1000000,
        currency: 'NGN',
        transactionReference: txRef,
      },
    });

    // Mock verification returning only 2,000 NGN (amount mismatch!)
    global.fetch = jest.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: {
          id: 55555,
          tx_ref: txRef,
          amount: 2000, // mismatch!
          currency: 'NGN',
          status: 'successful',
        },
      }),
    })) as unknown as typeof fetch;

    const { POST } = await import('../src/app/api/webhooks/flutterwave/route');

    const body = JSON.stringify({
      event: 'charge.completed',
      data: { id: 55555, tx_ref: txRef, amount: 2000, currency: 'NGN', status: 'successful' },
    });
    const request = createSignedRequest(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { status?: string };
    expect(json.status).toBe('mismatch');

    // Order must remain AWAITING_PAYMENT and attempt must remain PENDING
    const unchangedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchangedOrder?.status).toBe(OrderStatus.AWAITING_PAYMENT);

    const unchangedAttempt = await prisma.paymentAttempt.findUnique({ where: { id: attempt.id } });
    expect(unchangedAttempt?.status).toBe(PaymentAttemptStatus.PENDING);
  });

  it('handles state conflict (order cancelled) safely without overwriting', async () => {
    const { business } = await createUserInBusiness('cancelled@flwtest.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Dan', email: 'dan@example.com' },
    });
    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.CANCELLED,
        totalAmount: 500000,
      },
    });
    const txRef = 'tx_flw_cancelled_999';
    await prisma.paymentAttempt.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        status: PaymentAttemptStatus.PENDING,
        amount: 500000,
        currency: 'NGN',
        transactionReference: txRef,
      },
    });

    global.fetch = jest.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: {
          id: 66666,
          tx_ref: txRef,
          amount: 5000,
          currency: 'NGN',
          status: 'successful',
        },
      }),
    })) as unknown as typeof fetch;

    const { POST } = await import('../src/app/api/webhooks/flutterwave/route');

    const body = JSON.stringify({
      event: 'charge.completed',
      data: { id: 66666, tx_ref: txRef, amount: 5000, currency: 'NGN', status: 'successful' },
    });
    const request = createSignedRequest(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { status?: string };
    expect(json.status).toBe('state_conflict');

    const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
    expect(orderAfter?.status).toBe(OrderStatus.CANCELLED);
  });
});
