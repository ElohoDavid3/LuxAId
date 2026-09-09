import { prisma } from '../src/lib/prisma';
import {
  connectFacebook,
  disconnectFacebook,
  getFacebookConnection,
} from '../src/features/settings/facebook-connection';
import { MembershipRole } from '@prisma/client';
import { createUserInBusiness, resetDatabase } from './helpers';

describe('Facebook connection', () => {
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
      'fb-connect@example.com',
    );

    const fetchMock = mockMeta({ id: 'FB-123', name: 'Adaeze Fashion' });

    const status = await connectFacebook(user.id, business.id, {
      pageId: 'FB-123',
      accessToken: 'tok_fb_secret',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = (fetchMock.mock.calls[0][0] as string) ?? '';
    expect(calledUrl).toContain('/FB-123?');
    expect(calledUrl).toContain('fields=id%2Cname');

    expect(status.connected).toBe(true);
    expect(status.pageName).toBe('Adaeze Fashion');
    expect(status).not.toHaveProperty('accessToken');

    const stored = await prisma.businessSettings.findUniqueOrThrow({
      where: { businessId: business.id },
      select: { notificationConfig: true },
    });
    const facebook = (
      stored.notificationConfig as Record<string, Record<string, unknown>>
    ).facebook;
    expect(facebook.pageId).toBe('FB-123');
    expect(facebook.accessToken).toBe('tok_fb_secret');

    const audits = await prisma.auditLog.findMany({
      where: { businessId: business.id, eventType: 'FACEBOOK_CONNECTED' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0].payload)).not.toContain('tok_fb_secret');
  });

  it('rejects a connection Meta refuses to verify', async () => {
    const { user, business } = await createUserInBusiness(
      'fb-reject@example.com',
    );

    mockMeta(
      { error: { message: 'Invalid OAuth access token', code: 190 } },
      false,
    );

    await expect(
      connectFacebook(user.id, business.id, {
        pageId: 'FB-BAD',
        accessToken: 'tok_bad',
      }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_FAILURE' });

    const status = await getFacebookConnection(user.id, business.id);
    expect(status.connected).toBe(false);
  });

  it('rejects a Page already connected to another business', async () => {
    const owner = await createUserInBusiness('fb-owner@example.com');
    const attacker = await createUserInBusiness('fb-attacker@example.com');

    await prisma.businessSettings.create({
      data: {
        businessId: owner.business.id,
        notificationConfig: {
          facebook: { pageId: 'FB-TAKEN', pageName: 'Taken Fashion' },
        },
      },
    });

    mockMeta({ id: 'FB-TAKEN', name: 'Taken Fashion' });

    await expect(
      connectFacebook(attacker.user.id, attacker.business.id, {
        pageId: 'FB-TAKEN',
        accessToken: 'tok_x',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('already connected'),
    });
  });

  it('removes the connection on disconnect and keeps other config', async () => {
    const { user, business } = await createUserInBusiness(
      'fb-disconnect@example.com',
    );

    await prisma.businessSettings.create({
      data: {
        businessId: business.id,
        notificationConfig: { email: { enabled: true } },
      },
    });

    mockMeta({ id: 'FB-DISC', name: 'Disco Fashion' });
    await connectFacebook(user.id, business.id, {
      pageId: 'FB-DISC',
      accessToken: 'tok_remove_me',
    });

    const status = await disconnectFacebook(user.id, business.id);
    expect(status.connected).toBe(false);

    const stored = await prisma.businessSettings.findUniqueOrThrow({
      where: { businessId: business.id },
      select: { notificationConfig: true },
    });
    const config = stored.notificationConfig as Record<string, unknown>;
    expect(config.facebook).toBeUndefined();
    expect(config.email).toEqual({ enabled: true });

    const audits = await prisma.auditLog.findMany({
      where: {
        businessId: business.id,
        eventType: 'FACEBOOK_DISCONNECTED',
      },
    });
    expect(audits).toHaveLength(1);
  });

  it('denies members without the business_admin scope', async () => {
    const { user, business } = await createUserInBusiness(
      'fb-scope@example.com',
      MembershipRole.SUPPORT_AGENT,
    );

    await expect(
      connectFacebook(user.id, business.id, {
        pageId: 'FB-ANY',
        accessToken: 'tok_any',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      disconnectFacebook(user.id, business.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      getFacebookConnection(user.id, business.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});