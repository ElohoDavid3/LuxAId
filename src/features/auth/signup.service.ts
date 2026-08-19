import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { hashPassword } from './password.service';
import { normalizeEmail } from './credentials';

const signupSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  businessName: z
    .string()
    .min(2, 'Business name must be at least 2 characters')
    .max(100, 'Business name must be at most 100 characters'),
});

export type SignupInput = z.infer<typeof signupSchema>;

export interface SignupResult {
  userId: string;
  email: string;
  name: string;
}

export async function signup(input: SignupInput): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ');
    throw new Error(message);
  }

  const { name, email, password, businessName } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
      },
    });

    const business = await tx.business.create({
      data: { name: businessName.trim() },
    });

    await tx.businessMembership.create({
      data: {
        businessId: business.id,
        userId: user.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });

    return { userId: user.id, email: user.email, name: user.name };
  });

  return result;
}
