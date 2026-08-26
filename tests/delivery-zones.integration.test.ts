import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { MembershipRole } from '@prisma/client';
import {
  createDeliveryZone,
  deleteDeliveryZone,
  listDeliveryZones,
  updateDeliveryZone,
} from '../src/features/delivery/delivery-zone.service';
import { createUserInBusiness } from './helpers';

function baseInput() {
  return {
    name: 'Lagos Mainland',
    fee: 150000,
    coverage: ['Yaba', 'Surulere', 'Ikeja'],
  };
}

describe('Delivery zones', () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Business", "User" CASCADE');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('create', () => {
    it('creates a zone under the owning business and writes an audit entry', async () => {
      const { user, business } = await createUserInBusiness('dz-create@example.com');

      const zone = await createDeliveryZone(user.id, business.id, baseInput());

      expect(zone.businessId).toBe(business.id);
      expect(zone.name).toBe('Lagos Mainland');
      expect(zone.fee).toBe(150000);

      const row = await prisma.deliveryZone.findUniqueOrThrow({
        where: { id: zone.id },
      });
      expect(row.coverage).toEqual(['Yaba', 'Surulere', 'Ikeja']);

      const logs = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'DELIVERY_ZONE_CREATED' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorId).toBe(user.id);
      expect(logs[0].payload).toMatchObject({ zoneId: zone.id });
    });

    it('rejects an empty name', async () => {
      const { user, business } = await createUserInBusiness('dz-empty-name@example.com');

      await expect(
        createDeliveryZone(user.id, business.id, { ...baseInput(), name: '   ' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects empty coverage areas', async () => {
      const { user, business } = await createUserInBusiness('dz-empty-cov@example.com');

      await expect(
        createDeliveryZone(user.id, business.id, { ...baseInput(), coverage: [] }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('rejects a negative fee', async () => {
      const { user, business } = await createUserInBusiness('dz-negative@example.com');

      await expect(
        createDeliveryZone(user.id, business.id, { ...baseInput(), fee: -1 }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('denies staff without the business_admin scope', async () => {
      const { user, business } = await createUserInBusiness(
        'dz-staff@example.com',
        MembershipRole.STAFF,
      );

      await expect(
        createDeliveryZone(user.id, business.id, baseInput()),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('update', () => {
    it('updates name, fee, and coverage', async () => {
      const { user, business } = await createUserInBusiness('dz-update@example.com');
      const zone = await createDeliveryZone(user.id, business.id, baseInput());

      const updated = await updateDeliveryZone(user.id, business.id, zone.id, {
        name: 'Lagos Island',
        fee: 200000,
        coverage: ['Lekki', 'Ikoyi'],
      });

      expect(updated.name).toBe('Lagos Island');
      expect(updated.fee).toBe(200000);
      expect(updated.coverage).toEqual(['Lekki', 'Ikoyi']);
    });

    it('supports partial updates and writes an audit entry', async () => {
      const { user, business } = await createUserInBusiness('dz-partial@example.com');
      const zone = await createDeliveryZone(user.id, business.id, baseInput());

      await updateDeliveryZone(user.id, business.id, zone.id, { fee: 175000 });

      const row = await prisma.deliveryZone.findUniqueOrThrow({
        where: { id: zone.id },
      });
      expect(row.name).toBe('Lagos Mainland');
      expect(row.fee).toBe(175000);
      expect(row.coverage).toEqual(['Yaba', 'Surulere', 'Ikeja']);

      const logs = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'DELIVERY_ZONE_UPDATED' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].payload).toMatchObject({ fields: ['fee'] });
    });

    it('rejects an unknown zone id within the same business', async () => {
      const { user, business } = await createUserInBusiness('dz-unknown@example.com');

      await expect(
        updateDeliveryZone(user.id, business.id, 'nonexistent-id', { fee: 1000 }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_DELIVERY_ZONE' });
    });

    it('denies cross-business access', async () => {
      const a = await createUserInBusiness('dz-cross-a@example.com');
      const b = await createUserInBusiness('dz-cross-b@example.com');
      const zone = await createDeliveryZone(a.user.id, a.business.id, baseInput());

      await expect(
        updateDeliveryZone(b.user.id, b.business.id, zone.id, { fee: 1 }),
      ).rejects.toBeInstanceOf(AppError);

      const row = await prisma.deliveryZone.findUniqueOrThrow({
        where: { id: zone.id },
      });
      expect(row.fee).toBe(150000);
    });
  });

  describe('delete', () => {
    it('deletes the zone and writes an audit entry', async () => {
      const { user, business } = await createUserInBusiness('dz-delete@example.com');
      const zone = await createDeliveryZone(user.id, business.id, baseInput());

      await deleteDeliveryZone(user.id, business.id, zone.id);

      const row = await prisma.deliveryZone.findUnique({
        where: { id: zone.id },
      });
      expect(row).toBeNull();

      const logs = await prisma.auditLog.findMany({
        where: { businessId: business.id, eventType: 'DELIVERY_ZONE_DELETED' },
      });
      expect(logs).toHaveLength(1);
    });

    it('denies cross-business deletion', async () => {
      const a = await createUserInBusiness('dz-del-a@example.com');
      const b = await createUserInBusiness('dz-del-b@example.com');
      const zone = await createDeliveryZone(a.user.id, a.business.id, baseInput());

      await expect(
        deleteDeliveryZone(b.user.id, b.business.id, zone.id),
      ).rejects.toBeInstanceOf(AppError);

      const row = await prisma.deliveryZone.findUniqueOrThrow({
        where: { id: zone.id },
      });
      expect(row.id).toBe(zone.id);
    });
  });

  describe('list', () => {
    it('lists only the zones of the requesting business, ordered by name', async () => {
      const a = await createUserInBusiness('dz-list-a@example.com');
      const b = await createUserInBusiness('dz-list-b@example.com');

      await createDeliveryZone(a.user.id, a.business.id, {
        name: 'Zone C',
        fee: 30000,
        coverage: ['Area 3'],
      });
      await createDeliveryZone(a.user.id, a.business.id, {
        name: 'Zone A',
        fee: 10000,
        coverage: ['Area 1'],
      });
      await createDeliveryZone(b.user.id, b.business.id, {
        name: 'Other Business Zone',
        fee: 50000,
        coverage: ['Area X'],
      });

      const zones = await listDeliveryZones(a.user.id, a.business.id);
      expect(zones.map((z) => z.name)).toEqual(['Zone A', 'Zone C']);
      expect(zones.every((z) => z.businessId === a.business.id)).toBe(true);
    });
  });
});
