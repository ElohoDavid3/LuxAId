import { z, ZodError } from 'zod';
import { AppError } from '../../lib/errors';

const whatsappTextMessageSchema = z
  .object({
    from: z.string().min(1),
    id: z.string().min(1),
    timestamp: z.string().min(1),
    type: z.literal('text'),
    text: z.object({ body: z.string() }),
  })
  .strict();

const whatsappMediaMessageSchema = z
  .object({
    from: z.string().min(1),
    id: z.string().min(1),
    timestamp: z.string().min(1),
    type: z.enum(['image', 'audio', 'video', 'document']),
    image: z
      .object({
        id: z.string(),
        mime_type: z.string(),
        caption: z.string().optional(),
      })
      .optional(),
    audio: z
      .object({ id: z.string(), mime_type: z.string() })
      .optional(),
    video: z
      .object({
        id: z.string(),
        mime_type: z.string(),
        caption: z.string().optional(),
      })
      .optional(),
    document: z
      .object({
        id: z.string(),
        mime_type: z.string(),
        filename: z.string().optional(),
      })
      .optional(),
  })
  .strict();

const whatsappMessageSchema = z.union([
  whatsappTextMessageSchema,
  whatsappMediaMessageSchema,
]);

const whatsappChangeSchema = z
  .object({
    field: z.string(),
    value: z
      .object({
        messaging_product: z.literal('whatsapp'),
        metadata: z
          .object({
            display_phone_number: z.string(),
            phone_number_id: z.string(),
          })
          .strict(),
        contacts: z
          .array(
            z
              .object({
                wa_id: z.string(),
                profile: z.object({ name: z.string() }).strict(),
              })
              .strict(),
          )
          .optional(),
        messages: z.array(whatsappMessageSchema).optional(),
        statuses: z
          .array(
            z
              .object({
                id: z.string(),
                status: z.enum([
                  'sent',
                  'delivered',
                  'read',
                  'played',
                  'failed',
                ]),
                timestamp: z.string(),
                recipient_id: z.string(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
  })
  .strict();

const whatsappEntrySchema = z
  .object({
    id: z.string(),
    changes: z.array(whatsappChangeSchema),
  })
  .strict();

const whatsappWebhookSchema = z
  .object({
    object: z.literal('whatsapp_business_account'),
    entry: z.array(whatsappEntrySchema),
  })
  .strict();

export type WhatsAppTextMessage = z.infer<typeof whatsappTextMessageSchema>;
export type WhatsAppMediaMessage = z.infer<typeof whatsappMediaMessageSchema>;
export type WhatsAppMessage = z.infer<typeof whatsappMessageSchema>;
export type WhatsAppStatus = {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'played' | 'failed';
  timestamp: string;
  recipient_id: string;
};
export type WhatsAppChange = z.infer<typeof whatsappChangeSchema>;
export type WhatsAppEntry = z.infer<typeof whatsappEntrySchema>;
export type WhatsAppWebhookPayload = z.infer<typeof whatsappWebhookSchema>;

export function parseWebhookPayload(
  raw: unknown,
): WhatsAppWebhookPayload {
  try {
    return whatsappWebhookSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const path = issue ? issue.path.join('.') : '';
      throw new AppError(
        'VALIDATION_ERROR',
        `WhatsApp webhook payload invalid: ${path}: ${issue?.message}`,
      );
    }
    throw error;
  }
}

export function extractInboundMessages(
  entry: WhatsAppEntry,
): Array<{ message: WhatsAppMessage; phoneNumberId: string }> {
  const results: Array<{
    message: WhatsAppMessage;
    phoneNumberId: string;
  }> = [];

  for (const change of entry.changes) {
    const phoneNumberId = change.value.metadata.phone_number_id;
    if (change.value.messages) {
      for (const message of change.value.messages) {
        results.push({ message, phoneNumberId });
      }
    }
  }

  return results;
}

export function extractStatusUpdates(
  entry: WhatsAppEntry,
): Array<{ status: WhatsAppStatus; phoneNumberId: string }> {
  const results: Array<{
    status: WhatsAppStatus;
    phoneNumberId: string;
  }> = [];

  for (const change of entry.changes) {
    const phoneNumberId = change.value.metadata.phone_number_id;
    if (change.value.statuses) {
      for (const status of change.value.statuses) {
        results.push({ status, phoneNumberId });
      }
    }
  }

  return results;
}

export function isMediaMessage(
  msg: WhatsAppMessage,
): msg is WhatsAppMediaMessage {
  return msg.type !== 'text';
}
