import { randomBytes, createHash } from 'crypto';
import * as OTPAuth from 'otpauth';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

const ISSUER = 'OrderAId';
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_LENGTH = 8;
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;

export interface TwoFactorSetup {
  otpauthUri: string;
  secret: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
}

export interface BackupCodeInfo {
  codes: string[];
}

function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateTwoFactorSecret(
  userId: string,
  email: string,
): TwoFactorSetup {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: new OTPAuth.Secret({ size: 20 }),
  });

  return {
    otpauthUri: totp.toString(),
    secret: totp.secret.base32,
  };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: '',
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token: code.trim(), window: 1 });
  return delta !== null;
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = randomBytes(Math.ceil(BACKUP_CODE_LENGTH / 2));
    const code = bytes
      .toString('hex')
      .slice(0, BACKUP_CODE_LENGTH)
      .toUpperCase();
    codes.push(code);
  }
  return codes;
}

function hashBackupCodes(codes: string[]): string {
  return JSON.stringify(codes.map((c) => hashString(c)));
}

export function generateBackupCodeHashes(): {
  plain: string[];
  hashed: string;
} {
  const plain = generateBackupCodes();
  const hashed = hashBackupCodes(plain);
  return { plain, hashed };
}

export async function enableTwoFactor(
  userId: string,
  code: string,
  secret: string,
): Promise<BackupCodeInfo> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('UNAUTHORIZED', 'Please sign in again.');
  if (user.twoFactorEnabled) {
    throw new AppError('VALIDATION_ERROR', 'Two-factor authentication is already enabled.');
  }

  const valid = verifyTotpCode(secret, code);
  if (!valid) {
    throw new AppError('VALIDATION_ERROR', 'Invalid verification code. Please try again.');
  }

  const { plain, hashed } = generateBackupCodeHashes();

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      twoFactorBackupCodes: hashed,
    },
  });

  return { codes: plain };
}

export async function disableTwoFactor(
  userId: string,
  code: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('UNAUTHORIZED', 'Please sign in again.');
  if (!user.twoFactorEnabled) {
    throw new AppError('VALIDATION_ERROR', 'Two-factor authentication is not enabled.');
  }

  if (!user.twoFactorSecret) {
    throw new AppError('INTERNAL_ERROR', 'Two-factor configuration is invalid.');
  }

  const valid = verifyTotpCode(user.twoFactorSecret, code);
  if (!valid) {
    throw new AppError('VALIDATION_ERROR', 'Invalid verification code. Please try again.');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: null,
    },
  });
}

export async function verifyLoginCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return false;
  }

  const cleanCode = code.trim().replace(/\s/g, '');

  const totpValid = verifyTotpCode(user.twoFactorSecret, cleanCode);
  if (totpValid) return true;

  if (user.twoFactorBackupCodes) {
    const hashedCodes: string[] = JSON.parse(user.twoFactorBackupCodes);
    const inputHash = hashString(cleanCode.toUpperCase());
    const codeIndex = hashedCodes.indexOf(inputHash);

    if (codeIndex !== -1) {
      const updatedCodes = [...hashedCodes];
      updatedCodes.splice(codeIndex, 1);
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorBackupCodes:
            updatedCodes.length > 0 ? JSON.stringify(updatedCodes) : null,
        },
      });
      return true;
    }
  }

  return false;
}

export async function getTwoFactorStatus(
  userId: string,
): Promise<TwoFactorStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });
  if (!user) throw new AppError('UNAUTHORIZED', 'Please sign in again.');
  return { enabled: user.twoFactorEnabled };
}
