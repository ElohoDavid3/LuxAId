import { env } from './env';
import { AppError } from './errors';
import { logger } from './logger';

const FLUTTERWAVE_API_BASE = 'https://api.flutterwave.com/v3';
const REQUEST_TIMEOUT_MS = 10000;

export interface CreatePaymentLinkInput {
  tx_ref: string;
  amountInKobo: number;
  currency?: string;
  redirect_url?: string;
  customer: {
    email?: string | null;
    name?: string | null;
    phonenumber?: string | null;
  };
  customizations?: {
    title?: string;
    description?: string;
    logo?: string;
  };
}

export interface FlutterwaveTransactionData {
  id: number | string;
  tx_ref: string;
  flw_ref?: string;
  amount: number;
  currency: string;
  status: string;
  customer?: {
    id?: number;
    name?: string;
    phone_number?: string;
    email?: string;
  };
  [key: string]: unknown;
}

export function getFlutterwaveSecretKey(): string {
  const secretKey = env.FLW_SECRET_KEY || process.env.FLW_SECRET_KEY;
  if (!secretKey) {
    throw new AppError(
      'INTEGRATION_FAILURE',
      'Flutterwave secret key is not configured.',
    );
  }
  return secretKey;
}

export function getFlutterwaveSecretHash(): string {
  const secretHash = env.FLW_SECRET_HASH || process.env.FLW_SECRET_HASH;
  if (!secretHash) {
    throw new AppError(
      'INTEGRATION_FAILURE',
      'Flutterwave webhook secret hash is not configured.',
    );
  }
  return secretHash;
}

/**
 * Creates a hosted payment checkout link via Flutterwave Standard API.
 * Converts amount from minor units (kobo) to major currency units (Naira).
 */
export async function createPaymentLink(
  input: CreatePaymentLinkInput,
): Promise<{ link: string }> {
  const secretKey = getFlutterwaveSecretKey();
  const amountInNaira = input.amountInKobo / 100;
  const currency = input.currency ?? 'NGN';

  const body = {
    tx_ref: input.tx_ref,
    amount: amountInNaira,
    currency,
    redirect_url: input.redirect_url,
    customer: {
      email: input.customer.email || 'customer@orderaid.internal',
      name: input.customer.name || 'Valued Customer',
      phonenumber: input.customer.phonenumber || undefined,
    },
    customizations: input.customizations,
  };

  try {
    const response = await fetch(`${FLUTTERWAVE_API_BASE}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = (await response.json()) as {
      status?: string;
      message?: string;
      data?: { link?: string };
    };

    if (!response.ok || data.status !== 'success' || !data.data?.link) {
      logger.error('flutterwave.create_payment_link_failed', {
        tx_ref: input.tx_ref,
        status: response.status,
        message: data.message,
      });
      throw new AppError(
        'INTEGRATION_FAILURE',
        data.message || 'Failed to generate Flutterwave payment link.',
      );
    }

    return { link: data.data.link };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('flutterwave.create_payment_link_error', {
      tx_ref: input.tx_ref,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(
      'INTEGRATION_FAILURE',
      'Could not reach Flutterwave to generate payment link.',
    );
  }
}

/**
 * Server-side transaction verification calling Flutterwave's verify endpoint.
 */
export async function verifyTransaction(
  transactionId: string | number,
): Promise<FlutterwaveTransactionData> {
  const secretKey = getFlutterwaveSecretKey();

  try {
    const response = await fetch(
      `${FLUTTERWAVE_API_BASE}/transactions/${encodeURIComponent(String(transactionId))}/verify`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    const data = (await response.json()) as {
      status?: string;
      message?: string;
      data?: FlutterwaveTransactionData;
    };

    if (!response.ok || data.status !== 'success' || !data.data) {
      logger.warn('flutterwave.verify_transaction_failed', {
        transactionId: String(transactionId),
        status: response.status,
        message: data.message,
      });
      throw new AppError(
        'INTEGRATION_FAILURE',
        data.message || 'Failed to verify transaction with Flutterwave.',
      );
    }

    return data.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('flutterwave.verify_transaction_error', {
      transactionId: String(transactionId),
      error: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(
      'INTEGRATION_FAILURE',
      'Could not reach Flutterwave for transaction verification.',
    );
  }
}
