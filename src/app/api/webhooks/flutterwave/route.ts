import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';
import { verifyFlutterwaveSignature } from '../../../../features/payments/signature';
import { parseFlutterwaveWebhookPayload } from '../../../../features/payments/validation';
import {
  reconcilePaymentByReference,
} from '../../../../features/payments/payment.service';
import { prisma } from '../../../../lib/prisma';
import { PaymentAttemptStatus } from '@prisma/client';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  const signatureHeader = request.headers.get('flutterwave-signature');
  const legacyHashHeader = request.headers.get('verif-hash');

  const isValid = verifyFlutterwaveSignature(
    rawBody,
    signatureHeader,
    legacyHashHeader,
  );

  if (!isValid) {
    logger.warn('flutterwave.webhook.signature_invalid');
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 401 },
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    logger.warn('flutterwave.webhook.invalid_json');
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 },
    );
  }

  let payload;
  try {
    payload = parseFlutterwaveWebhookPayload(parsedJson);
  } catch (error) {
    logger.warn('flutterwave.webhook.invalid_payload', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Invalid webhook payload structure' },
      { status: 400 },
    );
  }

  const eventType =
    payload.event ||
    payload.type ||
    payload['event.type'] ||
    'charge.completed';

  if (eventType !== 'charge.completed') {
    logger.info('flutterwave.webhook.event_ignored', { eventType });
    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  }

  const transactionReference = payload.data.tx_ref;
  const transactionId = payload.data.id;

  if (!transactionReference || !transactionId) {
    logger.warn('flutterwave.webhook.missing_identifiers');
    return NextResponse.json(
      { error: 'Missing transaction identifiers' },
      { status: 400 },
    );
  }

  // Idempotency check: see if attempt is already recorded and completed
  const existingAttempt = await prisma.paymentAttempt.findUnique({
    where: { transactionReference },
  });

  if (!existingAttempt) {
    logger.warn('flutterwave.webhook.unknown_reference', {
      transactionReference,
      transactionId: String(transactionId),
    });
    // Return 200 so Flutterwave does not retry endlessly for unknown reference
    return NextResponse.json(
      { status: 'unknown_reference' },
      { status: 200 },
    );
  }

  if (existingAttempt.status === PaymentAttemptStatus.SUCCESSFUL) {
    logger.info('flutterwave.webhook.duplicate', {
      paymentAttemptId: existingAttempt.id,
      transactionReference,
    });
    return NextResponse.json({ status: 'duplicate' }, { status: 200 });
  }

  // Perform server-side transaction verification and atomic state transition
  try {
    const outcome = await reconcilePaymentByReference(
      transactionReference,
      transactionId,
    );

    if (outcome.outcome === 'APPLIED') {
      logger.info('flutterwave.webhook.payment_applied', {
        paymentAttemptId: outcome.paymentAttempt.id,
        transactionReference,
      });
      return NextResponse.json({ status: 'applied' }, { status: 200 });
    }

    if (outcome.outcome === 'DUPLICATE') {
      return NextResponse.json({ status: 'duplicate' }, { status: 200 });
    }

    if (outcome.outcome === 'MISMATCH') {
      logger.warn('flutterwave.webhook.verification_mismatch', {
        transactionReference,
        reason: outcome.reason,
      });
      return NextResponse.json({ status: 'mismatch' }, { status: 200 });
    }

    if (outcome.outcome === 'STATE_CONFLICT') {
      logger.warn('flutterwave.webhook.state_conflict', {
        transactionReference,
        reason: outcome.reason,
      });
      return NextResponse.json({ status: 'state_conflict' }, { status: 200 });
    }

    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  } catch (error) {
    logger.error('flutterwave.webhook.processing_error', {
      transactionReference,
      error: error instanceof Error ? error.message : String(error),
    });
    // On unexpected internal / provider errors, return 500 so Flutterwave can retry
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    );
  }
}
