import { parseWebhookPayload } from '../src/features/whatsapp/webhook-events';
import { AppError } from '../src/lib/errors';

describe('WhatsApp webhook payload validation', () => {
  const validPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '2348012345678',
                phone_number_id: 'phone-id-001',
              },
              contacts: [
                {
                  wa_id: '2348098765432',
                  profile: { name: 'Test Customer' },
                },
              ],
              messages: [
                {
                  from: '2348098765432',
                  id: 'wamid.abc123',
                  timestamp: '1692000000',
                  type: 'text',
                  text: { body: 'Hello, I need help' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it('accepts a valid text message payload', () => {
    const result = parseWebhookPayload(validPayload);
    expect(result.object).toBe('whatsapp_business_account');
    expect(result.entry).toHaveLength(1);
    expect(result.entry[0].changes).toHaveLength(1);
    const messages = result.entry[0].changes[0].value.messages;
    expect(messages).toHaveLength(1);
    expect(messages![0].type).toBe('text');
  });

  it('accepts a valid status update payload', () => {
    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '2348012345678',
                  phone_number_id: 'phone-id-001',
                },
                statuses: [
                  {
                    id: 'wamid.abc123',
                    status: 'delivered',
                    timestamp: '1692000001',
                    recipient_id: '2348098765432',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseWebhookPayload(statusPayload);
    expect(result.entry[0].changes[0].value.statuses).toHaveLength(1);
    expect(result.entry[0].changes[0].value.statuses![0].status).toBe(
      'delivered',
    );
  });

  it('rejects payload with wrong object type', () => {
    expect(() =>
      parseWebhookPayload({ object: 'instagram_account', entry: [] }),
    ).toThrow(AppError);
  });

  it('rejects payload with unknown top-level fields', () => {
    expect(() =>
      parseWebhookPayload({
        object: 'whatsapp_business_account',
        entry: [],
        extra_field: 'should not be here',
      }),
    ).toThrow(AppError);
  });

  it('rejects payload with unknown fields in message', () => {
    const badPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '2348012345678',
                  phone_number_id: 'phone-id-001',
                },
                messages: [
                  {
                    from: '2348098765432',
                    id: 'wamid.abc123',
                    timestamp: '1692000000',
                    type: 'text',
                    text: { body: 'test' },
                    evil_field: 'injected',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(() => parseWebhookPayload(badPayload)).toThrow(AppError);
  });

  it('rejects empty entry array', () => {
    expect(() =>
      parseWebhookPayload({
        object: 'whatsapp_business_account',
        entry: 'not-an-array',
      }),
    ).toThrow(AppError);
  });

  it('rejects null/undefined input', () => {
    expect(() => parseWebhookPayload(null)).toThrow(AppError);
    expect(() => parseWebhookPayload(undefined)).toThrow(AppError);
  });
});
