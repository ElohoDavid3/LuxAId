import { logger } from '../../lib/logger';
import { AppError } from '../../lib/errors';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_TIMEOUT_MS = 10_000;

export interface MetaGraphVerification {
  id?: string;
  username?: string;
  display_phone_number?: string;
  verified_name?: string;
  error?: { message?: string; type?: string; code?: number };
}

export async function verifyMetaAccount(
  accountId: string,
  accessToken: string,
  fields: string[],
): Promise<MetaGraphVerification> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GRAPH_API_TIMEOUT_MS);

  const params = new URLSearchParams({ access_token: accessToken });
  if (fields.length > 0) {
    params.set('fields', fields.join(','));
  }

  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(accountId)}?${params.toString()}`,
      { signal: controller.signal, cache: 'no-store' },
    );
  } catch {
    throw new AppError(
      'INTEGRATION_FAILURE',
      'Could not reach Meta to verify this connection. Please try again.',
    );
  } finally {
    clearTimeout(timeout);
  }

  const data = (await response.json().catch(() => null)) as
    | MetaGraphVerification
    | null;

  if (!response.ok || !data || data.error || data.id !== accountId) {
    logger.warn('settings.meta_verification_failed', {
      statusCode: response.status,
      errorCode: data?.error?.code,
    });
    throw new AppError(
      'INTEGRATION_FAILURE',
      'Meta rejected this account ID and access token pair. Please check them and try again.',
    );
  }

  return data;
}
