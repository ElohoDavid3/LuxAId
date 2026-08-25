/**
 * AI Agent integration tests with mocked LLM provider.
 *
 * Verifies:
 * - Simple text reply (no tool calls)
 * - Single tool call → result → final reply
 * - Multi-tool sequential chain (search → get_product → reply)
 * - Tool execution error handling within conversation context
 * - Max iterations exceeded → automatic escalation
 * - Message persistence after AI reply
 * - Audit log creation for AI events
 * - Conversation history included in LLM context
 */

import {
  ConversationControlState,
  MembershipRole,
  ProductStatus,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';
import { createCustomer } from '../src/features/customers/customer.service';
import { createProduct } from '../src/features/products/product.service';
import { setStock } from '../src/features/products/inventory.service';
import {
  createConversation,
} from '../src/features/conversations/conversation.service';
import * as messageService from '../src/features/messages/message.service';
import type { LLMProvider, LLMResponse } from '../src/features/ai/llm/provider';

beforeAll(() => resetDatabase());
afterAll(() => prisma.$disconnect());

let testCounter = 0;

// ── Mock LLM provider ─────────────────────────────────────────
// We intercept createLLMProvider to return a controllable mock.

let mockChatHandler: ((params: {
  system: string;
  messages: Array<{ role: string; content: string }>;
  tools: unknown[];
}) => Promise<LLMResponse>) | null = null;

jest.mock('../src/features/ai/llm/provider', () => ({
  createLLMProvider: () => ({
    chat: (params: Parameters<LLMProvider['chat']>[0]) => {
      if (!mockChatHandler) {
        return Promise.resolve({ content: 'Default reply', tool_calls: [], finish_reason: 'stop' });
      }
      return mockChatHandler(params);
    },
  }),
}));

// Must import AFTER mock is set up
import { handleIncomingMessage } from '../src/features/ai/agent';

// ── Test setup helpers ─────────────────────────────────────────

async function setupTestBusiness() {
  const suffix = `agent-integ-${++testCounter}`;
  const { user, business } = await createUserInBusiness(`owner-${suffix}@test.com`);

  // Create system user for the business
  const systemUser = await prisma.user.create({
    data: {
      name: 'OrderAId AI',
      email: `ai-${business.id}@orderaid.internal`,
      passwordHash: 'hashed',
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
    name: 'Agent Test Customer',
    phone: '2348010000001',
  });

  const product = await createProduct(user.id, business.id, {
    name: 'Wireless Headphones',
    description: 'Noise-cancelling over-ear headphones',
    price: 25000,
    status: ProductStatus.ACTIVE,
    variant: { sku: `HP-${suffix}`, name: 'Black' },
  });
  const variant = product.variants[0];
  await setStock(user.id, business.id, { variantId: variant.id, available: 50 });

  return { user, business, systemUser, customer, product, variant };
}

// ── Tests ──────────────────────────────────────────────────────

describe('AI agent integration (mocked LLM)', () => {
  beforeEach(() => {
    mockChatHandler = null;
  });

  it('returns simple text reply when LLM produces no tool calls', async () => {
    const { user, business, customer } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    mockChatHandler = async () => ({
      content: 'Hello! How can I help you today?',
      tool_calls: [],
      finish_reason: 'stop',
    });

    const result = await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'Hi there!',
    });

    expect(result.reply).toBe('Hello! How can I help you today?');
    expect(result.actions).toHaveLength(0);
  });

  it('executes a single tool call and returns the LLM final reply', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    let callCount = 0;
    mockChatHandler = async (params) => {
      callCount++;
      if (callCount === 1) {
        // First call: request a tool call
        return {
          content: null,
          tool_calls: [
            {
              id: `call_${callCount}`,
              name: 'check_stock',
              arguments: JSON.stringify({ variantId: variant.id, quantity: 1 }),
            },
          ],
          finish_reason: 'tool_calls',
        };
      }
      // Second call: LLM sees tool result and produces final reply
      return {
        content: 'We have that item in stock! Would you like to order?',
        tool_calls: [],
        finish_reason: 'stop',
      };
    };

    const result = await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'Do you have wireless headphones in stock?',
    });

    expect(result.reply).toBe('We have that item in stock! Would you like to order?');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].tool).toBe('check_stock');
    const toolResult = JSON.parse(result.actions[0].result);
    expect(toolResult.available).toBe(50);
    expect(toolResult.quantityAvailable).toBe(true);
    expect(toolResult.outOfStock).toBe(false);
  });

  it('chains multiple tool calls before producing a final reply', async () => {
    const { user, business, customer, product, variant } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    let callCount = 0;
    mockChatHandler = async () => {
      callCount++;
      if (callCount === 1) {
        // Step 1: search products
        return {
          content: null,
          tool_calls: [
            {
              id: `call_search_${callCount}`,
              name: 'search_products',
              arguments: JSON.stringify({ query: 'headphones' }),
            },
          ],
          finish_reason: 'tool_calls',
        };
      }
      if (callCount === 2) {
        // Step 2: get full product details
        return {
          content: null,
          tool_calls: [
            {
              id: `call_get_${callCount}`,
              name: 'get_product',
              arguments: JSON.stringify({ productId: product.id }),
            },
          ],
          finish_reason: 'tool_calls',
        };
      }
      // Step 3: final reply
      return {
        content: `The ${product.name} is ₦${product.price / 100}. It comes in ${product.variants.length} variant(s).`,
        tool_calls: [],
        finish_reason: 'stop',
      };
    };

    const result = await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'Tell me about your headphones',
    });

    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].tool).toBe('search_products');
    expect(result.actions[1].tool).toBe('get_product');
    expect(result.reply).toContain('Wireless Headphones');
  });

  it('handles tool execution error gracefully within the conversation', async () => {
    const { user, business, customer } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    let callCount = 0;
    mockChatHandler = async () => {
      callCount++;
      if (callCount === 1) {
        // Request a tool call with a nonexistent product ID
        return {
          content: null,
          tool_calls: [
            {
              id: `call_err_${callCount}`,
              name: 'get_product',
              arguments: JSON.stringify({ productId: 'nonexistent-product-id' }),
            },
          ],
          finish_reason: 'tool_calls',
        };
      }
      // Second call: LLM sees error and produces a helpful reply
      return {
        content: "I couldn't find that product. Could you tell me more about what you're looking for?",
        tool_calls: [],
        finish_reason: 'stop',
      };
    };

    const result = await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'Tell me about product XYZ123',
    });

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].tool).toBe('get_product');
    const toolResult = JSON.parse(result.actions[0].result);
    expect(toolResult.error).toBe(true);
    expect(toolResult.code).toBe('UNKNOWN_PRODUCT');
    expect(result.reply).toContain("couldn't find");
  });

  it('auto-escalates when max iterations exceeded (LLM never stops calling tools)', async () => {
    const { user, business, customer } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    // LLM always returns tool calls, never a final text reply
    let callCount = 0;
    mockChatHandler = async () => {
      callCount++;
      return {
        content: null,
        tool_calls: [
          {
            id: `loop_${callCount}`,
            name: 'list_delivery_zones',
            arguments: JSON.stringify({}),
          },
        ],
        finish_reason: 'tool_calls',
      };
    };

    const result = await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'What delivery zones do you have?',
    });

    // Should have 5 tool calls (MAX_TOOL_ITERATIONS) + 1 escalate_to_human
    expect(result.actions.length).toBeGreaterThanOrEqual(6);
    expect(result.actions[result.actions.length - 1].tool).toBe('escalate_to_human');
    expect(result.reply).toContain('connect you with a human');

    // Verify escalation record was created
    const escalation = await prisma.escalation.findFirst({
      where: { conversationId: conversation.id },
    });
    expect(escalation).not.toBeNull();
    expect(escalation!.reason).toContain('max iterations');
  });

  it('persists AI reply as a Message record after successful response', async () => {
    const { user, business, customer } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    mockChatHandler = async () => ({
      content: 'This is a persisted reply.',
      tool_calls: [],
      finish_reason: 'stop',
    });

    await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'Hello',
    });

    const aiMessage = await prisma.message.findFirst({
      where: {
        businessId: business.id,
        conversationId: conversation.id,
        authorType: 'AI',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(aiMessage).not.toBeNull();
    expect(aiMessage!.body).toBe('This is a persisted reply.');
    expect(aiMessage!.direction).toBe('OUTBOUND');
    expect(aiMessage!.channel).toBe('internal');
  });

  it('creates audit logs for AI_MESSAGE_RECEIVED, AI_TOOL_EXECUTED, AI_REPLY_SENT', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    mockChatHandler = async () => ({
      content: 'Audit test reply',
      tool_calls: [],
      finish_reason: 'stop',
    });

    await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'Check audit logs',
    });

    const auditEvents = await prisma.auditLog.findMany({
      where: {
        businessId: business.id,
        eventType: { in: ['AI_MESSAGE_RECEIVED', 'AI_REPLY_SENT'] },
      },
    });

    const received = auditEvents.find((e) => e.eventType === 'AI_MESSAGE_RECEIVED');
    const sent = auditEvents.find((e) => e.eventType === 'AI_REPLY_SENT');
    expect(received).toBeDefined();
    expect(sent).toBeDefined();
  });

  it('creates audit log for AI_TOOL_EXECUTED when a tool is called', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    let callCount = 0;
    mockChatHandler = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: null,
          tool_calls: [
            {
              id: `audit_tool_${callCount}`,
              name: 'check_stock',
              arguments: JSON.stringify({ variantId: variant.id, quantity: 1 }),
            },
          ],
          finish_reason: 'tool_calls',
        };
      }
      return {
        content: 'Stock checked.',
        tool_calls: [],
        finish_reason: 'stop',
      };
    };

    await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'Check stock please',
    });

    const toolAudit = await prisma.auditLog.findFirst({
      where: {
        businessId: business.id,
        eventType: 'AI_TOOL_EXECUTED',
      },
    });

    expect(toolAudit).toBeDefined();
    const payload = toolAudit!.payload as Record<string, unknown>;
    expect(payload.toolName).toBe('check_stock');
    expect(payload.success).toBe(true);
  });

  it('includes conversation history in LLM context messages', async () => {
    const { user, business, systemUser, customer } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    // Seed two prior messages
    await messageService.createMessage(systemUser.id, business.id, conversation.id, {
      authorType: 'CUSTOMER',
      channel: 'internal',
      body: 'Previous customer message',
    });
    await messageService.createMessage(systemUser.id, business.id, conversation.id, {
      authorType: 'AI',
      channel: 'internal',
      body: 'Previous AI reply',
    });

    let receivedMessages: Array<{ role: string; content: string }> = [];
    mockChatHandler = async (params) => {
      receivedMessages = params.messages as Array<{ role: string; content: string }>;
      return {
        content: 'History check done.',
        tool_calls: [],
        finish_reason: 'stop',
      };
    };

    await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'New customer message',
    });

    // Should contain: 2 history messages + 1 new user message = 3 messages
    expect(receivedMessages.length).toBe(3);
    expect(receivedMessages[0].role).toBe('user');
    expect(receivedMessages[0].content).toBe('Previous customer message');
    expect(receivedMessages[1].role).toBe('assistant');
    expect(receivedMessages[1].content).toBe('Previous AI reply');
    expect(receivedMessages[2].role).toBe('user');
    expect(receivedMessages[2].content).toBe('New customer message');
  });

  it('handles create_order tool call correctly', async () => {
    const { user, business, customer, variant } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    let callCount = 0;
    mockChatHandler = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: null,
          tool_calls: [
            {
              id: `order_call_${callCount}`,
              name: 'create_order',
              arguments: JSON.stringify({
                customerId: customer.id,
                items: [{ variantId: variant.id, quantity: 2 }],
              }),
            },
          ],
          finish_reason: 'tool_calls',
        };
      }
      return {
        content: 'Your order has been created! Total: ₦50,000.',
        tool_calls: [],
        finish_reason: 'stop',
      };
    };

    const result = await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'I want to order 2 headphones',
    });

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].tool).toBe('create_order');
    const orderResult = JSON.parse(result.actions[0].result);
    expect(orderResult.status).toBe('AWAITING_PAYMENT');
    expect(orderResult.totalAmount).toBe(50000);
    expect(result.reply).toContain('order has been created');
  });

  it('handles escalate_to_human tool call and transitions control state', async () => {
    const { user, business, customer } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });

    let callCount = 0;
    mockChatHandler = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          content: null,
          tool_calls: [
            {
              id: `esc_${callCount}`,
              name: 'escalate_to_human',
              arguments: JSON.stringify({
                conversationId: conversation.id,
                reason: 'Customer is upset',
              }),
            },
          ],
          finish_reason: 'tool_calls',
        };
      }
      return {
        content: "I'm connecting you with a human agent now.",
        tool_calls: [],
        finish_reason: 'stop',
      };
    };

    const result = await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'I want to speak to a manager!',
    });

    expect(result.actions[0].tool).toBe('escalate_to_human');
    const escResult = JSON.parse(result.actions[0].result);
    expect(escResult.escalated).toBe(true);

    // Verify conversation control state transitioned to PENDING_HANDOFF
    const updatedConv = await prisma.conversation.findUnique({
      where: { id: conversation.id },
    });
    expect(updatedConv!.controlState).toBe(ConversationControlState.PENDING_HANDOFF);
  });

  it('returns empty reply and no actions when conversation is not AI_CONTROLLED', async () => {
    const { user, business, customer } = await setupTestBusiness();
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
      controlState: ConversationControlState.HUMAN_CONTROLLED,
    });

    mockChatHandler = async () => ({
      content: 'Should not be called',
      tool_calls: [],
      finish_reason: 'stop',
    });

    const result = await handleIncomingMessage({
      businessId: business.id,
      conversationId: conversation.id,
      customerId: customer.id,
      messageBody: 'Hello',
    });

    expect(result.reply).toBe('');
    expect(result.actions).toHaveLength(0);
  });
});
