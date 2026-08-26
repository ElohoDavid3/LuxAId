import {
  EscalationStatus,
  MembershipRole,
  MembershipStatus,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { AppError } from '../src/lib/errors';
import {
  resetDatabase,
  createUser,
  createMembership,
  createUserInBusiness,
} from './helpers';
import {
  assignEscalation,
  cancelEscalation,
  createEscalation,
  reassignEscalation,
  resolveEscalation,
} from '../src/features/escalations/escalation.service';
import { createCustomer } from '../src/features/customers/customer.service';
import { createConversation } from '../src/features/conversations/conversation.service';

beforeAll(() => resetDatabase());

afterAll(() => prisma.$disconnect());

async function createConversationForTest(
  user: { id: string },
  business: { id: string },
) {
  const customer = await createCustomer(user.id, business.id, {
    name: 'Escalation Customer',
  });
  return createConversation(user.id, business.id, {
    customerId: customer.id,
  });
}

describe('Escalation service', () => {
  describe('createEscalation', () => {
    it('creates an escalation with OPEN status', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-create@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const result = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Customer needs help' },
      );
      expect(result.status).toBe(EscalationStatus.OPEN);
      expect(result.reason).toBe('Customer needs help');
      expect(result.businessId).toBe(business.id);
      expect(result.conversationId).toBe(conversation.id);
      expect(result.assigneeId).toBeNull();
      expect(result.resolvedAt).toBeNull();
      expect(result.id).toBeTruthy();
    });

    it('returns not-found for nonexistent conversation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-nosuch@test.com',
      );
      await expect(
        createEscalation(user.id, business.id, 'nonexistent-id', {
          reason: 'Test',
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });

    it('returns not-found for cross-business conversation', async () => {
      const ownerA = await createUserInBusiness('owner-esc-xa@test.com');
      const ownerB = await createUserInBusiness('owner-esc-xb@test.com');
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
        createEscalation(ownerB.user.id, ownerB.business.id, conversationA.id, {
          reason: 'Cross-business',
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_CONVERSATION' });
    });

    it('rejects inactive membership', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-inactive@test.com',
        MembershipRole.OWNER,
        MembershipStatus.INACTIVE,
      );
      await expect(
        createEscalation(user.id, business.id, 'x', { reason: 'Test' }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('rejects unauthorized role (STAFF)', async () => {
      const { user, business } = await createUserInBusiness(
        'staff-esc-create@test.com',
        MembershipRole.STAFF,
      );
      await expect(
        createEscalation(user.id, business.id, 'x', { reason: 'Test' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects duplicate active escalation for same conversation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-dup@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      await createEscalation(user.id, business.id, conversation.id, {
        reason: 'First',
      });
      await expect(
        createEscalation(user.id, business.id, conversation.id, {
          reason: 'Second',
        }),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('concurrent duplicate creation allows only one winner', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-concurrent-create@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const results = await Promise.allSettled([
        createEscalation(user.id, business.id, conversation.id, {
          reason: 'Concurrent A',
        }),
        createEscalation(user.id, business.id, conversation.id, {
          reason: 'Concurrent B',
        }),
      ]);
      const fulfilled = results.filter(
        (r) => r.status === 'fulfilled',
      ) as PromiseFulfilledResult<
        Awaited<ReturnType<typeof createEscalation>>
      >[];
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const count = await prisma.escalation.count({
        where: { conversationId: conversation.id },
      });
      expect(count).toBe(1);
    });

    it('allows new escalation after previous is resolved', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-reopen@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const first = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'First issue' },
      );
      await assignEscalation(user.id, business.id, first.id, {
        assigneeId: user.id,
      });
      await resolveEscalation(user.id, business.id, first.id);
      const second = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Second issue' },
      );
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe(EscalationStatus.OPEN);
    });

    it('tenant isolation: messages from business A not visible to business B', async () => {
      const ownerA = await createUserInBusiness('owner-esc-isoa@test.com');
      const ownerB = await createUserInBusiness('owner-esc-isob@test.com');
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
      const escalation = await createEscalation(
        ownerA.user.id,
        ownerA.business.id,
        conversationA.id,
        { reason: 'Private A' },
      );
      await expect(
        assignEscalation(ownerB.user.id, ownerB.business.id, escalation.id, {
          assigneeId: ownerB.user.id,
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ESCALATION' });
    });

    it('rejects missing reason', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-noreason@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      await expect(
        createEscalation(user.id, business.id, conversation.id, {}),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects empty reason', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-emptyreason@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      await expect(
        createEscalation(user.id, business.id, conversation.id, {
          reason: '   ',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects unexpected fields', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-strict@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      await expect(
        createEscalation(user.id, business.id, conversation.id, {
          reason: 'Valid',
          injected: 'bad',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('writes an audit record for escalation creation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-audit@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Audit test' },
      );
      const audit = await prisma.auditLog.findFirst({
        where: {
          businessId: business.id,
          eventType: 'ESCALATION_CREATED',
          actorId: user.id,
        },
      });
      expect(audit).toBeTruthy();
      expect(audit!.payload).toMatchObject({
        escalationId: escalation.id,
        conversationId: conversation.id,
        reason: 'Audit test',
      });
    });
  });

  describe('assignEscalation', () => {
    it('assigns an OPEN escalation to an active member', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-assign@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Assign test' },
      );
      const result = await assignEscalation(
        user.id,
        business.id,
        escalation.id,
        { assigneeId: user.id },
      );
      expect(result.status).toBe(EscalationStatus.ASSIGNED);
      expect(result.assigneeId).toBe(user.id);
    });

    it('returns not-found for nonexistent escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-assignnosuch@test.com',
      );
      await expect(
        assignEscalation(user.id, business.id, 'nonexistent-id', {
          assigneeId: user.id,
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ESCALATION' });
    });

    it('returns not-found for cross-business escalation', async () => {
      const ownerA = await createUserInBusiness('owner-esc-assignta@test.com');
      const ownerB = await createUserInBusiness('owner-esc-assign tb@test.com');
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
      const escalationA = await createEscalation(
        ownerA.user.id,
        ownerA.business.id,
        conversationA.id,
        { reason: 'A only' },
      );
      await expect(
        assignEscalation(ownerB.user.id, ownerB.business.id, escalationA.id, {
          assigneeId: ownerB.user.id,
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ESCALATION' });
    });

    it('rejects assignee from another business', async () => {
      const ownerA = await createUserInBusiness('owner-esc-assignxa@test.com');
      const ownerB = await createUserInBusiness('owner-esc-assignxb@test.com');
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
      const escalation = await createEscalation(
        ownerA.user.id,
        ownerA.business.id,
        conversationA.id,
        { reason: 'Cross-business assignee' },
      );
      await expect(
        assignEscalation(ownerA.user.id, ownerA.business.id, escalation.id, {
          assigneeId: ownerB.user.id,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects inactive assignee', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-assigninactive@test.com',
      );
      const inactive = await createUserInBusiness(
        'inactive-esc-assign@test.com',
        MembershipRole.SUPPORT_AGENT,
        MembershipStatus.INACTIVE,
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Inactive assignee' },
      );
      await expect(
        assignEscalation(user.id, business.id, escalation.id, {
          assigneeId: inactive.user.id,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects assignment of already ASSIGNED escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-assignalready@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Already assigned' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      await expect(
        assignEscalation(user.id, business.id, escalation.id, {
          assigneeId: user.id,
        }),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('rejects assignment of RESOLVED escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-assignresolved@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Already resolved' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      await resolveEscalation(user.id, business.id, escalation.id);
      await expect(
        assignEscalation(user.id, business.id, escalation.id, {
          assigneeId: user.id,
        }),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('concurrent assignment allows only one winner', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-concurrent-assign@test.com',
      );
      const staffUser1 = await createUser('staff1-esc-assign@test.com');
      const staffUser2 = await createUser('staff2-esc-assign@test.com');
      await createMembership(
        staffUser1.id,
        business.id,
        MembershipRole.SUPPORT_AGENT,
      );
      await createMembership(
        staffUser2.id,
        business.id,
        MembershipRole.SUPPORT_AGENT,
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Concurrent assign' },
      );
      const results = await Promise.allSettled([
        assignEscalation(staffUser1.id, business.id, escalation.id, {
          assigneeId: staffUser1.id,
        }),
        assignEscalation(staffUser2.id, business.id, escalation.id, {
          assigneeId: staffUser2.id,
        }),
      ]);
      const fulfilled = results.filter(
        (r) => r.status === 'fulfilled',
      ) as PromiseFulfilledResult<
        Awaited<ReturnType<typeof assignEscalation>>
      >[];
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const updated = await prisma.escalation.findUniqueOrThrow({
        where: { id: escalation.id },
      });
      expect(updated.status).toBe(EscalationStatus.ASSIGNED);
      expect([staffUser1.id, staffUser2.id]).toContain(updated.assigneeId);
    });

    it('writes an audit record for assignment', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-assignaudit@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Assign audit' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      const audit = await prisma.auditLog.findFirst({
        where: {
          businessId: business.id,
          eventType: 'ESCALATION_ASSIGNED',
          actorId: user.id,
        },
      });
      expect(audit).toBeTruthy();
      expect(audit!.payload).toMatchObject({
        escalationId: escalation.id,
        assigneeId: user.id,
      });
    });

    it('rejects missing assigneeId', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-assignnoaid@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'No assignee' },
      );
      await expect(
        assignEscalation(user.id, business.id, escalation.id, {}),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('resolveEscalation', () => {
    it('resolves an ASSIGNED escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-resolve@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Resolve test' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      const result = await resolveEscalation(
        user.id,
        business.id,
        escalation.id,
      );
      expect(result.status).toBe(EscalationStatus.RESOLVED);
      expect(result.resolvedAt).toBeInstanceOf(Date);
    });

    it('returns not-found for nonexistent escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-resolvenosuch@test.com',
      );
      await expect(
        resolveEscalation(user.id, business.id, 'nonexistent-id'),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ESCALATION' });
    });

    it('returns not-found for cross-business escalation', async () => {
      const ownerA = await createUserInBusiness('owner-esc-resolveta@test.com');
      const ownerB = await createUserInBusiness('owner-esc-resolvetb@test.com');
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
      const escalationA = await createEscalation(
        ownerA.user.id,
        ownerA.business.id,
        conversationA.id,
        { reason: 'A only' },
      );
      await assignEscalation(
        ownerA.user.id,
        ownerA.business.id,
        escalationA.id,
        {
          assigneeId: ownerA.user.id,
        },
      );
      await expect(
        resolveEscalation(ownerB.user.id, ownerB.business.id, escalationA.id),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ESCALATION' });
    });

    it('rejects resolution of OPEN escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-resolveopen@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Still open' },
      );
      await expect(
        resolveEscalation(user.id, business.id, escalation.id),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('rejects resolution of already RESOLVED escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-resolvealready@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Double resolve' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      await resolveEscalation(user.id, business.id, escalation.id);
      await expect(
        resolveEscalation(user.id, business.id, escalation.id),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('resolvedAt is generated server-side', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-resolvedat@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Server timestamp' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      const before = new Date();
      const result = await resolveEscalation(
        user.id,
        business.id,
        escalation.id,
      );
      const after = new Date();
      expect(result.resolvedAt).not.toBeNull();
      expect(result.resolvedAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(result.resolvedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('writes an audit record for resolution', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-resolveaudit@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Resolve audit' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      await resolveEscalation(user.id, business.id, escalation.id);
      const audit = await prisma.auditLog.findFirst({
        where: {
          businessId: business.id,
          eventType: 'ESCALATION_RESOLVED',
          actorId: user.id,
        },
      });
      expect(audit).toBeTruthy();
      expect(audit!.payload).toMatchObject({
        escalationId: escalation.id,
      });
    });

    it('allows SUPPORT_AGENT to resolve', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-resolvesupport@test.com',
      );
      const supportUser = await createUser('support-esc-resolve@test.com');
      await createMembership(
        supportUser.id,
        business.id,
        MembershipRole.SUPPORT_AGENT,
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Support resolve' },
      );
      await assignEscalation(supportUser.id, business.id, escalation.id, {
        assigneeId: supportUser.id,
      });
      const result = await resolveEscalation(
        supportUser.id,
        business.id,
        escalation.id,
      );
      expect(result.status).toBe(EscalationStatus.RESOLVED);
    });
  });

  describe('authorization and multi-tenancy', () => {
    it('rejects inactive membership for all operations', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-authinactive@test.com',
        MembershipRole.OWNER,
        MembershipStatus.INACTIVE,
      );
      await expect(
        createEscalation(user.id, business.id, 'x', { reason: 'Test' }),
      ).rejects.toBeInstanceOf(AppError);
      await expect(
        assignEscalation(user.id, business.id, 'x', { assigneeId: 'x' }),
      ).rejects.toBeInstanceOf(AppError);
      await expect(
        resolveEscalation(user.id, business.id, 'x'),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('rejects unauthorized role (STAFF) for all operations', async () => {
      const { user, business } = await createUserInBusiness(
        'staff-esc-auth@test.com',
        MembershipRole.STAFF,
      );
      await expect(
        createEscalation(user.id, business.id, 'x', { reason: 'Test' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        assignEscalation(user.id, business.id, 'x', { assigneeId: 'x' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        resolveEscalation(user.id, business.id, 'x'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('client-supplied requestedBusinessId cannot bypass isolation', async () => {
      const { user } = await createUserInBusiness('owner-esc-bypass@test.com');
      const otherBiz = await prisma.business.create({
        data: { name: 'Other Business' },
      });
      await expect(
        createEscalation(user.id, otherBiz.id, 'x', { reason: 'Test' }),
      ).rejects.toBeInstanceOf(AppError);
      await expect(
        assignEscalation(user.id, otherBiz.id, 'x', { assigneeId: 'x' }),
      ).rejects.toBeInstanceOf(AppError);
      await expect(
        resolveEscalation(user.id, otherBiz.id, 'x'),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('cancelEscalation', () => {
    it('cancels an OPEN escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-cancel@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Cancel test' },
      );
      const result = await cancelEscalation(
        user.id,
        business.id,
        escalation.id,
        {},
      );
      expect(result.status).toBe(EscalationStatus.CANCELLED);
      expect(result.resolvedAt).toBeInstanceOf(Date);
    });

    it('returns not-found for nonexistent escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-cancelnosuch@test.com',
      );
      await expect(
        cancelEscalation(user.id, business.id, 'nonexistent-id', {}),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ESCALATION' });
    });

    it('returns not-found for cross-business escalation', async () => {
      const ownerA = await createUserInBusiness('owner-esc-cancelxa@test.com');
      const ownerB = await createUserInBusiness('owner-esc-cancelxb@test.com');
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
      const escalation = await createEscalation(
        ownerA.user.id,
        ownerA.business.id,
        conversationA.id,
        { reason: 'A only' },
      );
      await expect(
        cancelEscalation(ownerB.user.id, ownerB.business.id, escalation.id, {}),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ESCALATION' });
    });

    it('rejects cancellation of ASSIGNED escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-cancelassigned@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Already assigned' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      await expect(
        cancelEscalation(user.id, business.id, escalation.id, {}),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('rejects cancellation of RESOLVED escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-cancelresolved@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Already resolved' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      await resolveEscalation(user.id, business.id, escalation.id);
      await expect(
        cancelEscalation(user.id, business.id, escalation.id, {}),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('writes an audit record for cancellation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-cancelaudit@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Cancel audit' },
      );
      await cancelEscalation(user.id, business.id, escalation.id, {});
      const audit = await prisma.auditLog.findFirst({
        where: {
          businessId: business.id,
          eventType: 'ESCALATION_CANCELLED',
          actorId: user.id,
        },
      });
      expect(audit).toBeTruthy();
      expect(audit!.payload).toMatchObject({
        escalationId: escalation.id,
      });
    });

    it('rejects inactive membership', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-cancelinactive@test.com',
        MembershipRole.OWNER,
        MembershipStatus.INACTIVE,
      );
      await expect(
        cancelEscalation(user.id, business.id, 'x', {}),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('rejects unauthorized role (STAFF)', async () => {
      const { user, business } = await createUserInBusiness(
        'staff-esc-cancel@test.com',
        MembershipRole.STAFF,
      );
      await expect(
        cancelEscalation(user.id, business.id, 'x', {}),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('allows re-escalation after cancellation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-cancelreopen@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const first = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'First' },
      );
      await cancelEscalation(user.id, business.id, first.id, {});
      const second = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Second' },
      );
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe(EscalationStatus.OPEN);
    });
  });

  describe('reassignEscalation', () => {
    it('reassigns an ASSIGNED escalation back to OPEN', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-reassign@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Reassign test' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      const result = await reassignEscalation(
        user.id,
        business.id,
        escalation.id,
      );
      expect(result.status).toBe(EscalationStatus.OPEN);
      expect(result.assigneeId).toBeNull();
    });

    it('returns not-found for nonexistent escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-reassignnosuch@test.com',
      );
      await expect(
        reassignEscalation(user.id, business.id, 'nonexistent-id'),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ESCALATION' });
    });

    it('returns not-found for cross-business escalation', async () => {
      const ownerA = await createUserInBusiness('owner-esc-reassignxa@test.com');
      const ownerB = await createUserInBusiness('owner-esc-reassignxb@test.com');
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
      const escalation = await createEscalation(
        ownerA.user.id,
        ownerA.business.id,
        conversationA.id,
        { reason: 'A only' },
      );
      await assignEscalation(ownerA.user.id, ownerA.business.id, escalation.id, {
        assigneeId: ownerA.user.id,
      });
      await expect(
        reassignEscalation(ownerB.user.id, ownerB.business.id, escalation.id),
      ).rejects.toMatchObject({ code: 'UNKNOWN_ESCALATION' });
    });

    it('rejects reassignment of OPEN escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-reassignopen@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Still open' },
      );
      await expect(
        reassignEscalation(user.id, business.id, escalation.id),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('rejects reassignment of RESOLVED escalation', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-reassignresolved@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Already resolved' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      await resolveEscalation(user.id, business.id, escalation.id);
      await expect(
        reassignEscalation(user.id, business.id, escalation.id),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    });

    it('writes an audit record for reassignment', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-reassignaudit@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const escalation = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Reassign audit' },
      );
      await assignEscalation(user.id, business.id, escalation.id, {
        assigneeId: user.id,
      });
      await reassignEscalation(user.id, business.id, escalation.id);
      const audit = await prisma.auditLog.findFirst({
        where: {
          businessId: business.id,
          eventType: 'ESCALATION_REASSIGNED',
          actorId: user.id,
        },
      });
      expect(audit).toBeTruthy();
      expect(audit!.payload).toMatchObject({
        escalationId: escalation.id,
      });
    });

    it('rejects inactive membership', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-reassigninactive@test.com',
        MembershipRole.OWNER,
        MembershipStatus.INACTIVE,
      );
      await expect(
        reassignEscalation(user.id, business.id, 'x'),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('rejects unauthorized role (STAFF)', async () => {
      const { user, business } = await createUserInBusiness(
        'staff-esc-reassign@test.com',
        MembershipRole.STAFF,
      );
      await expect(
        reassignEscalation(user.id, business.id, 'x'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('allows re-escalation and reassignment after prior resolution', async () => {
      const { user, business } = await createUserInBusiness(
        'owner-esc-reassignreopen@test.com',
      );
      const conversation = await createConversationForTest(user, business);
      const first = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'First cycle' },
      );
      await assignEscalation(user.id, business.id, first.id, {
        assigneeId: user.id,
      });
      await resolveEscalation(user.id, business.id, first.id);
      const second = await createEscalation(
        user.id,
        business.id,
        conversation.id,
        { reason: 'Second cycle' },
      );
      await assignEscalation(user.id, business.id, second.id, {
        assigneeId: user.id,
      });
      const reassigned = await reassignEscalation(
        user.id,
        business.id,
        second.id,
      );
      expect(reassigned.status).toBe(EscalationStatus.OPEN);
      expect(reassigned.assigneeId).toBeNull();
    });
  });
});
