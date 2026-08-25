import { prisma } from '../src/lib/prisma';
import {
  connectInstagram,
  disconnectInstagram,
  getInstagramConnection,
} from '../src/features/settings/instagram-connection';
import { MembershipRole } from '@prisma/client';
import { createUserInBusiness, resetDatabase } from './helpers';

describe('Instagram connection', () => {
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
      'ig-connect@example.com',
    );

    const fetchMock = mockMeta({ id: 'IG-123', username: 'adaezefashion' });

    const status = await connectInstagram(user.id, business.id, {
      instagramAccountId: 'IG-123',
      accessToken: 'tok_ig_secret',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = (fetchMock.mock.calls[0][0] as string) ?? '';
    expect(calledUrl).toContain('/IG-123?');
    expect(calledUrl).toContain('fields=id%2Cusername');

    expect(status.connected).toBe(true);
    expect(status.username).toBe('adaezefashion');
    expect(status).not.toHaveProperty('accessToken');

    const stored = await prisma.businessSettings.findUniqueOrThrow({
      where: { businessId: business.id },
      select: { notificationConfig: true },
    });
    const instagram = (
      stored.notificationConfig as Record<string, Record<string, unknown>>
    ).instagram;
    expect(instagram.instagramAccountId).toBe('IG-123');
    expect(instagram.accessToken).toBe('tok_ig_secret');

    const audits = await prisma.auditLog.findMany({
      where: { businessId: business.id, eventType: 'INSTAGRAM_CONNECTED' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0].payload)).not.toContain('tok_ig_secret');
  });

  it('rejects a connection Meta refuses to verify', async () => {
    const { user, business } = await createUserInBusiness(
      'ig-reject@example.com',
    );

    mockMeta(
      { error: { message: 'Invalid OAuth access token', code: 190 } },
      false,
    );

    await expect(
      connectInstagram(user.id, business.id, {
        instagramAccountId: 'IG-BAD',
        accessToken: 'tok_bad',
      }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_FAILURE' });

    const status = await getInstagramConnection(business.id);
    expect(status.connected).toBe(false);
  });

  it('rejects an account already connected to another business', async () => {
    const owner = await createUserInBusiness('ig-owner@example.com');
    const attacker = await createUserInBusiness('ig-attacker@example.com');

    await prisma.businessSettings.create({
      data: {
        businessId: owner.business.id,
        notificationConfig: {
          instagram: { instagramAccountId: 'IG-TAKEN', username: 'taken' },
        },
      },
    });

    mockMeta({ id: 'IG-TAKEN', username: 'taken' });

    await expect(
      connectInstagram(attacker.user.id, attacker.business.id, {
        instagramAccountId: 'IG-TAKEN',
        accessToken: 'tok_x',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('already connected'),
    });
  });

  it('removes the connection on disconnect', async () => {
    const { user, business } = await createUserInBusiness(
      'ig-disconnect@example.com',
    );

    mockMeta({ id: 'IG-DISC', username: 'disco' });
    await connectInstagram(user.id, business.id, {
      instagramAccountId: 'IG-DISC',
      accessToken: 'tok_remove_me',
    });

    const status = await disconnectInstagram(user.id, business.id);
    expect(status.connected).toBe(false);

    const stored = await prisma.businessSettings.findUniqueOrThrow({
      where: { businessId: business.id },
      select: { notificationConfig: true },
    });
    expect(
      (stored.notificationConfig as Record<string, unknown>).instagram,
    ).toBeUndefined();
  });

  it('denies members without the business_admin scope', async () => {
    const { user, business } = await createUserInBusiness(
      'ig-scope@example.com',
      MembershipRole.SUPPORT_AGENT,
    );

    await expect(
      connectInstagram(user.id, business.id, {
        instagramAccountId: 'IG-ANY',
        accessToken: 'tok_any',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      disconnectInstagram(user.id, business.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
