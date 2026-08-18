import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { OrderStatus, Prisma } from '@prisma/client';
import { logAudit } from '../auth/audit';
import * as inventoryService from '../products/inventory.service';
import { createOrderSchema, parseOrThrow } from './validation';

const ORDERS_SCOPE = 'orders' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, ORDERS_SCOPE);
}

const orderInclude = {
  items: {
    include: { product: true, productVariant: true },
    orderBy: { createdAt: 'asc' as const },
  },
  customer: true,
  paymentAttempts: true,
  delivery: true,
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

export async function createOrder(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<OrderWithRelations> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(createOrderSchema, input);

  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, businessId: membership.businessId },
    select: { id: true },
  });
  if (!customer) {
    throw new AppError('UNKNOWN_CUSTOMER', 'Customer not found.');
  }

  const variantIds = data.items.map((item) => item.variantId);
  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: variantIds },
      businessId: membership.businessId,
    },
    include: {
      product: { select: { id: true, price: true, status: true } },
      inventory: { select: { id: true, available: true } },
    },
  });

  if (variants.length !== variantIds.length) {
    throw new AppError('UNKNOWN_PRODUCT', 'One or more variants not found.');
  }

  for (const variant of variants) {
    if (variant.product.status !== 'ACTIVE') {
      throw new AppError(
        'PRODUCT_UNAVAILABLE',
        `Product "${variant.product.id}" is not active.`,
      );
    }
  }

  const variantMap = new Map(variants.map((v) => [v.id, v]));

  let totalAmount = 0;
  for (const item of data.items) {
    const variant = variantMap.get(item.variantId)!;
    totalAmount += variant.product.price * item.quantity;
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        businessId: membership.businessId,
        customerId: data.customerId,
        status: OrderStatus.DRAFT,
        totalAmount,
      },
    });

    for (const item of data.items) {
      const variant = variantMap.get(item.variantId)!;
      await tx.orderItem.create({
        data: {
          businessId: membership.businessId,
          orderId: created.id,
          productId: variant.product.id,
          productVariantId: variant.id,
          quantity: item.quantity,
          unitPrice: variant.product.price,
        },
      });
    }

    if (data.deliveryZoneId) {
      const zone = await tx.deliveryZone.findFirst({
        where: {
          id: data.deliveryZoneId,
          businessId: membership.businessId,
        },
        select: { id: true, fee: true },
      });
      if (!zone) {
        throw new AppError('VALIDATION_ERROR', 'Delivery zone not found.');
      }
      await tx.delivery.create({
        data: {
          businessId: membership.businessId,
          orderId: created.id,
          deliveryZoneId: zone.id,
          fee: zone.fee,
          status: 'PENDING',
        },
      });
    }

    await tx.order.update({
      where: { id: created.id },
      data: { status: OrderStatus.AWAITING_PAYMENT },
    });

    return created;
  });

  for (const item of data.items) {
    await inventoryService.reserve(userId, requestedBusinessId, {
      variantId: item.variantId,
      quantity: item.quantity,
      orderId: order.id,
    });
  }

  await logAudit({
    businessId: membership.businessId,
    eventType: 'ORDER_CREATED',
    actorType: 'AI',
    actorId: userId,
    payload: { orderId: order.id, customerId: data.customerId, totalAmount },
  });

  await logAudit({
    businessId: membership.businessId,
    eventType: 'ORDER_STATUS_CHANGED',
    actorType: 'AI',
    actorId: userId,
    payload: {
      orderId: order.id,
      from: OrderStatus.DRAFT,
      to: OrderStatus.AWAITING_PAYMENT,
    },
  });

  return prisma.order.findFirstOrThrow({
    where: { id: order.id, businessId: membership.businessId },
    include: orderInclude,
  });
}

export async function getOrder(
  userId: string,
  requestedBusinessId: string,
  orderId: string,
): Promise<OrderWithRelations> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId: membership.businessId },
    include: orderInclude,
  });
  if (!order) {
    throw new AppError('UNKNOWN_ORDER', 'Order not found.');
  }
  return order;
}
