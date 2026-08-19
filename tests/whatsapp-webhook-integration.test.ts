import { createHmac } from 'crypto';
import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';

const TEST_SECRET = 'test-webhook-secret-for-integration';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', TEST_SECRET).update(body).digest('hex')}`;
}

beforeAll(() => {
  resetDatabase();
  process.env.WHATSAPP_APP_SECRET = TEST_SECRET;
});

afterAll(async () => {
  delete process.env.WHATSAPP_APP_SECRET;
  await prisma.$disconnect();
});

describe('WhatsApp webhook endpoint', () => {
  describe('GET subscription verification', () => {
    it('echoes challenge when verify token matches', async () => {
      const verifyToken = 'test-verify-token-abc';
      process.env.WHATSAPP_VERIFY_TOKEN = verifyToken;

      const url = new URL('http://localhost:3000/api/webhooks/whatsapp');
      url.searchParams.set('hub.mode', 'subscribe');
      url.searchParams.set('hub.verify_token', verifyToken);
      url.searchParams.set('hub.challenge', 'challenge-12345');

      const { GET } = await import(
        '../src/app/api/webhooks/whatsapp/route'
      );
      const request = new Request(url.toString());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await GET(request as any);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('challenge-12345');

      delete process.env.WHATSAPP_VERIFY_TOKEN;
    });

    it('rejects with 403 when verify token does not match', async () => {
      process.env.WHATSAPP_VERIFY_TOKEN = 'correct-token';

      const url = new URL('http://localhost:3000/api/webhooks/whatsapp');
      url.searchParams.set('hub.mode', 'subscribe');
      url.searchParams.set('hub.verify_token', 'wrong-token');
      url.searchParams.set('hub.challenge', 'challenge-12345');

      const { GET } = await import(
        '../src/app/api/webhooks/whatsapp/route'
      );
      const request = new Request(url.toString());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await GET(request as any);

      expect(response.status).toBe(403);

      delete process.env.WHATSAPP_VERIFY_TOKEN;
    });

    it('rejects with 403 when required params are missing', async () => {
      const url = new URL('http://localhost:3000/api/webhooks/whatsapp');
      url.searchParams.set('hub.mode', 'subscribe');

      const { GET } = await import(
        '../src/app/api/webhooks/whatsapp/route'
      );
      const request = new Request(url.toString());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await GET(request as any);

      expect(response.status).toBe(403);
    });
  });

  describe('POST event processing', () => {
    it('rejects requests without signature', async () => {
      const body = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [],
      });

      const { POST } = await import(
        '../src/app/api/webhooks/whatsapp/route'
      );
      const request = new Request('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);
      expect(response.status).toBe(401);
    });

    it('rejects requests with invalid signature', async () => {
      const body = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [],
      });

      const { POST } = await import(
        '../src/app/api/webhooks/whatsapp/route'
      );
      const request = new Request('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);
      expect(response.status).toBe(401);
    });

    it('rejects malformed JSON', async () => {
      const body = 'not-valid-json';

      const { POST } = await import(
        '../src/app/api/webhooks/whatsapp/route'
      );
      const request = new Request('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': sign(body),
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);
      expect(response.status).toBe(400);
    });

    it('rejects invalid payload schema', async () => {
      const body = JSON.stringify({ object: 'invalid_type', entry: [] });

      const { POST } = await import(
        '../src/app/api/webhooks/whatsapp/route'
      );
      const request = new Request('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': sign(body),
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);
      expect(response.status).toBe(400);
    });

    it('returns 200 for valid webhook with no matching business', async () => {
      const body = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '2348012345678',
                    phone_number_id: 'unmapped-phone-id',
                  },
                  messages: [
                    {
                      from: '2348099999999',
                      id: 'wamid.test123',
                      timestamp: '1692000000',
                      type: 'text',
                      text: { body: 'Hello' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const { POST } = await import(
        '../src/app/api/webhooks/whatsapp/route'
      );
      const request = new Request('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': sign(body),
        },
      });

      const response = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(response.status).toBe(200);
      const data = (await response.json()) as { status: string };
      expect(data.status).toBe('ok');
    });

    it('processes a valid inbound message for a configured business', async () => {
      const { business } = await createUserInBusiness(
        'owner-webhook-integration@test.com',
      );

      await prisma.businessSettings.create({
        data: {
          businessId: business.id,
          notificationConfig: {
            whatsapp: {
              phoneNumberId: 'integration-phone-id',
              accessToken: 'test-access-token',
            },
          },
        },
      });

      const body = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-integration-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '2348012345678',
                    phone_number_id: 'integration-phone-id',
                  },
                  contacts: [
                    {
                      wa_id: '2348055555555',
                      profile: { name: 'Integration Test' },
                    },
                  ],
                  messages: [
                    {
                      from: '2348055555555',
                      id: 'wamid.integration-test-001',
                      timestamp: '1692000000',
                      type: 'text',
                      text: { body: 'What products do you have?' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const { POST } = await import(
        '../src/app/api/webhooks/whatsapp/route'
      );
      const request = new Request('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': sign(body),
        },
      });

      const response = await POST(request as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(response.status).toBe(200);

      await new Promise((r) => setTimeout(r, 2000));

      const customer = await prisma.customerChannelIdentity.findUnique({
        where: {
          businessId_channel_channelId: {
            businessId: business.id,
            channel: 'whatsapp',
            channelId: '2348055555555',
          },
        },
      });
      expect(customer).not.toBeNull();

      const conversation = await prisma.conversation.findFirst({
        where: {
          businessId: business.id,
          customerId: customer!.customerId,
          channel: 'whatsapp',
        },
      });
      expect(conversation).not.toBeNull();
      expect(conversation!.controlState).toBe('AI_CONTROLLED');

      const message = await prisma.message.findFirst({
        where: {
          businessId: business.id,
          conversationId: conversation!.id,
          providerMessageId: 'wamid.integration-test-001',
        },
      });
      expect(message).not.toBeNull();
      expect(message!.body).toBe('What products do you have?');
      expect(message!.direction).toBe('INBOUND');
      expect(message!.authorType).toBe('CUSTOMER');

      const updatedConversation = await prisma.conversation.findUnique({
        where: { id: conversation!.id },
      });
      expect(updatedConversation!.lastInboundAt).not.toBeNull();
    });

    it('does not create duplicate messages on redelivery', async () => {
      const { business } = await createUserInBusiness(
        'owner-webhook-dedup@test.com',
      );

      await prisma.businessSettings.create({
        data: {
          businessId: business.id,
          notificationConfig: {
            whatsapp: {
              phoneNumberId: 'dedup-phone-id',
              accessToken: 'test-access-token',
            },
          },
        },
      });

      const body = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-dedup-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '2348012345678',
                    phone_number_id: 'dedup-phone-id',
                  },
                  contacts: [
                    {
                      wa_id: '2348066666666',
                      profile: { name: 'Dedup Test' },
                    },
                  ],
                  messages: [
                    {
                      from: '2348066666666',
                      id: 'wamid.dedup-test-001',
                      timestamp: '1692000000',
                      type: 'text',
                      text: { body: 'Duplicate message test' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const { POST } = await import(
        '../src/app/api/webhooks/whatsapp/route'
      );

      const makeRequest = () =>
        new Request('http://localhost:3000/api/webhooks/whatsapp', {
          method: 'POST',
          body,
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': sign(body),
          },
        });

      const response1 = await POST(makeRequest() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(response1.status).toBe(200);

      await new Promise((r) => setTimeout(r, 1000));

      const response2 = await POST(makeRequest() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(response2.status).toBe(200);

      await new Promise((r) => setTimeout(r, 1000));

      const messages = await prisma.message.findMany({
        where: {
          businessId: business.id,
          providerMessageId: 'wamid.dedup-test-001',
        },
      });
      expect(messages.length).toBe(1);
    });
  });
});
