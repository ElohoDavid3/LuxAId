import { prisma } from '../src/lib/prisma';
import {
  connectWhatsApp,
  disconnectWhatsApp,
  getWhatsAppConnection,
} from '../src/features/settings/whatsapp-connection';
import { MembershipRole } from '@prisma/client';
import { createUserInBusiness, resetDatabase } from './helpers';

const META_PHONE_NUMBER_ID = 'PN-123';
const META_DISPLAY_NUMBER = '+234 801 234 5678';

describe('WhatsApp connection', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function mockMeta(body: unknown, ok = true) {
    return jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok,
        status: ok ? 200 : 400,
        json: async () => body,
      } as unknown as Response);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies credentials with Meta and stores the connection', async () => {
    const { user, business } = await createUserInBusiness(
      'wa-connect@example.com',
    );

    await prisma.businessSettings.create({
      data: {
        businessId: business.id,
        notificationConfig: { email: { enabled: true } },
      },
    });

    const fetchMock = mockMeta({
      id: META_PHONE_NUMBER_ID,
      display_phone_number: META_DISPLAY_NUMBER,
    });

    const status = await connectWhatsApp(user.id, business.id, {
      phoneNumberId: META_PHONE_NUMBER_ID,
      accessToken: 'tok_secret_123',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = (fetchMock.mock.calls[0][0] as string) ?? '';
    expect(calledUrl).toContain(`/${META_PHONE_NUMBER_ID}?`);
    expect(calledUrl).toContain('access_token=tok_secret_123');

    expect(status.connected).toBe(true);
    expect(status.displayPhoneNumber).toBe(META_DISPLAY_NUMBER);
    expect(status).not.toHaveProperty('accessToken');

    const stored = await prisma.businessSettings.findUniqueOrThrow({
      where: { businessId: business.id },
      select: { notificationConfig: true },
    });
    const whatsapp = (
      stored.notificationConfig as Record<string, Record<string, unknown>>
    ).whatsapp;
    expect(whatsapp.phoneNumberId).toBe(META_PHONE_NUMBER_ID);
    expect(whatsapp.accessToken).toBe('tok_secret_123');
    expect(
      (stored.notificationConfig as Record<string, unknown>).email,
    ).toEqual({ enabled: true });

    const audits = await prisma.auditLog.findMany({
      where: {
        businessId: business.id,
        eventType: 'WHATSAPP_CONNECTED',
      },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0].payload)).not.toContain('tok_secret_123');
  });

  it('rejects a connection Meta refuses to verify', async () => {
    const { user, business } = await createUserInBusiness(
      'wa-reject@example.com',
    );

    mockMeta(
      {
        error: { message: 'Invalid OAuth access token', code: 190 },
      },
      false,
    );

    await expect(
      connectWhatsApp(user.id, business.id, {
        phoneNumberId: 'PN-BAD',
        accessToken: 'tok_bad',
      }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_FAILURE' });

    const status = await getWhatsAppConnection(business.id);
    expect(status.connected).toBe(false);
  });

  it('rejects a phone number already connected to another business', async () => {
    const owner = await createUserInBusiness('wa-owner@example.com');
    const attacker = await createUserInBusiness('wa-attacker@example.com');

    await prisma.businessSettings.create({
      data: {
        businessId: owner.business.id,
        notificationConfig: {
          whatsapp: {
            phoneNumberId: 'PN-TAKEN',
            displayPhoneNumber: '+234 800 000 0000',
          },
        },
      },
    });

    mockMeta({ id: 'PN-TAKEN', display_phone_number: '+234 800 000 0000' });

    await expect(
      connectWhatsApp(attacker.user.id, attacker.business.id, {
        phoneNumberId: 'PN-TAKEN',
        accessToken: 'tok_x',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('already connected'),
    });

    const status = await getWhatsAppConnection(attacker.business.id);
    expect(status.connected).toBe(false);
  });

  it('removes the connection on disconnect but keeps other config', async () => {
    const { user, business } = await createUserInBusiness(
      'wa-disconnect@example.com',
    );

    mockMeta({ id: 'PN-DISC' });
    await connectWhatsApp(user.id, business.id, {
      phoneNumberId: 'PN-DISC',
      accessToken: 'tok_remove_me',
    });

    const status = await disconnectWhatsApp(user.id, business.id);
    expect(status.connected).toBe(false);

    const stored = await prisma.businessSettings.findUniqueOrThrow({
      where: { businessId: business.id },
      select: { notificationConfig: true },
    });
    const config = stored.notificationConfig as Record<string, unknown>;
    expect(config.whatsapp).toBeUndefined();

    const audits = await prisma.auditLog.findMany({
      where: {
        businessId: business.id,
        eventType: 'WHATSAPP_DISCONNECTED',
      },
    });
    expect(audits).toHaveLength(1);
  });

  it('denies members without the business_admin scope', async () => {
    const { user, business } = await createUserInBusiness(
      'wa-scope@example.com',
      MembershipRole.SUPPORT_AGENT,
    );

    await expect(
      connectWhatsApp(user.id, business.id, {
        phoneNumberId: 'PN-ANY',
        accessToken: 'tok_any',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(disconnectWhatsApp(user.id, business.id)).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );
  });
});
