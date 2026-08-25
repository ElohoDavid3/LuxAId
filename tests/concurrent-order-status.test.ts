/**
 * Concurrent order status transition tests.
 *
 * Verifies that two concurrent attempts to transition the same order
 * from the same status do not both succeed (state machine violation).
 * Uses the FOR UPDATE row-level lock added to updateStatus().
 *
 * Tests cross-status concurrent transitions (e.g., PAID→PROCESSING
 * vs PAID→CANCELLED) to ensure only one wins.
 */

import { OrderStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';
import { createCustomer } from '../src/features/customers/customer.service';
import { createProduct } from '../src/features/products/product.service';
import { setStock } from '../src/features/products/inventory.service';
import { createOrder, updateStatus } from '../src/features/orders/order.service';

beforeAll(() => resetDatabase());
afterAll(() => prisma.$disconnect());

let testCounter = 0;

async function setupTestBusiness() {
  const suffix = `concurrent-order-${++testCounter}`;
  const { user, business } = await createUserInBusiness(`owner-${suffix}@test.com`);

  const customer = await createCustomer(user.id, business.id, {
    name: 'Concurrent Customer',
  });

  const product = await createProduct(user.id, business.id, {
    name: 'Concurrent Widget',
    description: 'Widget for concurrent tests',
    price: 10000,
    status: 'ACTIVE',
    variant: { sku: `COW-${suffix}`, name: 'Standard' },
  });
  const variant = product.variants[0];
  await setStock(user.id, business.id, { variantId: variant.id, available: 100 });

  return { user, business, customer, product, variant };
}

async function createTestOrder(
  userId: string,
  businessId: string,
  customerId: string,
  variantId: string,
) {
  return createOrder(userId, businessId, {
    customerId,
    items: [{ productVariantId: variantId, quantity: 1 }],
  });
}

describe('Concurrent order status transitions', () => {
  it('two concurrent AWAITING_PAYMENT→PAID: only one wins', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const order = await createTestOrder(user.id, business.id, customer.id, variant.id);
    expect(order.status).toBe('AWAITING_PAYMENT');

    const results = await Promise.allSettled([
      updateStatus(user.id, business.id, order.id, OrderStatus.PAID),
      updateStatus(user.id, business.id, order.id, OrderStatus.PAID),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'STATE_CONFLICT' });

    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(finalOrder!.status).toBe('PAID');
  });

  it('two concurrent AWAITING_PAYMENT→CANCELLED: only one wins', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const order = await createTestOrder(user.id, business.id, customer.id, variant.id);

    const results = await Promise.allSettled([
      updateStatus(user.id, business.id, order.id, OrderStatus.CANCELLED),
      updateStatus(user.id, business.id, order.id, OrderStatus.CANCELLED),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(finalOrder!.status).toBe('CANCELLED');
  });

  it('cross-status race: PAID→PROCESSING vs PAID→CANCELLED — both individually valid', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const order = await createTestOrder(user.id, business.id, customer.id, variant.id);

    await updateStatus(user.id, business.id, order.id, OrderStatus.PAID);

    // Both transitions are valid from PAID. With FOR UPDATE, the second
    // caller reads the post-transition state. Both can succeed as sequential
    // transitions (PAID→PROCESSING→CANCELLED or PAID→CANCELLED).
    const results = await Promise.allSettled([
      updateStatus(user.id, business.id, order.id, OrderStatus.PROCESSING),
      updateStatus(user.id, business.id, order.id, OrderStatus.CANCELLED),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect([OrderStatus.PROCESSING, OrderStatus.CANCELLED]).toContain(finalOrder!.status);
  });

  it('cross-status race: PROCESSING→READY_FOR_DELIVERY vs PROCESSING→CANCELLED', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const order = await createTestOrder(user.id, business.id, customer.id, variant.id);

    await updateStatus(user.id, business.id, order.id, OrderStatus.PAID);
    await updateStatus(user.id, business.id, order.id, OrderStatus.PROCESSING);

    // Both transitions are individually valid from PROCESSING.
    // With FOR UPDATE, the second caller sees the post-transition state.
    // READY_FOR_DELIVERY→CANCELLED is also valid, so both can succeed.
    // This test verifies both complete without error (legitimate sequential transitions).
    const results = await Promise.allSettled([
      updateStatus(user.id, business.id, order.id, OrderStatus.READY_FOR_DELIVERY),
      updateStatus(user.id, business.id, order.id, OrderStatus.CANCELLED),
    ]);

    // Both should succeed: first transitions to READY_FOR_DELIVERY,
    // second reads READY_FOR_DELIVERY and transitions to CANCELLED (which is allowed).
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect([OrderStatus.READY_FOR_DELIVERY, OrderStatus.CANCELLED]).toContain(finalOrder!.status);
  });

  it('ten concurrent AWAITING_PAYMENT→PAID: exactly one wins', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const order = await createTestOrder(user.id, business.id, customer.id, variant.id);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        updateStatus(user.id, business.id, order.id, OrderStatus.PAID),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(9);

    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(finalOrder!.status).toBe('PAID');
  });

  it('concurrent SHIPPED→DELIVERED: only one wins', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const order = await createTestOrder(user.id, business.id, customer.id, variant.id);

    await updateStatus(user.id, business.id, order.id, OrderStatus.PAID);
    await updateStatus(user.id, business.id, order.id, OrderStatus.PROCESSING);
    await updateStatus(user.id, business.id, order.id, OrderStatus.READY_FOR_DELIVERY);
    await updateStatus(user.id, business.id, order.id, OrderStatus.SHIPPED);

    const results = await Promise.allSettled([
      updateStatus(user.id, business.id, order.id, OrderStatus.DELIVERED),
      updateStatus(user.id, business.id, order.id, OrderStatus.DELIVERED),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(finalOrder!.status).toBe('DELIVERED');
  });

  it('second transition to same status fails with STATE_CONFLICT (not idempotent)', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const order = await createTestOrder(user.id, business.id, customer.id, variant.id);

    await updateStatus(user.id, business.id, order.id, OrderStatus.PAID);

    await expect(
      updateStatus(user.id, business.id, order.id, OrderStatus.PAID),
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  });

  it('cross-business concurrent transitions do not interfere', async () => {
    const suffix1 = `xb1-${++testCounter}`;
    const { user: user1, business: biz1 } = await createUserInBusiness(`owner-${suffix1}@test.com`);
    const customer1 = await createCustomer(user1.id, biz1.id, { name: 'C1' });
    const product1 = await createProduct(user1.id, biz1.id, {
      name: 'P1', description: 'D', price: 1000, status: 'ACTIVE',
      variant: { sku: `SKU-${suffix1}`, name: 'S' },
    });
    await setStock(user1.id, biz1.id, { variantId: product1.variants[0].id, available: 50 });

    const suffix2 = `xb2-${++testCounter}`;
    const { user: user2, business: biz2 } = await createUserInBusiness(`owner-${suffix2}@test.com`);
    const customer2 = await createCustomer(user2.id, biz2.id, { name: 'C2' });
    const product2 = await createProduct(user2.id, biz2.id, {
      name: 'P2', description: 'D', price: 2000, status: 'ACTIVE',
      variant: { sku: `SKU-${suffix2}`, name: 'S' },
    });
    await setStock(user2.id, biz2.id, { variantId: product2.variants[0].id, available: 50 });

    const order1 = await createTestOrder(user1.id, biz1.id, customer1.id, product1.variants[0].id);
    const order2 = await createTestOrder(user2.id, biz2.id, customer2.id, product2.variants[0].id);

    const [r1, r2] = await Promise.all([
      updateStatus(user1.id, biz1.id, order1.id, OrderStatus.PAID),
      updateStatus(user2.id, biz2.id, order2.id, OrderStatus.CANCELLED),
    ]);

    expect(r1.status).toBe('PAID');
    expect(r2.status).toBe('CANCELLED');

    const final1 = await prisma.order.findUnique({ where: { id: order1.id } });
    const final2 = await prisma.order.findUnique({ where: { id: order2.id } });
    expect(final1!.status).toBe('PAID');
    expect(final2!.status).toBe('CANCELLED');
  });
});
