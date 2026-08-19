import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';
import { resolveCustomerIdentity } from '../src/features/whatsapp/customer-identity';

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

describe('WhatsApp customer identity resolution', () => {
  it('creates a new customer and channel identity for unknown phone', async () => {
    const { business } = await createUserInBusiness(
      'owner-identity-new@test.com',
    );

    const result = await resolveCustomerIdentity(
      business.id,
      '2348011111111',
      'New Customer',
    );

    expect(result.isNew).toBe(true);
    expect(result.customerName).toBe('New Customer');

    const identity = await prisma.customerChannelIdentity.findUnique({
      where: {
        businessId_channel_channelId: {
          businessId: business.id,
          channel: 'whatsapp',
          channelId: '2348011111111',
        },
      },
    });
    expect(identity).not.toBeNull();

    const customer = await prisma.customer.findUnique({
      where: { id: result.customerId },
    });
    expect(customer).not.toBeNull();
    expect(customer!.consentStatus).toBe('UNKNOWN');
  });

  it('returns existing customer for known phone', async () => {
    const { business } = await createUserInBusiness(
      'owner-identity-existing@test.com',
    );

    const first = await resolveCustomerIdentity(
      business.id,
      '2348022222222',
      'First Call',
    );
    const second = await resolveCustomerIdentity(
      business.id,
      '2348022222222',
      'Second Call',
    );

    expect(second.isNew).toBe(false);
    expect(second.customerId).toBe(first.customerId);
  });

  it('does not leak across businesses', async () => {
    const ownerA = await createUserInBusiness('owner-identity-xa@test.com');
    const ownerB = await createUserInBusiness('owner-identity-xb@test.com');

    await resolveCustomerIdentity(
      ownerA.business.id,
      '2348033333333',
      'Customer A',
    );

    const resultB = await resolveCustomerIdentity(
      ownerB.business.id,
      '2348033333333',
      'Customer B',
    );

    expect(resultB.isNew).toBe(true);
    expect(resultB.customerName).toBe('Customer B');
    expect(resultB.customerId).not.toBe('');
  });

  it('uses fallback name when profile name not provided', async () => {
    const { business } = await createUserInBusiness(
      'owner-identity-fallback@test.com',
    );

    const result = await resolveCustomerIdentity(
      business.id,
      '2348044444444',
    );

    expect(result.customerName).toBe('Customer 4444');
  });
});
