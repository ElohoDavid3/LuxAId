import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { verifyPassword } from '../src/features/auth/password.service';
import { changeUserPassword, updateUserProfile } from '../src/features/auth/profile.service';
import {
  createSession,
  validateSession,
} from '../src/features/auth/session.service';
import { createUserInBusiness, resetDatabase, TEST_PASSWORD } from './helpers';

describe('Profile service', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('updateUserProfile', () => {
    it('updates the user name', async () => {
      const { user } = await createUserInBusiness('profile-name@example.com');

      const result = await updateUserProfile(user.id, { name: 'Adaeze Okafor' });

      expect(result.name).toBe('Adaeze Okafor');
      expect(result.email).toBe(user.email);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.name).toBe('Adaeze Okafor');
    });

    it('trims surrounding whitespace from the name', async () => {
      const { user } = await createUserInBusiness('profile-trim@example.com');

      const result = await updateUserProfile(user.id, {
        name: '  Chinedu Balogun  ',
      });

      expect(result.name).toBe('Chinedu Balogun');
    });

    it('rejects a name shorter than 2 characters without changing the record', async () => {
      const { user } = await createUserInBusiness('profile-short@example.com');

      await expect(
        updateUserProfile(user.id, { name: 'A' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.name).toBe(user.name);
    });

    it('rejects a name longer than 100 characters', async () => {
      const { user } = await createUserInBusiness('profile-long@example.com');

      await expect(
        updateUserProfile(user.id, { name: 'a'.repeat(101) }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('writes an audit entry for the update', async () => {
      const { user, business } = await createUserInBusiness(
        'profile-audit@example.com',
      );

      await updateUserProfile(user.id, { name: 'Audit Checked' });

      const logs = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'auth.profile_updated' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorId).toBe(user.id);
    });

    it('changes the email when the correct current password is supplied', async () => {
      const { user } = await createUserInBusiness('email-change@example.com');

      const result = await updateUserProfile(user.id, {
        name: user.name,
        email: 'new-email@example.com',
        currentPassword: TEST_PASSWORD,
      });

      expect(result.email).toBe('new-email@example.com');
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.email).toBe('new-email@example.com');
    });

    it('normalizes the new email address', async () => {
      const { user } = await createUserInBusiness('email-normalize@example.com');

      const result = await updateUserProfile(user.id, {
        name: user.name,
        email: '  Normalized.Email@Example.COM ',
        currentPassword: TEST_PASSWORD,
      });

      expect(result.email).toBe('normalized.email@example.com');
    });

    it('allows submitting an unchanged email without a password', async () => {
      const { user } = await createUserInBusiness('email-same@example.com');

      const result = await updateUserProfile(user.id, {
        name: 'Same Email User',
        email: user.email,
      });

      expect(result.name).toBe('Same Email User');
      expect(result.email).toBe(user.email);
    });

    it('rejects an email change without the current password', async () => {
      const { user } = await createUserInBusiness('email-nopw@example.com');

      await expect(
        updateUserProfile(user.id, { name: user.name, email: 'taken@x.com' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.email).toBe(user.email);
    });

    it('rejects an email change with a wrong current password', async () => {
      const { user } = await createUserInBusiness('email-wrongpw@example.com');

      await expect(
        updateUserProfile(user.id, {
          name: user.name,
          email: 'other-inbox@example.com',
          currentPassword: 'definitely-wrong',
        }),
      ).rejects.toBeInstanceOf(AppError);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.email).toBe(user.email);
    });

    it('rejects an email already used by another account', async () => {
      const { user } = await createUserInBusiness('email-owner@example.com');
      await createUserInBusiness('email-taken@example.com');

      await expect(
        updateUserProfile(user.id, {
          name: user.name,
          email: 'email-taken@example.com',
          currentPassword: TEST_PASSWORD,
        }),
      ).rejects.toBeInstanceOf(AppError);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.email).toBe(user.email);
    });

    it('rejects an invalid email address', async () => {
      const { user } = await createUserInBusiness('email-invalid@example.com');

      await expect(
        updateUserProfile(user.id, {
          name: user.name,
          email: 'not-an-email',
          currentPassword: TEST_PASSWORD,
        }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('audits which fields changed, including email', async () => {
      const { user, business } = await createUserInBusiness(
        'email-audit@example.com',
      );

      await updateUserProfile(user.id, {
        name: user.name,
        email: 'email-audit-new@example.com',
        currentPassword: TEST_PASSWORD,
      });

      const logs = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'auth.profile_updated' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].payload).toMatchObject({ fields: ['name', 'email'] });
    });
  });

  describe('changeUserPassword', () => {
    it('changes the password when the current password is correct', async () => {
      const { user } = await createUserInBusiness('pw-change@example.com');
      const newPassword = 'Brand-new-password-99';

      await changeUserPassword(user.id, {
        currentPassword: TEST_PASSWORD,
        newPassword,
      });

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(await verifyPassword(TEST_PASSWORD, after.passwordHash)).toBe(
        false,
      );
      expect(await verifyPassword(newPassword, after.passwordHash)).toBe(true);
    });

    it('rejects an incorrect current password and leaves the hash unchanged', async () => {
      const { user } = await createUserInBusiness('pw-wrong@example.com');

      await expect(
        changeUserPassword(user.id, {
          currentPassword: 'definitely-wrong',
          newPassword: 'Another-new-password-1',
        }),
      ).rejects.toBeInstanceOf(AppError);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(await verifyPassword(TEST_PASSWORD, after.passwordHash)).toBe(
        true,
      );
    });

    it('rejects a new password shorter than 8 characters', async () => {
      const { user } = await createUserInBusiness('pw-short@example.com');

      await expect(
        changeUserPassword(user.id, {
          currentPassword: TEST_PASSWORD,
          newPassword: 'short',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(await verifyPassword(TEST_PASSWORD, after.passwordHash)).toBe(
        true,
      );
    });

    it('writes an audit entry for the password change', async () => {
      const { user, business } = await createUserInBusiness(
        'pw-audit@example.com',
      );

      await changeUserPassword(user.id, {
        currentPassword: TEST_PASSWORD,
        newPassword: 'Audited-new-password-1',
      });

      const logs = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'auth.password_changed' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorId).toBe(user.id);
    });

    it('revokes database-backed sessions after a password change', async () => {
      const { user } = await createUserInBusiness('pw-session@example.com');
      const { sessionToken } = await createSession(user.id);

      await changeUserPassword(user.id, {
        currentPassword: TEST_PASSWORD,
        newPassword: 'Session-kill-password-1',
      });

      expect(await validateSession(sessionToken)).toBeNull();
    });
  });
});
