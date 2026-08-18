import { ConversationControlState } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import { resetDatabase, createUserInBusiness } from './helpers';
import {
  createConversation,
  updateControlState,
} from '../src/features/conversations/conversation.service';
import { createCustomer } from '../src/features/customers/customer.service';

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

describe('Conversation control state', () => {
  describe('updateControlState', () => {
    it('transitions AI_CONTROLLED to PENDING_HANDOFF', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-ctrl-valid@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Control Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      expect(conversation.controlState).toBe(
        ConversationControlState.AI_CONTROLLED,
      );

      const updated = await updateControlState(
        user.id,
        business.id,
        conversation.id,
        ConversationControlState.AI_CONTROLLED,
        ConversationControlState.PENDING_HANDOFF,
      );
      expect(updated.controlState).toBe(
        ConversationControlState.PENDING_HANDOFF,
      );
    });

    it('throws STATE_CONFLICT on invalid transition', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-ctrl-conflict@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Conflict Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });
      expect(conversation.controlState).toBe(
        ConversationControlState.AI_CONTROLLED,
      );

      await expect(
        updateControlState(
          user.id,
          business.id,
          conversation.id,
          ConversationControlState.HUMAN_CONTROLLED,
          ConversationControlState.PENDING_HANDOFF,
        ),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('throws STATE_CONFLICT on concurrent update', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-ctrl-concurrent@test.com',
      );
      const customer = await createCustomer(user.id, business.id, {
        name: 'Concurrent Customer',
      });
      const conversation = await createConversation(user.id, business.id, {
        customerId: customer.id,
      });

      await updateControlState(
        user.id,
        business.id,
        conversation.id,
        ConversationControlState.AI_CONTROLLED,
        ConversationControlState.PENDING_HANDOFF,
      );

      await expect(
        updateControlState(
          user.id,
          business.id,
          conversation.id,
          ConversationControlState.AI_CONTROLLED,
          ConversationControlState.PENDING_HANDOFF,
        ),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('throws UNKNOWN_CONVERSATION for nonexistent conversation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-ctrl-missing@test.com',
      );
      await expect(
        updateControlState(
          user.id,
          business.id,
          'nonexistent-id',
          ConversationControlState.AI_CONTROLLED,
          ConversationControlState.PENDING_HANDOFF,
        ),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });

    it('rejects cross-business access', async () => {
      const ownerA = await createUserInBusiness('owner-ctrl-xa@test.com');
      const ownerB = await createUserInBusiness('owner-ctrl-xb@test.com');
      const customerA = await createCustomer(
        ownerA.user.id,
        ownerA.business.id,
        { name: 'Customer A' },
      );
      const conversationA = await createConversation(
        ownerA.user.id,
        ownerA.business.id,
        { customerId: customerA.id },
      );

      await expect(
        updateControlState(
          ownerB.user.id,
          ownerB.business.id,
          conversationA.id,
          ConversationControlState.AI_CONTROLLED,
          ConversationControlState.PENDING_HANDOFF,
        ),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });
  });
});
