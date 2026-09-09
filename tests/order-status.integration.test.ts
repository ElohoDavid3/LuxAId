import { prisma } from '../src/lib/prisma';
import { updateStatus, createOrder } from '../src/features/orders/order.service';
import { createUserInBusiness, resetDatabase, markOrderPaid } from './helpers';
import { OrderStatus } from '@prisma/client';
import { AppError } from '../src/lib/errors';

describe('Order status update service', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows valid status transitions (verified payment -> PAID -> PROCESSING)', async () => {
    const { user, business } = await createUserInBusiness('order-status-owner@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Status Customer' },
    });
    const variant = await prisma.productVariant.create({
      data: {
        businessId: business.id,
        productId: (await prisma.product.create({
          data: { businessId: business.id, name: 'Prod', description: 'Desc', price: 1000, status: 'ACTIVE' },
        })).id,
        name: 'Default',
        sku: 'SKU-STATUS-1',
        attributes: {},
        inventory: { create: { businessId: business.id, available: 10, reserved: 0 } },
      },
    });

    const order = await createOrder(user.id, business.id, {
      customerId: customer.id,
      items: [{ productVariantId: variant.id, quantity: 1 }],
    });

    expect(order.status).toBe(OrderStatus.AWAITING_PAYMENT);

    // PAID is only reachable through the verified payment path.
    await markOrderPaid(order.id);
    const paidOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(paidOrder?.status).toBe(OrderStatus.PAID);

    // Transition PAID -> PROCESSING
    const processingOrder = await updateStatus(user.id, business.id, order.id, OrderStatus.PROCESSING);
    expect(processingOrder.status).toBe(OrderStatus.PROCESSING);
  });

  it('rejects manual transition to PAID (AWAITING_PAYMENT -> PAID is not allowed)', async () => {
    const { user, business } = await createUserInBusiness('invalid-transition@test.com');
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: 'Customer' },
    });

    const order = await prisma.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        status: OrderStatus.AWAITING_PAYMENT,
        totalAmount: 5000,
      },
    });

    await expect(
      updateStatus(user.id, business.id, order.id, OrderStatus.PAID),
    ).rejects.toThrow(AppError);
  });

  it('enforces business tenant isolation on status updates', async () => {
    const { user: userA, business: businessA } = await createUserInBusiness('user-a-order@test.com');
    const { business: businessB } = await createUserInBusiness('user-b-order@test.com');
    const customerB = await prisma.customer.create({
      data: { businessId: businessB.id, name: 'Customer B' },
    });

    const orderB = await prisma.order.create({
      data: {
        businessId: businessB.id,
        customerId: customerB.id,
        status: OrderStatus.AWAITING_PAYMENT,
        totalAmount: 5000,
      },
    });

    await expect(
      updateStatus(userA.id, businessB.id, orderB.id, OrderStatus.PAID),
    ).rejects.toThrow(AppError);
  });
});
