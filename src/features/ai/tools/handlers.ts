import { AppError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import * as productService from '../../products/product.service';
import * as inventoryService from '../../products/inventory.service';
import * as deliveryZoneService from '../../delivery/delivery-zone.service';
import * as orderService from '../../orders/order.service';
import * as paymentService from '../../payments/payment.service';
import * as escalationService from '../../escalations/escalation.service';
import * as conversationService from '../../conversations/conversation.service';
import { ConversationControlState } from '@prisma/client';

export interface ToolHandlerContext {
  systemUserId: string;
  businessId: string;
  conversationId: string;
  customerId: string;
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<string> {
  try {
    switch (toolName) {
      case 'search_products':
        return await handleSearchProducts(args, ctx);
      case 'get_product':
        return await handleGetProduct(args, ctx);
      case 'check_stock':
        return await handleCheckStock(args, ctx);
      case 'list_delivery_zones':
        return await handleListDeliveryZones(ctx);
      case 'create_order':
        return await handleCreateOrder(args, ctx);
      case 'initiate_payment':
        return await handleInitiatePayment(args, ctx);
      case 'get_order':
        return await handleGetOrder(args, ctx);
      case 'escalate_to_human':
        return await handleEscalate(args, ctx);
      default:
        return JSON.stringify({
          error: true,
          code: 'VALIDATION_ERROR',
          message: `Unknown tool: ${toolName}`,
        });
    }
  } catch (error) {
    if (error instanceof AppError) {
      return JSON.stringify({
        error: true,
        code: error.code,
        message: error.message,
      });
    }
    logger.error('tool.execution_failed', {
      toolName,
      businessId: ctx.businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({
      error: true,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}

async function handleSearchProducts(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<string> {
  const query = args.query as string;
  const minPrice = args.minPrice as number | undefined;
  const maxPrice = args.maxPrice as number | undefined;

  const products = await productService.searchProducts(
    ctx.systemUserId,
    ctx.businessId,
    query,
    { minPrice, maxPrice },
  );

  return JSON.stringify(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        available: v.inventory?.available ?? 0,
      })),
    })),
  );
}

async function handleGetProduct(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<string> {
  const product = await productService.getProduct(
    ctx.systemUserId,
    ctx.businessId,
    args.productId as string,
  );

  return JSON.stringify({
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    variants: product.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      attributes: v.attributes,
      available: v.inventory?.available ?? 0,
    })),
  });
}

async function handleCheckStock(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<string> {
  const result = await inventoryService.checkAvailability(
    ctx.systemUserId,
    ctx.businessId,
    {
      variantId: args.variantId as string,
      quantity: args.quantity as number,
    },
  );

  return JSON.stringify(result);
}

async function handleListDeliveryZones(
  ctx: ToolHandlerContext,
): Promise<string> {
  const zones = await deliveryZoneService.listDeliveryZones(
    ctx.systemUserId,
    ctx.businessId,
  );

  return JSON.stringify(
    zones.map((z) => ({
      id: z.id,
      name: z.name,
      fee: z.fee,
      coverage: z.coverage,
    })),
  );
}

async function handleCreateOrder(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<string> {
  const rawItems = (args.items as Array<{ variantId?: string; productVariantId?: string; quantity: number }>) || [];
  const items = rawItems.map((i) => ({
    productVariantId: i.productVariantId || i.variantId || '',
    quantity: i.quantity,
  }));

  const order = await orderService.createOrder(
    ctx.systemUserId,
    ctx.businessId,
    {
      customerId: args.customerId as string,
      items,
    },
  );

  return JSON.stringify({
    id: order.id,
    status: order.status,
    totalAmount: order.totalAmount,
    items: order.items.map((i: { product: { name: string }; productVariant?: { name: string } | null; quantity: number; unitPrice: number }) => ({
      productName: i.product.name,
      variantName: i.productVariant?.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
  });
}

async function handleInitiatePayment(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<string> {
  const { attempt, paymentLink } = await paymentService.initiatePayment(
    ctx.systemUserId,
    ctx.businessId,
    args.orderId as string,
  );

  return JSON.stringify({
    id: attempt.id,
    status: attempt.status,
    transactionReference: attempt.transactionReference,
    amount: attempt.amount,
    currency: attempt.currency,
    paymentLink,
  });
}

async function handleGetOrder(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<string> {
  const order = await orderService.getOrder(
    ctx.systemUserId,
    ctx.businessId,
    args.orderId as string,
  );

  return JSON.stringify({
    id: order.id,
    status: order.status,
    totalAmount: order.totalAmount,
    items: order.items.map((i: { product: { name: string }; quantity: number; unitPrice: number }) => ({
      productName: i.product.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
    paymentAttempts: order.paymentAttempts.map((pa: { status: string; amount: number }) => ({
      status: pa.status,
      amount: pa.amount,
    })),
  });
}

async function handleEscalate(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<string> {
  const reason = args.reason as string;
  const conversationId =
    (args.conversationId as string) || ctx.conversationId;

  await escalationService.createEscalation(
    ctx.systemUserId,
    ctx.businessId,
    conversationId,
    { reason },
  );

  const conversation = await conversationService.getConversation(
    ctx.systemUserId,
    ctx.businessId,
    conversationId,
  );

  if (conversation.controlState === ConversationControlState.AI_CONTROLLED) {
    await conversationService.updateControlState(
      ctx.systemUserId,
      ctx.businessId,
      conversationId,
      ConversationControlState.AI_CONTROLLED,
      ConversationControlState.PENDING_HANDOFF,
    );
  }

  return JSON.stringify({
    escalated: true,
    reason,
    conversationId,
  });
}
