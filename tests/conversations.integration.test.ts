import {
  ConversationControlState,
  ConversationStatus,
  MembershipRole,
  MembershipStatus,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { resetDatabase, createUserInBusiness } from './helpers';
import {
  createConversation,
  getConversation,
  listConversations,
} from '../src/features/conversations/conversation.service';
import { createCustomer } from '../src/features/customers/customer.service';

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

describe('Conversation service', () => {
  describe('createConversation', () => {
    it('creates a conversation with default status and control state', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-create@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Chat Customer',
      });
      const result = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      expect(result.customerId).toBe(customer.id);
      expect(result.businessId).toBe(business.id);
      expect(result.status).toBe(ConversationStatus.NEW);
      expect(result.controlState).toBe(ConversationControlState.AI_CONTROLLED);
    });

    it('creates a conversation with explicit status and control state', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-explicit@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Explicit Customer',
      });
      const result = await createConversation(user.id, business.id, {
        customerId: customer.id,
        status: ConversationStatus.ACTIVE,
        controlState: ConversationControlState.HUMAN_CONTROLLED,
      });
      expect(result.status).toBe(ConversationStatus.ACTIVE);
      expect(result.controlState).toBe(
        ConversationControlState.HUMAN_CONTROLLED,
      );
    });

    it('returns not-found when the customer does not belong to the business', async () => {
      const ownerA = await createUserInBusiness('owner-conv-a@test.com');
      const ownerB = await createUserInBusiness('owner-conv-b@test.com');
      const customerA = await createCustomer(
        ownerA.user.id,
        ownerA.business.id,
        {
          name: 'Customer A',
        },
      );
      await expect(
        createConversation(ownerB.user.id, ownerB.business.id, {
          customerId: customerA.id,
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CUSTOMER' });
    });

    it('returns not-found for a nonexistent customer', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-nocust@test.com',
      );
      await expect(
        createConversation(user.id, business.id, {
          customerId: 'nonexistent-id',
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CUSTOMER' });
    });

    it('rejects missing customerId', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-validation@test.com',
      );
      await expect(
        createConversation(user.id, business.id, {}),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects invalid status enum value', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-badstatus@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Bad Status Customer',
      });
      await expect(
        createConversation(user.id, business.id, {
          customerId: customer.id,
          status: 'NOT_A_STATUS',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects unexpected fields', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-strict@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Strict Customer',
      });
      await expect(
        createConversation(user.id, business.id, {
          customerId: customer.id,
          messages: [],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects client-supplied businessId in input', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-inject@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Inject Customer',
      });
      await expect(
        createConversation(user.id, business.id, {
          customerId: customer.id,
          businessId: 'injected-business-id',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('getConversation', () => {
    it('retrieves a conversation by id', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-get@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Get Customer',
      });
      const created = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const result = await getConversation(user.id, business.id, created.id);
      expect(result.id).toBe(created.id);
      expect(result.customerId).toBe(customer.id);
    });

    it('returns not-found for unknown conversation id', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-get-missing@test.com',
      );
      await expect(
        getConversation(user.id, business.id, 'nonexistent-id'),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });

    it('cross-business access behaves like not-found', async () => {
      const ownerA = await createUserInBusiness('owner-conv-xa@test.com');
      const ownerB = await createUserInBusiness('owner-conv-xb@test.com');
      const customerA = await createCustomer(
        ownerA.user.id,
        ownerA.business.id,
        {
          name: 'Customer A',
        },
      );
      const conversationA = await createConversation(
        ownerA.user.id,
        ownerA.business.id,
        { customerId: customerA.id },
      );
      await expect(
        getConversation(ownerB.user.id, ownerB.business.id, conversationA.id),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });
  });

  describe('listConversations', () => {
    it('lists conversations newest first with counts', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-list@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'List Customer',
      });
      await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const result = await listConversations(user.id, business.id);
      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].customerId).toBe(customer.id);
    });

    it('filters conversations by status', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-filter@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Filter Customer',
      });
      await createConversation(user.id, business.id, {
        customerId: customer.id,
        status: ConversationStatus.RESOLVED,
      });
      await createConversation(user.id, business.id, {
        customerId: customer.id,
        status: ConversationStatus.ACTIVE,
      });
      const resolved = await listConversations(user.id, business.id, {
        status: ConversationStatus.RESOLVED,
      });
      expect(resolved.total).toBe(1);
      expect(resolved.items[0].status).toBe(ConversationStatus.RESOLVED);
    });

    it('returns empty list when no conversations exist', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-list-empty@test.com',
      );
      const result = await listConversations(user.id, business.id);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('does not include other business conversations', async () => {
      const ownerA = await createUserInBusiness('owner-conv-la@test.com');
      const ownerB = await createUserInBusiness('owner-conv-lb@test.com');
      const customerA = await createCustomer(
        ownerA.user.id,
        ownerA.business.id,
        {
          name: 'Customer A',
        },
      );
      await createConversation(ownerA.user.id, ownerA.business.id, {
        customerId: customerA.id,
      });
      const result = await listConversations(
        ownerB.user.id,
        ownerB.business.id,
      );
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('authorization and multi-tenancy', () => {
    it('rejects inactive membership', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-conv-inactive@test.com',
        MembershipRole.OWNER,
        MembershipStatus.INACTIVE,
      );
      await expect(
        createConversation(user.id, business.id, { customerId: 'x' }),
      ).rejects.toBeInstanceOf(AppError);
      await expect(
        listConversations(user.id, business.id),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('rejects unauthorized role for conversation access', async () => {
      const { user, business } = await createUserInBusiness(
        'staff-conv@test.com',
        MembershipRole.STAFF,
      );
      await expect(
        createConversation(user.id, business.id, { customerId: 'x' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        listConversations(user.id, business.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('allows SUPPORT_AGENT to manage conversations', async () => {
      const { user, business } = await createUserInBusiness(
        'support-conv@test.com',
        MembershipRole.SUPPORT_AGENT,
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Support Customer',
      });
      const created = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      expect(created.id).toBeTruthy();
      const listed = await listConversations(user.id, business.id);
      expect(listed.items).toHaveLength(1);
    });

    it('client-supplied requestedBusinessId cannot bypass isolation', async () => {
      const { user } = await createUserInBusiness('owner-conv-bypass@test.com');
      const otherBiz = await prisma.business.create({
        data: { name: 'Other Business' },
      });
      await expect(
        listConversations(user.id, otherBiz.id),
      ).rejects.toBeInstanceOf(AppError);
    });
  });
});
