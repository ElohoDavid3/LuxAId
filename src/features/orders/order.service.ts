import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { requireScope } from '../auth/authorization';
import { logAudit } from '../auth/audit';
import type { Prisma } from '@prisma/client';
import { OrderStatus } from '@prisma/client';

// Types for order creation input
export type OrderCreateInput = {
  customerId: string;
  items: Array<{ productVariantId?: string; variantId?: string; quantity: number }>;
};

/**
 * Create a new order. Validates inventory, reserves stock, calculates total amount,
 * and creates the Order record with status AWAITING_PAYMENT.
 */
export async function createOrder(
  userId: string,
  businessId: string,
  input: OrderCreateInput,
) {
  // Authorize the caller
  await requireScope(userId, businessId, 'orders');

  if (!input.items.length) {
    throw new AppError('VALIDATION_ERROR', 'Order must contain at least one item');
  }

  // Validate customer existence within the business boundary
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, businessId },
  });
  if (!customer) {
    throw new AppError('UNKNOWN_CUSTOMER', 'Customer not found');
  }

  // Load product variants and their inventories
  const normalizedItems = input.items.map((i) => ({
    productVariantId: (i.productVariantId || i.variantId || '').trim(),
    quantity: i.quantity,
  }));
  const variantIds = normalizedItems.map((i) => i.productVariantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, businessId },
    select: {
      id: true,
      productId: true,
      product: { select: { id: true, price: true } },
      inventory: { select: { id: true, available: true, reserved: true } },
    },
  });

  if (variants.length !== variantIds.length) {
    throw new AppError('UNKNOWN_PRODUCT', 'One or more product variants not found');
  }

  // Verify inventory and compute total amount
  let totalAmount = 0;
  for (const item of normalizedItems) {
    const variant = variants.find((v) => v.id === item.productVariantId);
    if (!variant) {
      throw new AppError('UNKNOWN_PRODUCT', `Variant ${item.productVariantId} not found`);
    }
    if (!variant.inventory || variant.inventory.available < item.quantity) {
      throw new AppError('INSUFFICIENT_STOCK', `Variant ${variant.id} out of stock`);
    }
    totalAmount += variant.product.price * item.quantity;
  }

  // Transaction: create order, order items, and reserve inventory
  const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.order.create({
      data: {
        businessId,
        customerId: input.customerId,
        status: OrderStatus.AWAITING_PAYMENT,
        totalAmount,
        items: {
          create: normalizedItems.map((i) => {
            const variant = variants.find((v) => v.id === i.productVariantId)!;
            return {
              businessId,
              productId: variant.productId,
              productVariantId: i.productVariantId,
              quantity: i.quantity,
              unitPrice: variant.product.price,
            };
          }),
        },
      },
      include: { items: { include: { product: true, productVariant: true } } },
    });

    // Reserve inventory for each line item
    for (const item of normalizedItems) {
      const variant = variants.find((v) => v.id === item.productVariantId)!;
      await tx.inventory.update({
        where: { id: variant.inventory!.id },
        data: {
          available: { decrement: item.quantity },
          reserved: { increment: item.quantity },
        },
      });
    }
    return created;
  });

  await logAudit({
    businessId,
    eventType: 'ORDER_CREATED',
    actorType: 'USER',
    actorId: userId,
    payload: { orderId: order.id, totalAmount },
  });

  return order;
}

/** Retrieve a single order with its items and payment attempts */
export async function getOrder(userId: string, businessId: string, orderId: string) {
  await requireScope(userId, businessId, 'orders');
  const order = await prisma.order.findUnique({
    where: { id: orderId, businessId },
    include: { items: { include: { product: true, productVariant: true } }, paymentAttempts: true },
  });
  if (!order) {
    throw new AppError('UNKNOWN_ORDER', 'Order not found');
  }
  return order;
}

/** List orders for a business with simple pagination */
export async function listOrders(
  userId: string,
  businessId: string,
  args: { skip?: number; take?: number } = {}
) {
  await requireScope(userId, businessId, 'orders');
  const orders = await prisma.order.findMany({
    where: { businessId },
    skip: args.skip,
    take: args.take ?? 20,
    orderBy: { createdAt: 'desc' },
  });
  return orders;
}

/** Update order status, enforcing a simple state machine */
export async function updateStatus(
  userId: string,
  businessId: string,
  orderId: string,
  newStatus: OrderStatus,
) {
  await requireScope(userId, businessId, 'orders');
  const order = await prisma.order.findUnique({ where: { id: orderId, businessId } });
  if (!order) {
    throw new AppError('UNKNOWN_ORDER', 'Order not found');
  }

  const allowed: Record<string, string[]> = {
    DRAFT: ['AWAITING_PAYMENT'],
    AWAITING_PAYMENT: ['PAID', 'CANCELLED'],
    PAID: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['READY_FOR_DELIVERY', 'CANCELLED'],
    READY_FOR_DELIVERY: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: [],
    FAILED: [],
    REFUNDED: [],
  };
  const current = order.status as keyof typeof allowed;
  if (!allowed[current].includes(newStatus as string)) {
    throw new AppError(
      'STATE_CONFLICT',
      `Cannot transition order from ${current} to ${newStatus}`,
    );
  }

  const updated = await prisma.order.update({
    where: { id: orderId, businessId },
    data: { status: newStatus },
  });

  await logAudit({
    businessId,
    eventType: 'ORDER_STATUS_UPDATED',
    actorType: 'USER',
    actorId: userId,
    payload: { orderId, from: current, to: newStatus },
  });

  return updated;
}

/** Record a payment attempt and transition the order to PAID if successful */
export async function addPaymentAttempt(
  userId: string,
  businessId: string,
  orderId: string,
  attempt: Prisma.PaymentAttemptCreateInput,
) {
  await requireScope(userId, businessId, 'payments');

  // Idempotency – unique transactionReference
  const existing = await prisma.paymentAttempt.findUnique({
    where: { transactionReference: attempt.transactionReference as string },
  });
  if (existing) {
    return existing;
  }

  const created = await prisma.paymentAttempt.create({
    data: { ...attempt, business: { connect: { id: businessId } }, order: { connect: { id: orderId } } },
  });

  if (created.status === 'SUCCESSFUL') {
    await prisma.order.update({
      where: { id: orderId, businessId },
      data: { status: 'PAID' },
    });
  }

  await logAudit({
    businessId,
    eventType: 'PAYMENT_ATTEMPT_RECORDED',
    actorType: 'USER',
    actorId: userId,
    payload: { orderId, paymentAttemptId: created.id, status: created.status },
  });

  return created;
}
