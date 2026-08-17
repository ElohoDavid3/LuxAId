import {
  MessageAuthorType,
  MembershipRole,
  MembershipStatus,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { resetDatabase, createUserInBusiness } from './helpers';
import {
  createMessage,
  getMessages,
} from '../src/features/messages/message.service';
import { createCustomer } from '../src/features/customers/customer.service';
import { createConversation } from '../src/features/conversations/conversation.service';

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

describe('Message service', () => {
  describe('createMessage', () => {
    it('creates a message with all required fields', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-create@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Msg Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const result = await createMessage(
        user.id,
        business.id,
        conversation.id,
        {
          body: 'Hello from the customer',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
        },
      );
      expect(result.body).toBe('Hello from the customer');
      expect(result.authorType).toBe(MessageAuthorType.CUSTOMER);
      expect(result.channel).toBe('whatsapp');
      expect(result.businessId).toBe(business.id);
      expect(result.conversationId).toBe(conversation.id);
      expect(result.providerMessageId).toBeNull();
      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('creates a message with providerMessageId', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-provider@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Provider Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const result = await createMessage(
        user.id,
        business.id,
        conversation.id,
        {
          body: 'Provider message',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
          providerMessageId: 'wamid.123456',
        },
      );
      expect(result.providerMessageId).toBe('wamid.123456');
    });

    it.each([
      MessageAuthorType.CUSTOMER,
      MessageAuthorType.AI,
      MessageAuthorType.HUMAN,
      MessageAuthorType.SYSTEM,
    ])('creates a message with authorType %s', async (authorType) => {
      const { user, business } = await createUserInBusiness(
        `owner-msg-auth-${authorType.toLowerCase()}@test.com`,
      );
      const customer = await createCustomer(user.id, business.id, {
        name: `Auth ${authorType} Customer`,
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const result = await createMessage(
        user.id,
        business.id,
        conversation.id,
        {
          body: `Message from ${authorType}`,
          authorType,
          channel: 'internal',
        },
      );
      expect(result.authorType).toBe(authorType);
    });

    it('creates an internal message with null providerMessageId', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-internal@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Internal Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const first = await createMessage(user.id, business.id, conversation.id, {
        body: 'Internal message 1',
        authorType: MessageAuthorType.AI,
        channel: 'internal',
      });
      const second = await createMessage(
        user.id,
        business.id,
        conversation.id,
        {
          body: 'Internal message 2',
          authorType: MessageAuthorType.HUMAN,
          channel: 'internal',
        },
      );
      expect(first.id).not.toBe(second.id);
      expect(first.providerMessageId).toBeNull();
      expect(second.providerMessageId).toBeNull();
    });

    it('rejects missing body', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-nobody@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'No Body Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      await expect(
        createMessage(user.id, business.id, conversation.id, {
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects empty body', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-emptybody@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Empty Body Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      await expect(
        createMessage(user.id, business.id, conversation.id, {
          body: '   ',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects missing authorType', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-noauth@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'No Auth Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      await expect(
        createMessage(user.id, business.id, conversation.id, {
          body: 'Missing author',
          channel: 'whatsapp',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects invalid authorType', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-badauth@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Bad Auth Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      await expect(
        createMessage(user.id, business.id, conversation.id, {
          body: 'Bad author',
          authorType: 'ROBOT',
          channel: 'whatsapp',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects missing channel', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-nochannel@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'No Channel Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      await expect(
        createMessage(user.id, business.id, conversation.id, {
          body: 'No channel',
          authorType: MessageAuthorType.CUSTOMER,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects empty channel', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-emptychannel@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Empty Channel Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      await expect(
        createMessage(user.id, business.id, conversation.id, {
          body: 'Empty channel',
          authorType: MessageAuthorType.CUSTOMER,
          channel: '   ',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects unexpected fields', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-strict@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Strict Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      await expect(
        createMessage(user.id, business.id, conversation.id, {
          body: 'Strict message',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
          injectedField: 'bad',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects client-supplied businessId in input', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-inject@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Inject Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      await expect(
        createMessage(user.id, business.id, conversation.id, {
          body: 'Injected',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
          businessId: 'injected-business-id',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('returns not-found for nonexistent conversation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-nosuch@test.com',
      );
      await expect(
        createMessage(user.id, business.id, 'nonexistent-convo-id', {
          body: 'Ghost message',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });

    it('returns not-found for cross-business conversation', async () => {
      const ownerA = await createUserInBusiness('owner-msg-xa@test.com');
      const ownerB = await createUserInBusiness('owner-msg-xb@test.com');
      const customerA = await createCustomer(
        ownerA.user.id,
        ownerA.business.id,
        { name: 'Customer A' },
      );
      const conversationA = await createConversation(
        ownerA.user.id,
        ownerA.business.id,
        { customerId: customerA.id },
      );
      await expect(
        createMessage(ownerB.user.id, ownerB.business.id, conversationA.id, {
          body: 'Cross-business',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });

    it('handles provider-message deduplication by returning existing', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-dedup@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Dedup Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const first = await createMessage(user.id, business.id, conversation.id, {
        body: 'Original provider message',
        authorType: MessageAuthorType.CUSTOMER,
        channel: 'whatsapp',
        providerMessageId: 'wamid.dedup-001',
      });
      const second = await createMessage(
        user.id,
        business.id,
        conversation.id,
        {
          body: 'Duplicate provider message',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
          providerMessageId: 'wamid.dedup-001',
        },
      );
      expect(second.id).toBe(first.id);
      expect(second.body).toBe('Original provider message');
      const count = await prisma.message.count({
        where: {
          businessId: business.id,
          conversationId: conversation.id,
          channel: 'whatsapp',
          providerMessageId: 'wamid.dedup-001',
        },
      });
      expect(count).toBe(1);
    });

    it('allows multiple internal messages with null providerMessageId', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-multi@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Multi Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const messages = [];
      for (let i = 0; i < 3; i++) {
        const msg = await createMessage(user.id, business.id, conversation.id, {
          body: `Internal message ${i}`,
          authorType: MessageAuthorType.SYSTEM,
          channel: 'internal',
        });
        messages.push(msg);
      }
      const ids = new Set(messages.map((m) => m.id));
      expect(ids.size).toBe(3);
    });
  });

  describe('getMessages', () => {
    it('lists messages in chronological order', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-list@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'List Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      await createMessage(user.id, business.id, conversation.id, {
        body: 'First',
        authorType: MessageAuthorType.CUSTOMER,
        channel: 'whatsapp',
      });
      await createMessage(user.id, business.id, conversation.id, {
        body: 'Second',
        authorType: MessageAuthorType.AI,
        channel: 'internal',
      });
      await createMessage(user.id, business.id, conversation.id, {
        body: 'Third',
        authorType: MessageAuthorType.CUSTOMER,
        channel: 'whatsapp',
      });
      const result = await getMessages(user.id, business.id, conversation.id);
      expect(result.items).toHaveLength(3);
      expect(result.items[0].body).toBe('First');
      expect(result.items[1].body).toBe('Second');
      expect(result.items[2].body).toBe('Third');
      expect(result.nextCursor).toBeNull();
    });

    it('paginates with cursor', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-cursor@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Cursor Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const created = [];
      for (let i = 0; i < 5; i++) {
        const msg = await createMessage(user.id, business.id, conversation.id, {
          body: `Page msg ${i}`,
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
        });
        created.push(msg);
      }
      const page1 = await getMessages(user.id, business.id, conversation.id, {
        limit: 2,
      });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeTruthy();
      expect(page1.items[0].body).toBe('Page msg 0');
      expect(page1.items[1].body).toBe('Page msg 1');

      const page2 = await getMessages(user.id, business.id, conversation.id, {
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.items).toHaveLength(2);
      expect(page2.nextCursor).toBeTruthy();
      expect(page2.items[0].body).toBe('Page msg 2');
      expect(page2.items[1].body).toBe('Page msg 3');

      const page3 = await getMessages(user.id, business.id, conversation.id, {
        limit: 2,
        cursor: page2.nextCursor!,
      });
      expect(page3.items).toHaveLength(1);
      expect(page3.nextCursor).toBeNull();
      expect(page3.items[0].body).toBe('Page msg 4');
    });

    it('returns empty list for conversation with no messages', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-empty@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Empty Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const result = await getMessages(user.id, business.id, conversation.id);
      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('returns not-found for nonexistent conversation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-listnosuch@test.com',
      );
      await expect(
        getMessages(user.id, business.id, 'nonexistent-convo-id'),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });

    it('returns not-found for cross-business conversation', async () => {
      const ownerA = await createUserInBusiness('owner-msg-listxa@test.com');
      const ownerB = await createUserInBusiness('owner-msg-listxb@test.com');
      const customerA = await createCustomer(
        ownerA.user.id,
        ownerA.business.id,
        { name: 'Customer A' },
      );
      const conversationA = await createConversation(
        ownerA.user.id,
        ownerA.business.id,
        { customerId: customerA.id },
      );
      await expect(
        getMessages(ownerB.user.id, ownerB.business.id, conversationA.id),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });
  });

  describe('authorization and multi-tenancy', () => {
    it('rejects inactive membership', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-msg-inactive@test.com',
        MembershipRole.OWNER,
        MembershipStatus.INACTIVE,
      );
      await expect(
        createMessage(user.id, business.id, 'x', {
          body: 'test',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
        }),
      ).rejects.toBeInstanceOf(AppError);
      await expect(
        getMessages(user.id, business.id, 'x'),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('rejects unauthorized role (STAFF) for conversation access', async () => {
      const { user, business } = await createUserInBusiness(
        'staff-msg@test.com',
        MembershipRole.STAFF,
      );
      await expect(
        createMessage(user.id, business.id, 'x', {
          body: 'test',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        getMessages(user.id, business.id, 'x'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('allows SUPPORT_AGENT to manage messages', async () => {
      const { user, business } = await createUserInBusiness(
        'support-msg@test.com',
        MembershipRole.SUPPORT_AGENT,
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Support Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      const created = await createMessage(
        user.id,
        business.id,
        conversation.id,
        {
          body: 'Support message',
          authorType: MessageAuthorType.HUMAN,
          channel: 'internal',
        },
      );
      expect(created.id).toBeTruthy();
      const listed = await getMessages(user.id, business.id, conversation.id);
      expect(listed.items).toHaveLength(1);
    });

    it('client-supplied requestedBusinessId cannot bypass isolation', async () => {
      const { user } = await createUserInBusiness('owner-msg-bypass@test.com');
      const otherBiz = await prisma.business.create({
        data: { name: 'Other Business' },
      });
      await expect(
        getMessages(user.id, otherBiz.id, 'x'),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('tenant isolation: messages from business A not visible to business B', async () => {
      const ownerA = await createUserInBusiness('owner-msg-isoa@test.com');
      const ownerB = await createUserInBusiness('owner-msg-isob@test.com');
      const customerA = await createCustomer(
        ownerA.user.id,
        ownerA.business.id,
        { name: 'Customer A' },
      );
      const conversationA = await createConversation(
        ownerA.user.id,
        ownerA.business.id,
        { customerId: customerA.id },
      );
      await createMessage(
        ownerA.user.id,
        ownerA.business.id,
        conversationA.id,
        {
          body: 'Private A message',
          authorType: MessageAuthorType.CUSTOMER,
          channel: 'whatsapp',
        },
      );
      await expect(
        getMessages(ownerB.user.id, ownerB.business.id, conversationA.id),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });
  });
});
