import { MembershipRole, MembershipStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { resetDatabase, createUserInBusiness } from './helpers';
import {
  createCustomer,
  getCustomer,
  updateCustomer,
  listCustomers,
} from '../src/features/customers/customer.service';

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

describe('Customer service', () => {
  describe('createCustomer', () => {
    it('creates a customer with valid input', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-create@test.com',
      );
      const result = await createCustomer(user.id, business.id, {
        name: 'Test Customer',
        email: 'customer@example.com',
        phone: '+2348012345678',
        location: 'Lagos',
      });
      expect(result.name).toBe('Test Customer');
      expect(result.email).toBe('customer@example.com');
      expect(result.phone).toBe('+2348012345678');
      expect(result.location).toBe('Lagos');
      expect(result.businessId).toBe(business.id);
    });

    it('creates a customer with only name', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-create-minimal@test.com',
      );
      const result = await createCustomer(user.id, business.id, {
        name: 'Minimal Customer',
      });
      expect(result.name).toBe('Minimal Customer');
      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.location).toBeNull();
    });

    it('allows duplicate email across customers', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-dup-email@test.com',
      );
      await createCustomer(user.id, business.id, {
        name: 'First',
        email: 'dup@example.com',
      });
      const second = await createCustomer(user.id, business.id, {
        name: 'Second',
        email: 'dup@example.com',
      });
      expect(second.name).toBe('Second');
      expect(second.email).toBe('dup@example.com');
    });

    it('allows duplicate phone across customers', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-dup-phone@test.com',
      );
      await createCustomer(user.id, business.id, {
        name: 'First',
        phone: '+2348000000000',
      });
      const second = await createCustomer(user.id, business.id, {
        name: 'Second',
        phone: '+2348000000000',
      });
      expect(second.name).toBe('Second');
      expect(second.phone).toBe('+2348000000000');
    });

    it('rejects missing name', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-validation@test.com',
      );
      await expect(
        createCustomer(user.id, business.id, { email: 'a@b.com' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects empty name', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-validation2@test.com',
      );
      await expect(
        createCustomer(user.id, business.id, { name: '  ' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects unexpected fields', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-strict@test.com',
      );
      await expect(
        createCustomer(user.id, business.id, {
          name: 'Valid',
          tags: ['vip'],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects client-supplied businessId in input', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-inject@test.com',
      );
      await expect(
        createCustomer(user.id, business.id, {
          name: 'Hacker',
          businessId: 'injected-business-id',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('getCustomer', () => {
    it('retrieves a customer by id', async () => {
      const { user, business } =
        await createUserInBusiness('owner-get@test.com');
      const created = await createCustomer(user.id, business.id, {
        name: 'Get Me',
      });
      const result = await getCustomer(user.id, business.id, created.id);
      expect(result.id).toBe(created.id);
      expect(result.name).toBe('Get Me');
    });

    it('returns not-found for unknown customer id', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-get-missing@test.com',
      );
      await expect(
        getCustomer(user.id, business.id, 'nonexistent-id'),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CUSTOMER' });
    });

    it('cross-business access behaves like not-found', async () => {
      const ownerA = await createUserInBusiness('owner-a@test.com');
      const ownerB = await createUserInBusiness('owner-b@test.com');
      const customerA = await createCustomer(
        ownerA.user.id,
        ownerA.business.id,
        { name: 'Customer A' },
      );
      await expect(
        getCustomer(ownerB.user.id, ownerB.business.id, customerA.id),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CUSTOMER' });
    });
  });

  describe('updateCustomer', () => {
    it('updates customer fields', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-update@test.com',
      );
      const created = await createCustomer(user.id, business.id, {
        name: 'Old Name',
      });
      const result = await updateCustomer(user.id, business.id, created.id, {
        name: 'New Name',
        location: 'Abuja',
      });
      expect(result.name).toBe('New Name');
      expect(result.location).toBe('Abuja');
      expect(result.email).toBeNull();
    });

    it('rejects update with no fields', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-update-empty@test.com',
      );
      const created = await createCustomer(user.id, business.id, {
        name: 'Has Name',
      });
      await expect(
        updateCustomer(user.id, business.id, created.id, {}),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('updates email to null', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-update-null@test.com',
      );
      const created = await createCustomer(user.id, business.id, {
        name: 'Has Email',
        email: 'had@example.com',
      });
      const result = await updateCustomer(user.id, business.id, created.id, {
        email: null,
      });
      expect(result.email).toBeNull();
    });

    it('returns not-found for unknown customer', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-update-missing@test.com',
      );
      await expect(
        updateCustomer(user.id, business.id, 'nonexistent', {
          name: 'Nope',
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CUSTOMER' });
    });
  });

  describe('listCustomers', () => {
    it('lists customers with counts', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-list@test.com',
      );
      await createCustomer(user.id, business.id, { name: 'C1' });
      await createCustomer(user.id, business.id, { name: 'C2' });
      await createCustomer(user.id, business.id, { name: 'C3' });
      const result = await listCustomers(user.id, business.id);
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.items[0].name).toBe('C3');
    });

    it('returns empty list when no customers exist', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-list-empty@test.com',
      );
      const result = await listCustomers(user.id, business.id);
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('does not include other business customers', async () => {
      const ownerA = await createUserInBusiness('owner-list-a@test.com');
      const ownerB = await createUserInBusiness('owner-list-b@test.com');
      await createCustomer(ownerA.user.id, ownerA.business.id, {
        name: 'A Customer',
      });
      await createCustomer(ownerB.user.id, ownerB.business.id, {
        name: 'B Customer',
      });
      const listA = await listCustomers(ownerA.user.id, ownerA.business.id);
      expect(listA.items).toHaveLength(1);
      expect(listA.items[0].name).toBe('A Customer');
    });
  });

  describe('authorization and multi-tenancy', () => {
    it('rejects inactive membership', async () => {
      const { user, business } = await createUserInBusiness(
        'inactive@test.com',
        MembershipRole.OWNER,
        MembershipStatus.INACTIVE,
      );
      await expect(
        createCustomer(user.id, business.id, { name: 'No' }),
      ).rejects.toBeInstanceOf(AppError);
      await expect(listCustomers(user.id, business.id)).rejects.toBeInstanceOf(
        AppError,
      );
    });

    it('rejects unauthorized role for customer CRUD', async () => {
      const { user, business } = await createUserInBusiness(
        'staff-no-scope@test.com',
        MembershipRole.STAFF,
      );
      await expect(
        createCustomer(user.id, business.id, { name: 'No' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(listCustomers(user.id, business.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('allows SUPPORT_AGENT to manage customers', async () => {
      const { user, business } = await createUserInBusiness(
        'support@test.com',
        MembershipRole.SUPPORT_AGENT,
      );
      const created = await createCustomer(user.id, business.id, {
        name: 'Support Customer',
      });
      expect(created.name).toBe('Support Customer');
      const listed = await listCustomers(user.id, business.id);
      expect(listed.items).toHaveLength(1);
    });

    it('rejects cross-business requestedBusinessId', async () => {
      const { user: userA } = await createUserInBusiness(
        'owner-cross-a@test.com',
      );
      const ownerB = await createUserInBusiness('owner-cross-b@test.com');
      await expect(
        createCustomer(userA.id, ownerB.business.id, {
          name: 'Nope',
        }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('client-supplied requestedBusinessId cannot bypass isolation', async () => {
      const { user } = await createUserInBusiness('owner-bypass@test.com');
      const otherBiz = await prisma.business.create({
        data: { name: 'Other Business' },
      });
      await expect(
        createCustomer(user.id, otherBiz.id, { name: 'Hacker' }),
      ).rejects.toBeInstanceOf(AppError);
    });
  });
});
