/**
 * WhatsApp provider integration tests.
 *
 * Tests the actual HTTP layer of the WhatsApp client with mocked fetch,
 * verifying retry behavior, timeout handling, 24h window template fallback,
 * idempotency, and message persistence end-to-end.
 */

import {
  ConversationControlState,
  MembershipRole,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';
import { createCustomer } from '../src/features/customers/customer.service';
import { createConversation } from '../src/features/conversations/conversation.service';
import { sendWhatsAppReply } from '../src/features/whatsapp/send';
import { sendTextMessage, sendTemplateMessage } from '../src/features/whatsapp/client';
import { AppError } from '../src/lib/errors';

// Mock audit logging for direct client tests that use fake business IDs
jest.mock('../src/features/auth/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

beforeAll(() => resetDatabase());
afterAll(async () => {
  await prisma.$disconnect();
});

let testCounter = 0;
let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetchSuccess(providerMessageId = 'wamid.test-msg-001') {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      messaging_product: 'whatsapp',
      contacts: [{ input: '2348010000001', wa_id: '2348010000001' }],
      messages: [{ id: providerMessageId, message_status: 'sent' }],
    }),
  });
}

function mockFetchRetryThenSuccess(retriesBeforeSuccess: number) {
  let callCount = 0;
  global.fetch = jest.fn().mockImplementation(async () => {
    callCount++;
    if (callCount <= retriesBeforeSuccess) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Server Error' } }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        messaging_product: 'whatsapp',
        contacts: [{ input: '2348010000001', wa_id: '2348010000001' }],
        messages: [{ id: 'wamid.retry-ok', message_status: 'sent' }],
      }),
    };
  });
}

function mockFetchRateLimitThenSuccess(retriesBeforeSuccess: number) {
  let callCount = 0;
  global.fetch = jest.fn().mockImplementation(async () => {
    callCount++;
    if (callCount <= retriesBeforeSuccess) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit exceeded' } }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        messaging_product: 'whatsapp',
        contacts: [{ input: '2348010000001', wa_id: '2348010000001' }],
        messages: [{ id: 'wamid.ratelimit-ok', message_status: 'sent' }],
      }),
    };
  });
}

function mockFetchPermanentFailure(status: number) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: { message: `Error ${status}` } }),
  });
}

function mockFetchTimeout() {
  global.fetch = jest.fn().mockImplementation(async () => {
    // Simulate AbortController timeout by throwing AbortError
    const error = new DOMException('The operation was aborted.', 'AbortError');
    throw error;
  });
}

async function setupTestBusiness() {
  const suffix = `whatsapp-prov-${++testCounter}`;
  const { user, business } = await createUserInBusiness(`owner-${suffix}@test.com`);

  await prisma.businessSettings.create({
    data: {
      businessId: business.id,
      notificationConfig: {
        whatsapp: {
          phoneNumberId: `phone-${suffix}`,
          accessToken: `token-${suffix}`,
        },
      },
    },
  });

  // System user
  const systemUser = await prisma.user.create({
    data: {
      name: 'System',
      email: `sys-${suffix}@orderaid.internal`,
      passwordHash: 'hash',
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
    name: 'Provider Test Customer',
    phone: '2348010000001',
  });

  // Conversation with lastInboundAt set to now (within 24h window)
  const conversation = await createConversation(user.id, business.id, {
    customerId: customer.id,
    channel: 'whatsapp',
    controlState: ConversationControlState.AI_CONTROLLED,
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastInboundAt: new Date() },
  });

  return { user, business, systemUser, customer, conversation, suffix };
}

