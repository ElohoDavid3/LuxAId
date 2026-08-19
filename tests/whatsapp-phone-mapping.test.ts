import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';
import { resolveBusinessFromPhoneNumberId } from '../src/features/whatsapp/phone-mapping';

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

describe('WhatsApp phone-number-ID to business mapping', () => {
  it('resolves a known phone number ID to its business', async () => {
    const { business } = await createUserInBusiness(
      'owner-phone-resolve@test.com',
    );

    await prisma.businessSettings.create({
      data: {
        businessId: business.id,
        notificationConfig: {
          whatsapp: {
            phoneNumberId: 'phone-id-12345',
            accessToken: 'test-token',
          },
        },
      },
    });

    const result = await resolveBusinessFromPhoneNumberId('phone-id-12345');
    expect(result.businessId).toBe(business.id);
    expect(result.businessName).toBe(business.name);
  });

  it('throws for an unknown phone number ID', async () => {
    await expect(
      resolveBusinessFromPhoneNumberId('unknown-phone-id'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not leak across businesses', async () => {
    const ownerA = await createUserInBusiness('owner-phone-xa@test.com');
    const ownerB = await createUserInBusiness('owner-phone-xb@test.com');

    await prisma.businessSettings.create({
      data: {
        businessId: ownerA.business.id,
        notificationConfig: {
          whatsapp: { phoneNumberId: 'phone-shared-id' },
        },
      },
    });

    await prisma.businessSettings.create({
      data: {
        businessId: ownerB.business.id,
        notificationConfig: {
          whatsapp: { phoneNumberId: 'phone-unique-b' },
        },
      },
    });

    const resultA = await resolveBusinessFromPhoneNumberId('phone-shared-id');
    expect(resultA.businessId).toBe(ownerA.business.id);

    await expect(
      resolveBusinessFromPhoneNumberId('phone-shared-id'),
    ).resolves.not.toMatchObject({ businessId: ownerB.business.id });
  });
});
