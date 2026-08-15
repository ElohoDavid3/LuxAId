import nodemailer from 'nodemailer';
import { env } from '../../lib/env';
import { AppError } from '../../lib/errors';

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export function getMailTransport() {
  if (transport) return transport;
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    throw new AppError('INTERNAL_ERROR', 'SMTP is not configured');
  }
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transport;
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  const t = getMailTransport();
  await t.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: 'Reset your OrderAId password',
    text: [
      'We received a request to reset the password for your OrderAId account.',
      '',
      `Open this link to choose a new password: ${resetUrl}`,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
  });
}
