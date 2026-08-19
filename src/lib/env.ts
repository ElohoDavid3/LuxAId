import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),
  NEXTAUTH_SECRET: z
    .string()
    .min(16, 'NEXTAUTH_SECRET must be at least 16 characters'),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().trim().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().trim().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().trim().min(1).optional(),
});

export const env = envSchema.parse(process.env);
