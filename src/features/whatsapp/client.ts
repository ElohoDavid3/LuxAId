import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { logAudit } from '../auth/audit';

const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

interface SendTextParams {
  businessId: string;
  phoneNumberId: string;
  accessToken: string;
  to: string;
  conversationId: string;
  text: string;
}

interface SendTemplateParams {
  businessId: string;
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode: string;
  parameters?: Array<{ type: string; text: string }>;
}

interface WhatsAppSendResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status: string }>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendRequest(
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<WhatsAppSendResponse> {
  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error('whatsapp.send.failed', {
          status: response.status,
          idempotencyKey,
        });

        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`WhatsApp API error: ${response.status}`);
          if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            const jitter = delay * 0.5 * Math.random();
            await sleep(delay + jitter);
            continue;
          }
        }

        throw new AppError(
          'INTEGRATION_FAILURE',
          `WhatsApp API returned ${response.status}.`,
        );
      }

      const data = (await response.json()) as WhatsAppSendResponse;
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;

      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof DOMException && error.name === 'AbortError') {
        logger.warn('whatsapp.send.timeout', { idempotencyKey, attempt });
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          const jitter = delay * 0.5 * Math.random();
          await sleep(delay + jitter);
          continue;
        }
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        const jitter = delay * 0.5 * Math.random();
        await sleep(delay + jitter);
        continue;
      }
    }
  }

  throw new AppError(
    'INTEGRATION_FAILURE',
    `WhatsApp send failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message ?? 'unknown'}`,
  );
}

export async function sendTextMessage(
  params: SendTextParams,
): Promise<{ providerMessageId: string }> {
  const { businessId, phoneNumberId, accessToken, to, conversationId, text } = params;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  };

  const idempotencyKey = `txt_${to}_${conversationId}_${Date.now()}`;

  const data = await sendRequest(
    phoneNumberId,
    accessToken,
    body,
    idempotencyKey,
  );

  const messageId = data.messages?.[0]?.id;

  await logAudit({
    businessId,
    eventType: 'WHATSAPP_MESSAGE_SENT',
    actorType: 'AI',
    payload: { to, messageType: 'text', providerMessageId: messageId },
  });

  return { providerMessageId: messageId ?? '' };
}

export async function sendTemplateMessage(
  params: SendTemplateParams,
): Promise<{ providerMessageId: string }> {
  const { businessId, phoneNumberId, accessToken, to, templateName, languageCode, parameters } = params;

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  };

  if (parameters && parameters.length > 0) {
    template.parameters = parameters;
  }

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template,
  };

  const idempotencyKey = `tpl_${to}_${templateName}_${Date.now()}`;

  const data = await sendRequest(
    phoneNumberId,
    accessToken,
    body,
    idempotencyKey,
  );

  const messageId = data.messages?.[0]?.id;

  await logAudit({
    businessId,
    eventType: 'WHATSAPP_TEMPLATE_SENT',
    actorType: 'AI',
    payload: { to, templateName, providerMessageId: messageId },
  });

  return { providerMessageId: messageId ?? '' };
}
