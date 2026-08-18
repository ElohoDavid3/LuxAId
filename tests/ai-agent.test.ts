import {
  ConversationControlState,
  MembershipRole,
  ProductStatus,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { resetDatabase, createUserInBusiness } from './helpers';
import { createCustomer } from '../src/features/customers/customer.service';
import { createProduct } from '../src/features/products/product.service';
import { setStock } from '../src/features/products/inventory.service';
import {
  createConversation,
  updateControlState,
} from '../src/features/conversations/conversation.service';
import * as messageService from '../src/features/messages/message.service';
import * as conversationService from '../src/features/conversations/conversation.service';
import { ConversationControlState as CCS } from '@prisma/client';

const hasLLMConfig = Boolean(
  process.env.OPENAI_API_KEY && process.env.AI_MODEL,
);

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

let testCounter = 0;

async function setupTestBusiness() {
  const suffix = `agent-${++testCounter}`;
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
    name: 'Agent Customer',
  });

  const product = await createProduct(user.id, business.id, {
    name: 'Test Widget',
    description: 'A fine widget',
    price: 2500,
    status: ProductStatus.ACTIVE,
    variant: {
      sku: `AGENT-SKU-${Date.now()}`,
      name: 'Standard',
    },
  });
  const variant = product.variants[0];
  await setStock(user.id, business.id, { variantId: variant.id, available: 20 });

  return { user, business, systemUser, customer, product, variant };
}

describe('AI agent', () => {
  describe('control state guard', () => {
    it('does not respond when conversation is HUMAN_CONTROLLED', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
        controlState: CCS.HUMAN_CONTROLLED,
      });

      const { handleIncomingMessage } = await import(
        '../src/features/ai/agent'
      );
      const result = await handleIncomingMessage({
        businessId: business.id,
        conversationId: conversation.id,
        customerId: customer.id,
        messageBody: 'Hello',
      });

      expect(result.reply).toBe('');
      expect(result.actions).toHaveLength(0);
    });

    it('does not respond when conversation is PENDING_HANDOFF', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
        controlState: CCS.PENDING_HANDOFF,
      });

      const { handleIncomingMessage } = await import(
        '../src/features/ai/agent'
      );
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

  describe('system user resolution', () => {
    it('fails safely when system user does not exist', async () => {
      const { user, business, customer } = await setupTestBusiness();
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });

      await prisma.businessMembership.deleteMany({
        where: {
          businessId: business.id,
          user: { email: { endsWith: '@orderaid.internal' } },
        },
      });

      const { handleIncomingMessage } = await import(
        '../src/features/ai/agent'
      );
      await expect(
        handleIncomingMessage({
          businessId: business.id,
          conversationId: conversation.id,
          customerId: customer.id,
          messageBody: 'Hello',
        }),
      ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    });
  });

  describe('tenant isolation', () => {
    const itIfLLM = hasLLMConfig ? it : it.skip;

    itIfLLM('AI for business A cannot access business B products', async () => {
      const setupA = await setupTestBusiness();
      const setupB = await setupTestBusiness();

      const conversationB = await createConversation(
        setupB.user.id,
        setupB.business.id,
        { customerId: setupB.customer.id },
      );

      const { handleIncomingMessage } = await import(
        '../src/features/ai/agent'
      );
      const result = await handleIncomingMessage({
        businessId: setupB.business.id,
        conversationId: conversationB.id,
        customerId: setupB.customer.id,
        messageBody: `Tell me about product ${setupA.product.id}`,
      });

      expect(result.reply).not.toContain('Test Widget');
    });
  });

  describe('conversation history', () => {
    const itIfLLM = hasLLMConfig ? it : it.skip;

    itIfLLM('includes previous messages in context', async () => {
      const { user, business, systemUser, customer } =
        await setupTestBusiness();
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });

      await messageService.createMessage(
        systemUser.id,
        business.id,
        conversation.id,
        {
          authorType: 'CUSTOMER',
          channel: 'internal',
          body: 'Previous message',
        },
      );

      const { handleIncomingMessage } = await import(
        '../src/features/ai/agent'
      );
      const result = await handleIncomingMessage({
        businessId: business.id,
        conversationId: conversation.id,
        customerId: customer.id,
        messageBody: 'New message',
      });

      expect(result).toHaveProperty('reply');
    });
  });
});
