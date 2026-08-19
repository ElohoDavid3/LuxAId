import { prisma } from '../src/lib/prisma';
import { resetDatabase, createUserInBusiness } from './helpers';
import { createCustomer } from '../src/features/customers/customer.service';
import { createConversation } from '../src/features/conversations/conversation.service';
import { sendWhatsAppReply } from '../src/features/whatsapp/send';
import { AppError } from '../src/lib/errors';

jest.mock('../src/features/whatsapp/client', () => ({
  sendTextMessage: jest.fn(),
  sendTemplateMessage: jest.fn(),
}));

import { sendTextMessage } from '../src/features/whatsapp/client';
const mockSendText = sendTextMessage as jest.MockedFunction<typeof sendTextMessage>;

beforeAll(() => resetDatabase());

afterAll(async () => {
  await prisma.$disconnect();
});

describe('WhatsApp outbound failure', () => {
  it('propagates error when WhatsApp API call fails', async () => {
    const { user, business } = await createUserInBusiness(
      'owner-send-fail@test.com',
    );

    await prisma.businessSettings.create({
      data: {
        businessId: business.id,
        notificationConfig: {
          whatsapp: {
            phoneNumberId: 'fail-phone-id',
            accessToken: 'test-token',
          },
        },
      },
    });

    // Create system user for the business
    await prisma.user.create({
      data: {
        name: 'System User',
        email: 'system@orderaid.internal',
        passwordHash: 'hash',
      },
    });
    const systemUser = await prisma.user.findUnique({
      where: { email: 'system@orderaid.internal' },
    });
    await prisma.businessMembership.create({
      data: {
        userId: systemUser!.id,
        businessId: business.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });

    const customer = await createCustomer(user.id, business.id, {
      name: 'Send Fail Test',
      phone: '2348011111111',
    });
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
      channel: 'whatsapp',
      controlState: 'AI_CONTROLLED',
    });

    mockSendText.mockRejectedValueOnce(
      new AppError('INTEGRATION_FAILURE', 'WhatsApp API error: 500'),
    );

    await expect(
      sendWhatsAppReply({
        businessId: business.id,
        conversationId: conversation.id,
        customerId: customer.id,
        replyText: 'This should fail',
      }),
    ).rejects.toThrow(AppError);

    const outboundMessages = await prisma.message.findMany({
      where: {
        businessId: business.id,
        conversationId: conversation.id,
        direction: 'OUTBOUND',
      },
    });
    expect(outboundMessages.length).toBe(0);
  });

  it('does not persist message when sendTextMessage throws', async () => {
    const { user, business } = await createUserInBusiness(
      'owner-send-nopersist@test.com',
    );

    await prisma.businessSettings.create({
      data: {
        businessId: business.id,
        notificationConfig: {
          whatsapp: {
            phoneNumberId: 'nopersist-phone-id',
            accessToken: 'test-token',
          },
        },
      },
    });

    await prisma.user.create({
      data: {
        name: 'System User 2',
        email: 'system2@orderaid.internal',
        passwordHash: 'hash',
      },
    });
    const systemUser = await prisma.user.findUnique({
      where: { email: 'system2@orderaid.internal' },
    });
    await prisma.businessMembership.create({
      data: {
        userId: systemUser!.id,
        businessId: business.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });

    const customer = await createCustomer(user.id, business.id, {
      name: 'No Persist Test',
      phone: '2348022222222',
    });
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
      channel: 'whatsapp',
      controlState: 'AI_CONTROLLED',
    });

    mockSendText.mockRejectedValueOnce(
      new AppError('INTEGRATION_FAILURE', 'Connection timeout'),
    );

    try {
      await sendWhatsAppReply({
        businessId: business.id,
        conversationId: conversation.id,
        customerId: customer.id,
        replyText: 'Should not persist',
      });
    } catch {
      // expected
    }

    const outboundMessages = await prisma.message.findMany({
      where: {
        businessId: business.id,
        conversationId: conversation.id,
        direction: 'OUTBOUND',
      },
    });
    expect(outboundMessages.length).toBe(0);
  });
});
