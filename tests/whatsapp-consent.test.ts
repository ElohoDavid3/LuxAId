import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';
import { createCustomer } from '../src/features/customers/customer.service';

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

describe('WhatsApp consent check', () => {
  it('new customers default to UNKNOWN consent status', async () => {
    const { user, business } = await createUserInBusiness(
      'owner-consent-default@test.com',
    );

    const customer = await createCustomer(user.id, business.id, {
      name: 'Consent Test',
    });

    const dbCustomer = await prisma.customer.findUnique({
      where: { id: customer.id },
    });
    expect(dbCustomer!.consentStatus).toBe('UNKNOWN');
  });

  it('customer can be opted out', async () => {
    const { user, business } = await createUserInBusiness(
      'owner-consent-optout@test.com',
    );

    const customer = await createCustomer(user.id, business.id, {
      name: 'Opt Out Test',
    });

    await prisma.customer.update({
      where: { id: customer.id },
      data: { consentStatus: 'OPTED_OUT' },
    });

    const dbCustomer = await prisma.customer.findUnique({
      where: { id: customer.id },
    });
    expect(dbCustomer!.consentStatus).toBe('OPTED_OUT');
  });

  it('customer can be opted in', async () => {
    const { user, business } = await createUserInBusiness(
      'owner-consent-optin@test.com',
    );

    const customer = await createCustomer(user.id, business.id, {
      name: 'Opt In Test',
    });

    await prisma.customer.update({
      where: { id: customer.id },
      data: { consentStatus: 'OPTED_IN' },
    });

    const dbCustomer = await prisma.customer.findUnique({
      where: { id: customer.id },
    });
    expect(dbCustomer!.consentStatus).toBe('OPTED_IN');
  });
});
