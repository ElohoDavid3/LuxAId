import { prisma } from '../src/lib/prisma';
import { authorizeCredentials } from '../src/features/auth/credentials';
import { verifyPassword } from '../src/features/auth/password.service';
import {
  createSession,
  generateSessionToken,
  invalidateSession,
  validateSession,
} from '../src/features/auth/session.service';
import { createUser, resetDatabase, TEST_PASSWORD } from './helpers';

describe('Authentication', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('credentials', () => {
    it('returns the verified user for valid credentials', async () => {
      const user = await createUser('owner@example.com');
      const result = await authorizeCredentials(user.email, TEST_PASSWORD);
      expect(result).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
        twoFactorPending: false,
      });
    });

    it('returns null for an invalid password', async () => {
      const user = await createUser('wrongpw@example.com');
      const result = await authorizeCredentials(user.email, 'definitely-wrong');
      expect(result).toBeNull();
    });

    it('returns the same null result for an unknown email (uniform response)', async () => {
      const unknown = await authorizeCredentials(
        'nobody@example.com',
        TEST_PASSWORD,
      );
      expect(unknown).toBeNull();

      const wrongPassword = await authorizeCredentials(
        'wrongpw2@example.com',
        'definitely-wrong',
      );
      expect(wrongPassword).toBeNull();

      const user = await prisma.user.findUnique({
        where: { email: 'nobody@example.com' },
      });
      expect(user).toBeNull();
    });
  });

  describe('sessions', () => {
    it('creates a valid authenticated session that resolves its user', async () => {
      const user = await createUser('session@example.com');
      const { sessionToken } = await createSession(user.id);

      const validated = await validateSession(sessionToken);
      expect(validated).not.toBeNull();
      expect(validated?.userId).toBe(user.id);
      expect(validated?.user.id).toBe(user.id);
      expect(validated?.expires.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects an expired session and cleans up the row', async () => {
      const user = await createUser('expired@example.com');
      const { sessionToken } = await createSession(user.id, -60_000);

      const validated = await validateSession(sessionToken);
      expect(validated).toBeNull();

      const row = await prisma.session.findUnique({
        where: { sessionToken },
      });
      expect(row).toBeNull();
    });

    it('logout invalidates the server-side session', async () => {
      const user = await createUser('logout@example.com');
      const { sessionToken } = await createSession(user.id);

      await invalidateSession(sessionToken);

      expect(await validateSession(sessionToken)).toBeNull();
      const row = await prisma.session.findUnique({
        where: { sessionToken },
      });
      expect(row).toBeNull();
    });

    it('enforces a unique session token', async () => {
      const user = await createUser('unique@example.com');
      const sessionToken = generateSessionToken();

      await prisma.session.create({
        data: { sessionToken, userId: user.id, expires: new Date() },
      });
      await expect(
        prisma.session.create({
          data: { sessionToken, userId: user.id, expires: new Date() },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('password hashing', () => {
    it('never stores the plaintext password', async () => {
      const user = await createUser('hash@example.com');
      expect(user.passwordHash).not.toContain(TEST_PASSWORD);
      expect(await verifyPassword(TEST_PASSWORD, user.passwordHash)).toBe(true);
    });
  });
});