describe('WhatsApp provider integration (mocked fetch)', () => {
  describe('sendTextMessage direct tests', () => {
    it('sends text message and returns provider message ID', async () => {
      mockFetchSuccess('wamid.direct-text-001');

      const result = await sendTextMessage({
        businessId: 'test-biz',
        phoneNumberId: 'phone-123',
        accessToken: 'token-abc',
        to: '2348010000001',
        conversationId: 'conv-123',
        text: 'Hello from test',
      });

      expect(result.providerMessageId).toBe('wamid.direct-text-001');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/messages');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer token-abc');
      expect(options.headers['Idempotency-Key']).toBeDefined();
      const body = JSON.parse(options.body);
      expect(body.type).toBe('text');
      expect(body.text.body).toBe('Hello from test');
      expect(body.to).toBe('2348010000001');
    });

    it('retries on 500 errors and succeeds', async () => {
      mockFetchRetryThenSuccess(2);

      const result = await sendTextMessage({
        businessId: 'test-biz',
        phoneNumberId: 'phone-123',
        accessToken: 'token-abc',
        to: '2348010000001',
        conversationId: 'conv-123',
        text: 'Retry test',
      });

      expect(result.providerMessageId).toBe('wamid.retry-ok');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('retries on 429 rate limit and succeeds', async () => {
      mockFetchRateLimitThenSuccess(1);

      const result = await sendTextMessage({
        businessId: 'test-biz',
        phoneNumberId: 'phone-123',
        accessToken: 'token-abc',
        to: '2348010000001',
        conversationId: 'conv-123',
        text: 'Rate limit test',
      });

      expect(result.providerMessageId).toBe('wamid.ratelimit-ok');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('throws INTEGRATION_FAILURE after exhausting all retries', async () => {
      mockFetchPermanentFailure(500);

      await expect(
        sendTextMessage({
          businessId: 'test-biz',
          phoneNumberId: 'phone-123',
          accessToken: 'token-abc',
          to: '2348010000001',
          conversationId: 'conv-123',
          text: 'Exhaust retries',
        }),
      ).rejects.toMatchObject({ code: 'INTEGRATION_FAILURE' });

      // 1 initial + 3 retries = 4 total
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('throws INTEGRATION_FAILURE for 400-level errors without retrying', async () => {
      mockFetchPermanentFailure(400);

      await expect(
        sendTextMessage({
          businessId: 'test-biz',
          phoneNumberId: 'phone-123',
          accessToken: 'token-abc',
          to: '2348010000001',
          conversationId: 'conv-123',
          text: 'Bad request',
        }),
      ).rejects.toMatchObject({ code: 'INTEGRATION_FAILURE' });

      // 400 is not retried
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('retries on AbortError (timeout) and succeeds', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          const error = new DOMException('The operation was aborted.', 'AbortError');
          throw error;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messaging_product: 'whatsapp',
            contacts: [{ input: '2348010000001', wa_id: '2348010000001' }],
            messages: [{ id: 'wamid.timeout-ok', message_status: 'sent' }],
          }),
        };
      });

      const result = await sendTextMessage({
        businessId: 'test-biz',
        phoneNumberId: 'phone-123',
        accessToken: 'token-abc',
        to: '2348010000001',
        conversationId: 'conv-123',
        text: 'Timeout retry',
      });

      expect(result.providerMessageId).toBe('wamid.timeout-ok');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendTemplateMessage direct tests', () => {
    it('sends template message with correct payload structure', async () => {
      mockFetchSuccess('wamid.tpl-001');

      const result = await sendTemplateMessage({
        businessId: 'test-biz',
        phoneNumberId: 'phone-123',
        accessToken: 'token-abc',
        to: '2348010000001',
        templateName: 'orderaid_reply',
        languageCode: 'en_US',
        parameters: [{ type: 'text', text: 'Your order is ready' }],
      });

      expect(result.providerMessageId).toBe('wamid.tpl-001');
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.type).toBe('template');
      expect(body.template.name).toBe('orderaid_reply');
      expect(body.template.language.code).toBe('en_US');
      expect(body.template.parameters).toEqual([
        { type: 'text', text: 'Your order is ready' },
      ]);
    });

    it('sends template without parameters when none provided', async () => {
      mockFetchSuccess('wamid.tpl-noparams');

      await sendTemplateMessage({
        businessId: 'test-biz',
        phoneNumberId: 'phone-123',
        accessToken: 'token-abc',
        to: '2348010000001',
        templateName: 'hello_world',
        languageCode: 'en_US',
      });

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.template.parameters).toBeUndefined();
    });
  });

  describe('sendWhatsAppReply end-to-end with mocked provider', () => {
    it('sends free-form text within 24h window and persists outbound message', async () => {
      const { business, customer, conversation } = await setupTestBusiness();
      mockFetchSuccess('wamid.e2e-001');

      await sendWhatsAppReply({
        businessId: business.id,
        conversationId: conversation.id,
        customerId: customer.id,
        replyText: 'Here is your free-form reply',
      });

      // Verify outbound message persisted
      const message = await prisma.message.findFirst({
        where: {
          businessId: business.id,
          conversationId: conversation.id,
          direction: 'OUTBOUND',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(message).not.toBeNull();
      expect(message!.body).toBe('Here is your free-form reply');
      expect(message!.providerMessageId).toBe('wamid.e2e-001');
      expect(message!.channel).toBe('whatsapp');
      expect(message!.authorType).toBe('AI');
    });

    it('sends template message when outside 24h window', async () => {
      const { business, customer, conversation } = await setupTestBusiness();

      // Set lastInboundAt to 25 hours ago (outside window)
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastInboundAt: twentyFiveHoursAgo },
      });

      mockFetchSuccess('wamid.template-001');

      await sendWhatsAppReply({
        businessId: business.id,
        conversationId: conversation.id,
        customerId: customer.id,
        replyText: 'Template fallback reply',
      });

      // Verify template was sent (check payload)
      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(callBody.type).toBe('template');
      expect(callBody.template.name).toBe('orderaid_reply');

      // Verify message persisted
      const message = await prisma.message.findFirst({
        where: {
          businessId: business.id,
          conversationId: conversation.id,
          direction: 'OUTBOUND',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(message).not.toBeNull();
      expect(message!.body).toBe('Template fallback reply');
    });

    it('retries on provider 500 error and persists on eventual success', async () => {
      const { business, customer, conversation } = await setupTestBusiness();
      mockFetchRetryThenSuccess(1);

      await sendWhatsAppReply({
        businessId: business.id,
        conversationId: conversation.id,
        customerId: customer.id,
        replyText: 'Retry then persist',
      });

      const message = await prisma.message.findFirst({
        where: {
          businessId: business.id,
          conversationId: conversation.id,
          direction: 'OUTBOUND',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(message).not.toBeNull();
      expect(message!.body).toBe('Retry then persist');
    });

    it('propagates error when provider permanently fails', async () => {
      const { business, customer, conversation } = await setupTestBusiness();
      mockFetchPermanentFailure(500);

      await expect(
        sendWhatsAppReply({
          businessId: business.id,
          conversationId: conversation.id,
          customerId: customer.id,
          replyText: 'This will fail',
        }),
      ).rejects.toMatchObject({ code: 'INTEGRATION_FAILURE' });

      // No outbound message should be persisted
      const messages = await prisma.message.findMany({
        where: {
          businessId: business.id,
          conversationId: conversation.id,
          direction: 'OUTBOUND',
        },
      });
      expect(messages).toHaveLength(0);
    });

    it('silently returns for empty reply without calling provider', async () => {
      const { business, customer, conversation } = await setupTestBusiness();
      mockFetchSuccess();

      await sendWhatsAppReply({
        businessId: business.id,
        conversationId: conversation.id,
        customerId: customer.id,
        replyText: '',
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('silently returns when customer is opted out', async () => {
      const { business, user, conversation } = await setupTestBusiness();
      const optedOutCustomer = await createCustomer(user.id, business.id, {
        name: 'Opted Out',
        phone: '2348019999999',
      });
      // Update consent status after creation (createCustomer schema doesn't accept consentStatus)
      await prisma.customer.update({
        where: { id: optedOutCustomer.id },
        data: { consentStatus: 'OPTED_OUT' },
      });

      // Update conversation to use opted-out customer
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { customerId: optedOutCustomer.id },
      });

      mockFetchSuccess();

      await sendWhatsAppReply({
        businessId: business.id,
        conversationId: conversation.id,
        customerId: optedOutCustomer.id,
        replyText: 'Should not send',
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('silently returns when conversation is not AI_CONTROLLED', async () => {
      const { business, customer, conversation } = await setupTestBusiness();

      // Transition to HUMAN_CONTROLLED
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { controlState: ConversationControlState.HUMAN_CONTROLLED },
      });

      mockFetchSuccess();

      await sendWhatsAppReply({
        businessId: business.id,
        conversationId: conversation.id,
        customerId: customer.id,
        replyText: 'Should not send',
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
