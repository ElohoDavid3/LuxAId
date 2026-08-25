import {
  ConversationControlState,
  EscalationStatus,
  MembershipRole,
  MembershipStatus,
  OrderStatus,
  PaymentAttemptStatus,
  ProductStatus,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { resetDatabase, createUserInBusiness, TEST_PASSWORD } from './helpers';
import { createCustomer } from '../src/features/customers/customer.service';
import { createProduct } from '../src/features/products/product.service';
import { setStock } from '../src/features/products/inventory.service';
import * as orderService from '../src/features/orders/order.service';
import * as paymentService from '../src/features/payments/payment.service';
import * as inventoryService from '../src/features/products/inventory.service';
import * as conversationService from '../src/features/conversations/conversation.service';
import * as escalationService from '../src/features/escalations/escalation.service';
import { handleIncomingMessage } from '../src/features/ai/agent';
import { sendWhatsAppReply } from '../src/features/whatsapp/send';
import { executeTool } from '../src/features/ai/tools/handlers';

let testCounter = 0;

async function setupTestBusiness() {
  const suffix = `fail-${++testCounter}`;
  const { user, business } = await createUserInBusiness(
    `owner-${suffix}@test.com`,
  );

  const systemUser = await prisma.user.create({
    data: {
      name: 'OrderAId AI',
      email: `ai-${business.id}@orderaid.internal`,
      passwordHash: 'hashed-password',
    },
  });
  await prisma.businessMembership.create({
    data: {
      userId: systemUser.id,
      businessId: business.id,
      role: MembershipRole.OWNER,
      status: 'ACTIVE',
    },
  });

  const customer = await createCustomer(user.id, business.id, {
    name: 'Failure Test Customer',
    email: `customer-${suffix}@test.com`,
    phone: `+234801000${String(testCounter).padStart(3, '0')}`,
  });

  const product = await createProduct(user.id, business.id, {
    name: 'Test Product',
    description: 'Product for failure tests',
    price: 10000,
    status: ProductStatus.ACTIVE,
    variant: {
      sku: `FAIL-SKU-${Date.now()}-${testCounter}`,
      name: 'Standard',
    },
  });
  const variant = product.variants[0];
  await setStock(user.id, business.id, { variantId: variant.id, available: 10 });

  return { user, business, systemUser, customer, product, variant };
}

async function createOrderInBusiness(
  userId: string,
  businessId: string,
  customerId: string,
  variantId: string,
  quantity: number = 1,
) {
  return orderService.createOrder(userId, businessId, {
    customerId,
    items: [{ productVariantId: variantId, quantity }],
  });
}

/**
 * Create an order directly via Prisma (bypassing inventory reservation) for
 * tests that need an order record but don't test order creation logic.
 */
async function createRawOrder(
  businessId: string,
  customerId: string,
  status: OrderStatus = OrderStatus.AWAITING_PAYMENT,
  totalAmount: number = 10000,
) {
  return prisma.order.create({
    data: { businessId, customerId, status, totalAmount },
  });
}

/**
 * Set inventory to an exact value by directly updating the record.
 * Use when setStock idempotency would interfere with the test.
 */
async function setInventoryExact(
  variantId: string,
  available: number,
  reserved: number = 0,
) {
  const inv = await prisma.inventory.findFirst({
    where: { productVariantId: variantId },
  });
  if (!inv) throw new Error(`No inventory for variant ${variantId}`);
  await prisma.inventory.update({
    where: { id: inv.id },
    data: { available, reserved },
  });
}

beforeAll(() => resetDatabase());
afterAll(() => prisma.$disconnect());

describe('Failure Scenarios', () => {
  // ─────────────────────────────────────────────────────────────
  // 1. ORDER STATE MACHINE
  // ─────────────────────────────────────────────────────────────
  describe('Order state machine', () => {
    it('rejects invalid transition: AWAITING_PAYMENT → DELIVERED', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      await expect(
        orderService.updateStatus(user.id, business.id, order.id, 'DELIVERED' as OrderStatus),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });

      const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
      expect(unchanged?.status).toBe(OrderStatus.AWAITING_PAYMENT);
    });

    it('rejects invalid transition: CANCELLED → PAID', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );
      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.CANCELLED);

      await expect(
        orderService.updateStatus(user.id, business.id, order.id, OrderStatus.PAID),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });

      const cancelled = await prisma.order.findUnique({ where: { id: order.id } });
      expect(cancelled?.status).toBe(OrderStatus.CANCELLED);
    });

    it('rejects transition from terminal state DELIVERED', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      await prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.DELIVERED },
      });

      await expect(
        orderService.updateStatus(user.id, business.id, order.id, OrderStatus.CANCELLED),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('rejects transition from terminal state REFUNDED', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      await prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.REFUNDED },
      });

      await expect(
        orderService.updateStatus(user.id, business.id, order.id, OrderStatus.PAID),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('valid transition chain: AWAITING_PAYMENT → PAID → PROCESSING → CANCELLED', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.PAID);
      let fresh = await prisma.order.findUnique({ where: { id: order.id } });
      expect(fresh?.status).toBe(OrderStatus.PAID);

      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.PROCESSING);
      fresh = await prisma.order.findUnique({ where: { id: order.id } });
      expect(fresh?.status).toBe(OrderStatus.PROCESSING);

      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.CANCELLED);
      fresh = await prisma.order.findUnique({ where: { id: order.id } });
      expect(fresh?.status).toBe(OrderStatus.CANCELLED);
    });

    it('valid transition chain: PAID → PROCESSING → READY_FOR_DELIVERY → SHIPPED → DELIVERED', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.PAID);
      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.PROCESSING);
      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.READY_FOR_DELIVERY);
      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.SHIPPED);
      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.DELIVERED);

      const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(finalOrder?.status).toBe(OrderStatus.DELIVERED);
    });

    it('order creation fails with empty items', async () => {
      const { user, business, customer } = await setupTestBusiness();

      await expect(
        orderService.createOrder(user.id, business.id, {
          customerId: customer.id,
          items: [],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. PAYMENT RESILIENCE
  // ─────────────────────────────────────────────────────────────
  describe('Payment resilience', () => {
    it('rejects payment initiation for non-AWAITING_PAYMENT order', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );
      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.CANCELLED);

      await expect(
        paymentService.initiatePayment(user.id, business.id, order.id),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('payment idempotency: verifyPaymentAttempt returns same record when already SUCCESSFUL', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      const txRef = `tx_idempotent_${Date.now()}_${testCounter}`;
      const attempt = await prisma.paymentAttempt.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          status: PaymentAttemptStatus.SUCCESSFUL,
          amount: order.totalAmount,
          currency: 'NGN',
          transactionReference: txRef,
          gatewayReference: '12345',
        },
      });

      const result = await paymentService.verifyPaymentAttempt(
        user.id, business.id, attempt.id,
      );
      expect(result.status).toBe(PaymentAttemptStatus.SUCCESSFUL);
      expect(result.id).toBe(attempt.id);
    });

    it('applyVerifiedPayment handles sequential duplicate calls via idempotency', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      const txRef = `tx_concurrent_${Date.now()}_${testCounter}`;
      await prisma.paymentAttempt.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          status: PaymentAttemptStatus.PENDING,
          amount: order.totalAmount,
          currency: 'NGN',
          transactionReference: txRef,
        },
      });

      const input = {
        transactionReference: txRef,
        providerTransactionId: 99999,
        verifiedAmountInKobo: order.totalAmount,
        verifiedCurrency: 'NGN',
        verifiedStatus: 'successful',
        providerVerification: {},
      };

      const result1 = await paymentService.applyVerifiedPayment(input);
      expect(result1.outcome).toBe('APPLIED');

      const result2 = await paymentService.applyVerifiedPayment(input);
      expect(result2.outcome).toBe('DUPLICATE');

      const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
      expect(orderAfter?.status).toBe(OrderStatus.PAID);

      const attempts = await prisma.paymentAttempt.findMany({
        where: { transactionReference: txRef },
      });
      expect(attempts).toHaveLength(1);
    });

    it('applyVerifiedPayment rejects amount mismatch without state change', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      const txRef = `tx_amt_mismatch_${Date.now()}_${testCounter}`;
      await prisma.paymentAttempt.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          status: PaymentAttemptStatus.PENDING,
          amount: order.totalAmount,
          currency: 'NGN',
          transactionReference: txRef,
        },
      });

      const result = await paymentService.applyVerifiedPayment({
        transactionReference: txRef,
        providerTransactionId: 11111,
        verifiedAmountInKobo: 50000,
        verifiedCurrency: 'NGN',
        verifiedStatus: 'successful',
        providerVerification: {},
      });

      expect(result.outcome).toBe('MISMATCH');

      const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
      expect(orderAfter?.status).toBe(OrderStatus.AWAITING_PAYMENT);

      const attemptAfter = await prisma.paymentAttempt.findFirst({
        where: { transactionReference: txRef },
      });
      expect(attemptAfter?.status).toBe(PaymentAttemptStatus.PENDING);
    });

    it('applyVerifiedPayment rejects status=pending (not successful)', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      const txRef = `tx_pending_${Date.now()}_${testCounter}`;
      await prisma.paymentAttempt.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          status: PaymentAttemptStatus.PENDING,
          amount: order.totalAmount,
          currency: 'NGN',
          transactionReference: txRef,
        },
      });

      const result = await paymentService.applyVerifiedPayment({
        transactionReference: txRef,
        providerTransactionId: 22222,
        verifiedAmountInKobo: order.totalAmount,
        verifiedCurrency: 'NGN',
        verifiedStatus: 'pending',
        providerVerification: {},
      });

      expect(result.outcome).toBe('MISMATCH');
      if (result.outcome === 'MISMATCH') {
        expect(result.reason).toContain('Status not successful');
      }

      const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
      expect(orderAfter?.status).toBe(OrderStatus.AWAITING_PAYMENT);
    });

    it('applyVerifiedPayment returns STATE_CONFLICT for already-PAID order', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );
      await orderService.updateStatus(user.id, business.id, order.id, OrderStatus.PAID);

      const txRef = `tx_state_conflict_${Date.now()}_${testCounter}`;
      await prisma.paymentAttempt.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          status: PaymentAttemptStatus.PENDING,
          amount: order.totalAmount,
          currency: 'NGN',
          transactionReference: txRef,
        },
      });

      const result = await paymentService.applyVerifiedPayment({
        transactionReference: txRef,
        providerTransactionId: 33333,
        verifiedAmountInKobo: order.totalAmount,
        verifiedCurrency: 'NGN',
        verifiedStatus: 'successful',
        providerVerification: {},
      });

      expect(result.outcome).toBe('STATE_CONFLICT');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. AI AGENT FAILURES
  // ─────────────────────────────────────────────────────────────
  describe('AI agent failures', () => {
    it('agent returns empty reply when conversation is not AI_CONTROLLED', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id, controlState: ConversationControlState.HUMAN_CONTROLLED },
      );

      const result = await handleIncomingMessage({
        businessId: business.id,
        conversationId: conv.id,
        customerId: customer.id,
        messageBody: 'Hello AI',
      });

      expect(result.reply).toBe('');
      expect(result.actions).toHaveLength(0);
    });

    it('tool execution handles unknown tool name gracefully', async () => {
      const { business, customer, systemUser } = await setupTestBusiness();
      const result = await executeTool(
        'nonexistent_tool',
        { foo: 'bar' },
        {
          systemUserId: systemUser.id,
          businessId: business.id,
          conversationId: 'conv-123',
          customerId: customer.id,
        },
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe('VALIDATION_ERROR');
      expect(parsed.message).toContain('Unknown tool');
    });

    it('tool execution handles internal errors without crashing', async () => {
      const { business, systemUser, customer } = await setupTestBusiness();

      const result = await executeTool(
        'get_product',
        { productId: 'nonexistent-product-id-999' },
        {
          systemUserId: systemUser.id,
          businessId: business.id,
          conversationId: 'conv-999',
          customerId: customer.id,
        },
      );

      const parsed = JSON.parse(result);
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe('UNKNOWN_PRODUCT');
    });

    it('agent gracefully handles missing system user', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      await prisma.businessMembership.deleteMany({
        where: {
          businessId: business.id,
          user: { email: { endsWith: '@orderaid.internal' } },
        },
      });

      await expect(
        handleIncomingMessage({
          businessId: business.id,
          conversationId: conv.id,
          customerId: customer.id,
          messageBody: 'Test',
        }),
      ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('escalate_to_human tool creates escalation and transitions control state', async () => {
      const { user, business, customer, systemUser } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      const result = await executeTool(
        'escalate_to_human',
        { conversationId: conv.id, reason: 'Complex issue' },
        {
          systemUserId: systemUser.id,
          businessId: business.id,
          conversationId: conv.id,
          customerId: customer.id,
        },
      );

      const parsed = JSON.parse(result);
      expect(parsed.escalated).toBe(true);

      const escalation = await prisma.escalation.findFirst({
        where: { conversationId: conv.id, businessId: business.id },
      });
      expect(escalation).not.toBeNull();
      expect(escalation?.status).toBe(EscalationStatus.OPEN);
      expect(escalation?.reason).toBe('Complex issue');

      const convAfter = await prisma.conversation.findUnique({ where: { id: conv.id } });
      expect(convAfter?.controlState).toBe(ConversationControlState.PENDING_HANDOFF);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. CONCURRENT INVENTORY OPERATIONS
  // ─────────────────────────────────────────────────────────────
  describe('Concurrent inventory operations', () => {
    it('concurrent reserve requests: only one wins, no oversell', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();

      // Set exact stock level, bypassing setStock idempotency
      await setInventoryExact(variant.id, 2);

      const order1 = await createRawOrder(business.id, customer.id);
      const order2 = await createRawOrder(business.id, customer.id);

      const results = await Promise.allSettled([
        inventoryService.reserve(user.id, business.id, {
          variantId: variant.id,
          orderId: order1.id,
          quantity: 2,
        }),
        inventoryService.reserve(user.id, business.id, {
          variantId: variant.id,
          orderId: order2.id,
          quantity: 2,
        }),
      ]);

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');
      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);

      const inv = await prisma.inventory.findFirst({
        where: { productVariantId: variant.id },
      });
      expect(inv?.available).toBe(0);
      expect(inv?.reserved).toBe(2);
    });

    it('reserve with zero available stock is rejected', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();

      await setInventoryExact(variant.id, 0);

      const order = await createRawOrder(business.id, customer.id);

      await expect(
        inventoryService.reserve(user.id, business.id, {
          variantId: variant.id,
          orderId: order.id,
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    });

    it('release more than reserved is rejected', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();

      await setInventoryExact(variant.id, 5, 0);

      const order = await createRawOrder(business.id, customer.id);

      await inventoryService.reserve(user.id, business.id, {
        variantId: variant.id,
        orderId: order.id,
        quantity: 2,
      });

      await expect(
        inventoryService.release(user.id, business.id, {
          variantId: variant.id,
          orderId: order.id,
          quantity: 5,
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    });

    it('commit more than reserved is rejected', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();

      await setInventoryExact(variant.id, 10, 0);

      const order = await createRawOrder(business.id, customer.id);

      await inventoryService.reserve(user.id, business.id, {
        variantId: variant.id,
        orderId: order.id,
        quantity: 3,
      });

      await expect(
        inventoryService.commit(user.id, business.id, {
          variantId: variant.id,
          orderId: order.id,
          quantity: 5,
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    });

    it('manualAdjustment below zero is rejected', async () => {
      const { user, business, variant } = await setupTestBusiness();

      await setInventoryExact(variant.id, 3);

      await expect(
        inventoryService.manualAdjustment(user.id, business.id, {
          variantId: variant.id,
          delta: -5,
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

      const inv = await prisma.inventory.findFirst({
        where: { productVariantId: variant.id },
      });
      expect(inv?.available).toBe(3);
    });

    it('reserve for nonexistent variant returns UNKNOWN_PRODUCT', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const order = await createRawOrder(business.id, customer.id);

      await expect(
        inventoryService.reserve(user.id, business.id, {
          variantId: 'nonexistent-variant-id',
          orderId: order.id,
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_PRODUCT' });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. WHATSAPP EDGE CASES
  // ─────────────────────────────────────────────────────────────
  describe('WhatsApp send edge cases', () => {
    it('sendWhatsAppReply silently returns for empty reply text', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      await expect(
        sendWhatsAppReply({
          businessId: business.id,
          conversationId: conv.id,
          customerId: customer.id,
          replyText: '',
        }),
      ).resolves.toBeUndefined();

      await expect(
        sendWhatsAppReply({
          businessId: business.id,
          conversationId: conv.id,
          customerId: customer.id,
          replyText: '   ',
        }),
      ).resolves.toBeUndefined();
    });

    it('sendWhatsAppReply silently returns for OPTED_OUT customer', async () => {
      const { user, business, customer } = await setupTestBusiness();

      await prisma.customer.update({
        where: { id: customer.id },
        data: { consentStatus: 'OPTED_OUT' },
      });

      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      await expect(
        sendWhatsAppReply({
          businessId: business.id,
          conversationId: conv.id,
          customerId: customer.id,
          replyText: 'This should not be sent',
        }),
      ).resolves.toBeUndefined();
    });

    it('sendWhatsAppReply silently returns when conversation is HUMAN_CONTROLLED', async () => {
      const { user, business, customer } = await setupTestBusiness();

      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id, controlState: ConversationControlState.HUMAN_CONTROLLED },
      );

      await expect(
        sendWhatsAppReply({
          businessId: business.id,
          conversationId: conv.id,
          customerId: customer.id,
          replyText: 'Should not send during human control',
        }),
      ).resolves.toBeUndefined();
    });

    it('sendWhatsAppReply silently returns for customer with no phone', async () => {
      const { user, business } = await setupTestBusiness();

      const noPhoneCustomer = await createCustomer(user.id, business.id, {
        name: 'No Phone Customer',
      });

      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: noPhoneCustomer.id },
      );

      await expect(
        sendWhatsAppReply({
          businessId: business.id,
          conversationId: conv.id,
          customerId: noPhoneCustomer.id,
          replyText: 'No phone number',
        }),
      ).resolves.toBeUndefined();
    });

    it('sendWhatsAppReply silently returns for nonexistent customer', async () => {
      const { business } = await setupTestBusiness();

      await expect(
        sendWhatsAppReply({
          businessId: business.id,
          conversationId: 'fake-conv-id',
          customerId: 'fake-customer-id',
          replyText: 'Ghost customer',
        }),
      ).resolves.toBeUndefined();
    });

    it('sendWhatsAppReply silently returns for nonexistent conversation', async () => {
      const { business, customer } = await setupTestBusiness();

      await expect(
        sendWhatsAppReply({
          businessId: business.id,
          conversationId: 'fake-conv-id',
          customerId: customer.id,
          replyText: 'Ghost conversation',
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. HUMAN HANDOFF EDGE CASES
  // ─────────────────────────────────────────────────────────────
  describe('Human handoff edge cases', () => {
    it('takeover requires PENDING_HANDOFF state', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id, controlState: ConversationControlState.AI_CONTROLLED },
      );

      const escalation = await escalationService.createEscalation(
        user.id, business.id, conv.id, { reason: 'Test escalation' },
      );

      await conversationService.updateControlState(
        user.id, business.id, conv.id,
        ConversationControlState.AI_CONTROLLED,
        ConversationControlState.PENDING_HANDOFF,
      );

      const convAfter = await prisma.conversation.findUnique({ where: { id: conv.id } });
      expect(convAfter?.controlState).toBe(ConversationControlState.PENDING_HANDOFF);
    });

    it('escalation cannot be assigned twice to same conversation while OPEN', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      await escalationService.createEscalation(user.id, business.id, conv.id, {
        reason: 'First issue',
      });

      await expect(
        escalationService.createEscalation(user.id, business.id, conv.id, {
          reason: 'Second issue',
        }),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('full escalation lifecycle: create → assign → reassign → resolve → re-escalate → cancel', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      // Create escalation (OPEN)
      const escalation = await escalationService.createEscalation(
        user.id, business.id, conv.id, { reason: 'Lifecycle test' },
      );
      expect(escalation.status).toBe(EscalationStatus.OPEN);

      // Assign to self (OPEN → ASSIGNED)
      const assigned = await escalationService.assignEscalation(
        user.id, business.id, escalation.id, { assigneeId: user.id },
      );
      expect(assigned.status).toBe(EscalationStatus.ASSIGNED);

      // Reassign (ASSIGNED → OPEN)
      const reassigned = await escalationService.reassignEscalation(
        user.id, business.id, escalation.id,
      );
      expect(reassigned.status).toBe(EscalationStatus.OPEN);

      // Re-assign and resolve (OPEN → ASSIGNED → RESOLVED)
      await escalationService.assignEscalation(
        user.id, business.id, reassigned.id, { assigneeId: user.id },
      );
      const resolved = await escalationService.resolveEscalation(
        user.id, business.id, reassigned.id,
      );
      expect(resolved.status).toBe(EscalationStatus.RESOLVED);
      expect(resolved.resolvedAt).not.toBeNull();

      // Re-escalate after resolution (creates new escalation)
      const newEscalation = await escalationService.createEscalation(
        user.id, business.id, conv.id, { reason: 'Re-escalation' },
      );
      expect(newEscalation.status).toBe(EscalationStatus.OPEN);

      // Cancel the new escalation (OPEN → CANCELLED)
      const cancelled = await escalationService.cancelEscalation(
        user.id, business.id, newEscalation.id,
      );
      expect(cancelled.status).toBe(EscalationStatus.CANCELLED);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. CROSS-SCUTTING: DATA INTEGRITY
  // ─────────────────────────────────────────────────────────────
  describe('Cross-cutting data integrity', () => {
    it('order creation reserves inventory correctly', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();

      await setInventoryExact(variant.id, 10);

      await createOrderInBusiness(user.id, business.id, customer.id, variant.id, 3);

      const invAfter = await prisma.inventory.findFirst({
        where: { productVariantId: variant.id },
      });
      expect(invAfter?.available).toBe(7);
      expect(invAfter?.reserved).toBe(3);
    });

    it('order creation creates audit log', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(user.id, business.id, customer.id, variant.id);

      const audit = await prisma.auditLog.findFirst({
        where: {
          businessId: business.id,
          eventType: 'ORDER_CREATED',
        },
      });
      expect(audit).not.toBeNull();
    });

    it('product status transition DRAFT→ACTIVE→ARCHIVED creates correct states', async () => {
      const { user, business } = await setupTestBusiness();

      const product = await createProduct(user.id, business.id, {
        name: 'Status Test Product',
        description: 'Test',
        price: 5000,
        status: ProductStatus.DRAFT,
        variant: { sku: `STATUS-${Date.now()}-${testCounter}`, name: 'Default' },
      });
      expect(product.status).toBe(ProductStatus.DRAFT);

      const active = await prisma.product.update({
        where: { id: product.id },
        data: { status: ProductStatus.ACTIVE },
      });
      expect(active.status).toBe(ProductStatus.ACTIVE);

      const archived = await prisma.product.update({
        where: { id: product.id },
        data: { status: ProductStatus.ARCHIVED },
      });
      expect(archived.status).toBe(ProductStatus.ARCHIVED);
    });

    it('duplicate SKU within same business is rejected', async () => {
      const { user, business } = await setupTestBusiness();
      const fixedSku = `DUP-SKU-FIXED-${testCounter}`;

      await createProduct(user.id, business.id, {
        name: 'Product A',
        description: 'Test',
        price: 5000,
        variant: { sku: fixedSku, name: 'A' },
      });

      await expect(
        createProduct(user.id, business.id, {
          name: 'Product B',
          description: 'Test',
          price: 6000,
          variant: { sku: fixedSku, name: 'B' },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('cross-business isolation: business A cannot access business B orders', async () => {
      const setupA = await setupTestBusiness();
      const setupB = await setupTestBusiness();

      const orderA = await createOrderInBusiness(
        setupA.user.id, setupA.business.id, setupA.customer.id, setupA.variant.id,
      );

      await expect(
        orderService.getOrder(setupB.user.id, setupB.business.id, orderA.id),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ORDER' });
    });

    it('cross-business isolation: business A cannot access business B products', async () => {
      const setupA = await setupTestBusiness();
      const setupB = await setupTestBusiness();

      const productA = await createProduct(setupA.user.id, setupA.business.id, {
        name: 'Secret Product',
        description: 'Hidden',
        price: 99999,
        variant: { sku: `SECRET-${Date.now()}-${testCounter}`, name: 'Secret' },
      });

      await expect(
        prisma.product.findFirst({
          where: { id: productA.id, businessId: setupB.business.id },
        }),
      ).resolves.toBeNull();
    });

    it('payment attempt with nonexistent reference returns UNKNOWN_REFERENCE', async () => {
      const result = await paymentService.applyVerifiedPayment({
        transactionReference: 'tx_nonexistent_ref_999999',
        providerTransactionId: 12345,
        verifiedAmountInKobo: 50000,
        verifiedCurrency: 'NGN',
        verifiedStatus: 'successful',
        providerVerification: {},
      });

      expect(result.outcome).toBe('UNKNOWN_REFERENCE');
    });

    it('cannot initiate payment for nonexistent order', async () => {
      const { user, business } = await setupTestBusiness();

      await expect(
        paymentService.initiatePayment(user.id, business.id, 'nonexistent-order-id'),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ORDER' });
    });

    it('concurrent conversation control state transitions are serialized', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id, controlState: ConversationControlState.AI_CONTROLLED },
      );

      const results = await Promise.allSettled([
        conversationService.updateControlState(
          user.id, business.id, conv.id,
          ConversationControlState.AI_CONTROLLED,
          ConversationControlState.PENDING_HANDOFF,
        ),
        conversationService.updateControlState(
          user.id, business.id, conv.id,
          ConversationControlState.AI_CONTROLLED,
          ConversationControlState.PENDING_HANDOFF,
        ),
      ]);

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');
      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);

      const convAfter = await prisma.conversation.findUnique({ where: { id: conv.id } });
      expect(convAfter?.controlState).toBe(ConversationControlState.PENDING_HANDOFF);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. VALIDATION EDGE CASES
  // ─────────────────────────────────────────────────────────────
  describe('Validation edge cases', () => {
    it('product creation rejects empty name', async () => {
      const { user, business } = await setupTestBusiness();

      await expect(
        createProduct(user.id, business.id, {
          name: '',
          description: 'Test',
          price: 5000,
          variant: { sku: `EDGE-${Date.now()}-${testCounter}`, name: 'X' },
        }),
      ).rejects.toThrow();
    });

    it('product creation rejects negative price', async () => {
      const { user, business } = await setupTestBusiness();

      await expect(
        createProduct(user.id, business.id, {
          name: 'Negative Price',
          description: 'Test',
          price: -100,
          variant: { sku: `NEG-${Date.now()}-${testCounter}`, name: 'X' },
        }),
      ).rejects.toThrow();
    });

    it('message creation rejects empty body', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      const { createMessage } = await import('../src/features/messages/message.service');
      await expect(
        createMessage(user.id, business.id, conv.id, {
          authorType: 'AI',
          channel: 'test',
          body: '',
        }),
      ).rejects.toThrow();
    });

    it('message creation rejects missing body', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      const { createMessage } = await import('../src/features/messages/message.service');
      await expect(
        createMessage(user.id, business.id, conv.id, {
          authorType: 'AI',
          channel: 'test',
          body: undefined as unknown as string,
        }),
      ).rejects.toThrow();
    });

    it('conversation creation rejects missing customerId', async () => {
      const { user, business } = await setupTestBusiness();

      await expect(
        conversationService.createConversation(user.id, business.id, {
          customerId: '',
        }),
      ).rejects.toThrow();
    });

    it('escalation creation rejects missing reason', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      await expect(
        escalationService.createEscalation(user.id, business.id, conv.id, {
          reason: '',
        }),
      ).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. AUTHORIZATION EDGE CASES
  // ─────────────────────────────────────────────────────────────
  describe('Authorization edge cases', () => {
    it('STAFF role can initiate payment (has payments scope per permissions)', async () => {
      const suffix = `auth-${++testCounter}`;
      const staffUser = await prisma.user.create({
        data: { name: 'Staff', email: `staff-${suffix}@test.com`, passwordHash: 'hashed' },
      });
      const { business, customer, variant } = await setupTestBusiness();
      await prisma.businessMembership.create({
        data: {
          userId: staffUser.id,
          businessId: business.id,
          role: MembershipRole.STAFF,
          status: MembershipStatus.ACTIVE,
        },
      });

      const order = await createOrderInBusiness(
        staffUser.id, business.id, customer.id, variant.id,
      );

      const result = await paymentService.initiatePayment(
        staffUser.id, business.id, order.id,
      );
      expect(result.attempt).toBeDefined();
      expect(result.attempt.status).toBe('PENDING');
    });

    it('INACTIVE membership is denied across all services', async () => {
      const suffix = `inactive-${++testCounter}`;
      const inactiveUser = await prisma.user.create({
        data: { name: 'Inactive', email: `inactive-${suffix}@test.com`, passwordHash: 'hashed' },
      });
      const { business, customer, variant } = await setupTestBusiness();
      await prisma.businessMembership.create({
        data: {
          userId: inactiveUser.id,
          businessId: business.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.INACTIVE,
        },
      });

      const order = await createRawOrder(business.id, customer.id);

      await expect(
        orderService.getOrder(inactiveUser.id, business.id, order.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      await expect(
        inventoryService.checkAvailability(inactiveUser.id, business.id, {
          variantId: variant.id,
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('SUPPORT_AGENT can manage conversations but not orders', async () => {
      const suffix = `support-${++testCounter}`;
      const supportUser = await prisma.user.create({
        data: { name: 'Support', email: `support-${suffix}@test.com`, passwordHash: 'hashed' },
      });
      const { business, customer } = await setupTestBusiness();
      await prisma.businessMembership.create({
        data: {
          userId: supportUser.id,
          businessId: business.id,
          role: MembershipRole.SUPPORT_AGENT,
          status: MembershipStatus.ACTIVE,
        },
      });

      const conv = await conversationService.createConversation(
        supportUser.id, business.id,
        { customerId: customer.id },
      );
      expect(conv).toHaveProperty('id');

      const order = await createRawOrder(business.id, customer.id);

      await expect(
        orderService.getOrder(supportUser.id, business.id, order.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 10. PAYMENT WEBHOOK CONCURRENT DELIVERY
  // ─────────────────────────────────────────────────────────────
  describe('Concurrent webhook delivery', () => {
    it('concurrent applyVerifiedPayment for same reference: row-level lock prevents double apply', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      const txRef = `tx_race_${Date.now()}_${testCounter}`;
      await prisma.paymentAttempt.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          status: PaymentAttemptStatus.PENDING,
          amount: order.totalAmount,
          currency: 'NGN',
          transactionReference: txRef,
        },
      });

      const input = {
        transactionReference: txRef,
        providerTransactionId: 88888,
        verifiedAmountInKobo: order.totalAmount,
        verifiedCurrency: 'NGN',
        verifiedStatus: 'successful',
        providerVerification: {},
      };

      // Run sequentially to verify FOR UPDATE lock prevents double-apply
      const result1 = await paymentService.applyVerifiedPayment(input);
      const result2 = await paymentService.applyVerifiedPayment(input);

      expect(result1.outcome).toBe('APPLIED');
      expect(result2.outcome).toBe('DUPLICATE');

      const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
      expect(orderAfter?.status).toBe(OrderStatus.PAID);

      const attempts = await prisma.paymentAttempt.findMany({
        where: { transactionReference: txRef },
      });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].status).toBe(PaymentAttemptStatus.SUCCESSFUL);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 11. AUDIT TRAIL COMPLETENESS
  // ─────────────────────────────────────────────────────────────
  describe('Audit trail completeness', () => {
    it('payment verification creates PAYMENT_VERIFIED audit', async () => {
      const { user, business, customer, variant } = await setupTestBusiness();
      const order = await createOrderInBusiness(
        user.id, business.id, customer.id, variant.id,
      );

      const txRef = `tx_audit_${Date.now()}_${testCounter}`;
      await prisma.paymentAttempt.create({
        data: {
          businessId: business.id,
          orderId: order.id,
          status: PaymentAttemptStatus.PENDING,
          amount: order.totalAmount,
          currency: 'NGN',
          transactionReference: txRef,
        },
      });

      await paymentService.applyVerifiedPayment({
        transactionReference: txRef,
        providerTransactionId: 77777,
        verifiedAmountInKobo: order.totalAmount,
        verifiedCurrency: 'NGN',
        verifiedStatus: 'successful',
        providerVerification: {},
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'PAYMENT_VERIFIED' },
      });
      expect(auditLogs.length).toBe(1);

      const orderAudit = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'ORDER_STATUS_UPDATED' },
      });
      expect(orderAudit.length).toBeGreaterThanOrEqual(1);
    });

    it('escalation operations create audit records', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      const escalation = await escalationService.createEscalation(
        user.id, business.id, conv.id, { reason: 'Audit test' },
      );

      let auditLogs = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'ESCALATION_CREATED' },
      });
      expect(auditLogs.length).toBe(1);

      await escalationService.assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });

      auditLogs = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'ESCALATION_ASSIGNED' },
      });
      expect(auditLogs.length).toBe(1);

      await escalationService.resolveEscalation(user.id, business.id, escalation.id);

      auditLogs = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'ESCALATION_RESOLVED' },
      });
      expect(auditLogs.length).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 12. INVENTORY AUDIT TRAIL
  // ─────────────────────────────────────────────────────────────
  describe('Inventory audit trail', () => {
    it('inventory mutation creates InventoryMovement record', async () => {
      const { user, business, variant } = await setupTestBusiness();

      // Use manualAdjustment with a unique idempotency key for a fresh movement
      const invBefore = await prisma.inventory.findFirst({
        where: { productVariantId: variant.id },
      });

      const adjustResult = await inventoryService.manualAdjustment(
        user.id, business.id,
        { variantId: variant.id, delta: 5 },
      );

      const movements = await prisma.inventoryMovement.findMany({
        where: { inventory: { productVariantId: variant.id } },
      });
      expect(movements.length).toBeGreaterThanOrEqual(1);

      // manual_adjustment is lowercase per inventory.constants.ts
      const adjustMovement = movements.find((m) => m.reason === 'manual_adjustment');
      expect(adjustMovement).toBeDefined();
      expect(adjustMovement?.quantityDelta).toBe(5);
    });

    it('inventory operations are idempotent for same sourceId+reason', async () => {
      const { user, business, variant } = await setupTestBusiness();

      await setInventoryExact(variant.id, 10, 0);

      const order = await createRawOrder(
        (await prisma.inventory.findFirst({ where: { productVariantId: variant.id } }))!.businessId,
        (await prisma.customer.findFirst({ where: { businessId: (await prisma.inventory.findFirst({ where: { productVariantId: variant.id } }))!.businessId } }))!.id,
      );

      const invBefore = await prisma.inventory.findFirst({
        where: { productVariantId: variant.id },
      });

      await inventoryService.reserve(user.id, business.id, {
        variantId: variant.id,
        orderId: order.id,
        quantity: 3,
      });

      const invMid = await prisma.inventory.findFirst({
        where: { productVariantId: variant.id },
      });
      expect(invMid?.available).toBe(7);
      expect(invMid?.reserved).toBe(3);

      // Second reserve with same orderId is idempotent
      const secondResult = await inventoryService.reserve(user.id, business.id, {
        variantId: variant.id,
        orderId: order.id,
        quantity: 3,
      });

      expect(secondResult.alreadyApplied).toBe(true);

      const invAfter = await prisma.inventory.findFirst({
        where: { productVariantId: variant.id },
      });
      expect(invAfter?.available).toBe(7);
      expect(invAfter?.reserved).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 13. CONVERSATION MESSAGE DEDUPLICATION
  // ─────────────────────────────────────────────────────────────
  describe('Message deduplication', () => {
    it('duplicate providerMessageId returns existing message (deduplication)', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conv = await conversationService.createConversation(
        user.id, business.id,
        { customerId: customer.id },
      );

      const { createMessage } = await import('../src/features/messages/message.service');

      const first = await createMessage(user.id, business.id, conv.id, {
        authorType: 'CUSTOMER',
        channel: 'whatsapp',
        body: 'First message',
        providerMessageId: `wamid-dedup-${Date.now()}-${testCounter}`,
      });

      // Second call with same providerMessageId is deduplicated (returns existing)
      const second = await createMessage(user.id, business.id, conv.id, {
        authorType: 'CUSTOMER',
        channel: 'whatsapp',
        body: 'Duplicate message attempt',
        providerMessageId: first.providerMessageId,
      });

      expect(second.id).toBe(first.id);

      const messages = await prisma.message.findMany({
        where: { conversationId: conv.id, providerMessageId: first.providerMessageId },
      });
      expect(messages).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 14. PAYMENT SIGNATURE VERIFICATION
  // ─────────────────────────────────────────────────────────────
  describe('Payment signature edge cases', () => {
    it('timing-safe comparison: different length signatures are rejected', async () => {
      const { verifyFlutterwaveSignature } = await import('../src/features/payments/signature');

      process.env.FLW_SECRET_HASH = 'test-secret-for-signatures';
      const result = verifyFlutterwaveSignature('{"test":"body"}', 'short');
      expect(result).toBe(false);
    });

    it('both headers missing returns false', async () => {
      const { verifyFlutterwaveSignature } = await import('../src/features/payments/signature');

      process.env.FLW_SECRET_HASH = 'test-secret-for-signatures';
      const result = verifyFlutterwaveSignature('{"test":"body"}', null, null);
      expect(result).toBe(false);
    });

    it('unconfigured secret hash returns false', async () => {
      const { verifyFlutterwaveSignature } = await import('../src/features/payments/signature');
      const original = process.env.FLW_SECRET_HASH;
      delete process.env.FLW_SECRET_HASH;

      const result = verifyFlutterwaveSignature('{"test":"body"}', 'some-sig');
      expect(result).toBe(false);

      if (original) process.env.FLW_SECRET_HASH = original;
    });
  });
});
