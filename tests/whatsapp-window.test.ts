import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';
import { createCustomer } from '../src/features/customers/customer.service';
import { createConversation } from '../src/features/conversations/conversation.service';

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

describe('WhatsApp 24-hour service window', () => {
  it('conversation with recent lastInboundAt is within window', async () => {
    const { user, business } = await createUserInBusiness(
      'owner-window-within@test.com',
    );
    const customer = await createCustomer(user.id, business.id, {
      name: 'Window Test',
    });
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
      channel: 'whatsapp',
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastInboundAt: new Date() },
    });

    const updated = await prisma.conversation.findUnique({
      where: { id: conversation.id },
    });

    const FREE_FORM_WINDOW_MS = 24 * 60 * 60 * 1000;
    const withinWindow =
      updated!.lastInboundAt !== null &&
      Date.now() - updated!.lastInboundAt!.getTime() < FREE_FORM_WINDOW_MS;

    expect(withinWindow).toBe(true);
  });

  it('conversation with old lastInboundAt is outside window', async () => {
    const { user, business } = await createUserInBusiness(
      'owner-window-outside@test.com',
    );
    const customer = await createCustomer(user.id, business.id, {
      name: 'Window Outside Test',
    });
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
      channel: 'whatsapp',
    });

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastInboundAt: twoDaysAgo },
    });

    const updated = await prisma.conversation.findUnique({
      where: { id: conversation.id },
    });

    const FREE_FORM_WINDOW_MS = 24 * 60 * 60 * 1000;
    const withinWindow =
      updated!.lastInboundAt !== null &&
      Date.now() - updated!.lastInboundAt!.getTime() < FREE_FORM_WINDOW_MS;

    expect(withinWindow).toBe(false);
  });

  it('conversation with null lastInboundAt is outside window', async () => {
    const { user, business } = await createUserInBusiness(
      'owner-window-null@test.com',
    );
    const customer = await createCustomer(user.id, business.id, {
      name: 'Window Null Test',
    });
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
      channel: 'whatsapp',
    });

    const FREE_FORM_WINDOW_MS = 24 * 60 * 60 * 1000;
    const withinWindow =
      conversation.lastInboundAt !== null &&
      Date.now() - conversation.lastInboundAt!.getTime() < FREE_FORM_WINDOW_MS;

    expect(withinWindow).toBe(false);
  });
});
