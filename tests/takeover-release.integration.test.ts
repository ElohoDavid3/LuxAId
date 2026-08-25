import { ConversationControlState, EscalationStatus, MembershipRole } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import {
  resetDatabase,
  createUserInBusiness,
  createUser,
  createMembership,
} from './helpers';
import {
  createEscalation,
  assignEscalation,
} from '../src/features/escalations/escalation.service';
import { createConversation } from '../src/features/conversations/conversation.service';
import { updateControlState } from '../src/features/conversations/conversation.service';
import { createCustomer } from '../src/features/customers/customer.service';
import { auth } from '../src/lib/auth';

jest.mock('../src/lib/auth', () => ({
  auth: jest.fn(),
}));

const mockedAuth = auth as jest.MockedFunction<typeof auth>;

beforeEach(async () => {
  await resetDatabase();
  jest.clearAllMocks();
});

afterAll(() => prisma.$disconnect());

function mockSession(userId: string, businessId: string) {
  mockedAuth.mockResolvedValue({
    user: { id: userId, businessId },
  } as never);
}

function mockNoSession() {
  mockedAuth.mockResolvedValue(null);
}

async function setupTakeoverScenario() {
  const { user, business } = await createUserInBusiness(
    'owner-takeover@test.com',
  );
  const customer = await createCustomer(user.id, business.id, {
    name: 'Takeover Customer',
  });
  const conversation = await createConversation(user.id, business.id, {
    customerId: customer.id,
  });
  const escalation = await createEscalation(
    user.id,
    business.id,
    conversation.id,
    { reason: 'Customer needs help' },
  );
  await updateControlState(
    user.id,
    business.id,
    conversation.id,
    ConversationControlState.AI_CONTROLLED,
    ConversationControlState.PENDING_HANDOFF,
  );
  return { user, business, conversation, escalation };
}

describe('POST /api/conversations/takeover', () => {
  it('takes over a PENDING_HANDOFF conversation', async () => {
    const { user, business, conversation, escalation } =
      await setupTakeoverScenario();
    mockSession(user.id, business.id);

    const { POST } = await import(
      '../src/app/api/conversations/takeover/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/takeover',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { success: boolean };
    expect(json.success).toBe(true);

    const updatedConversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(updatedConversation.controlState).toBe(
      ConversationControlState.HUMAN_CONTROLLED,
    );

    const updatedEscalation = await prisma.escalation.findUniqueOrThrow({
      where: { id: escalation.id },
    });
    expect(updatedEscalation.status).toBe(EscalationStatus.ASSIGNED);
    expect(updatedEscalation.assigneeId).toBe(user.id);

    const audit = await prisma.auditLog.findFirst({
      where: {
        businessId: business.id,
        eventType: 'HUMAN_TAKEOVER',
        actorId: user.id,
      },
    });
    expect(audit).toBeTruthy();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockNoSession();

    const { POST } = await import(
      '../src/app/api/conversations/takeover/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/takeover',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'x' }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });

  it('rejects STAFF role with 403', async () => {
    const { user, business } = await createUserInBusiness(
      'staff-takeover@test.com',
      MembershipRole.STAFF,
    );
    mockSession(user.id, business.id);

    const { POST } = await import(
      '../src/app/api/conversations/takeover/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/takeover',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'x' }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(403);
  });

  it('returns 404 for nonexistent conversation', async () => {
    const { user, business } = await createUserInBusiness(
      'owner-takeover-missing@test.com',
    );
    mockSession(user.id, business.id);

    const { POST } = await import(
      '../src/app/api/conversations/takeover/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/takeover',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'nonexistent-id' }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(404);
  });

  it('returns 409 for non-PENDING_HANDOFF conversation', async () => {
    const { user, business } = await createUserInBusiness(
      'owner-takeover-conflict@test.com',
    );
    const customer = await createCustomer(user.id, business.id, {
      name: 'Conflict Customer',
    });
    const conversation = await createConversation(user.id, business.id, {
      customerId: customer.id,
    });
    mockSession(user.id, business.id);

    const { POST } = await import(
      '../src/app/api/conversations/takeover/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/takeover',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(409);
  });

  it('returns 409 for concurrent takeover', async () => {
    const { user: userA, business } = await createUserInBusiness(
      'owner-takeover-concurrent-a@test.com',
    );
    const userB = await createUser('user-takeover-concurrent-b@test.com');
    await createMembership(userB.id, business.id, MembershipRole.SUPPORT_AGENT);
    const customer = await createCustomer(userA.id, business.id, {
      name: 'Concurrent Customer',
    });
    const conversation = await createConversation(userA.id, business.id, {
      customerId: customer.id,
    });
    const escalation = await createEscalation(
      userA.id,
      business.id,
      conversation.id,
      { reason: 'Concurrent' },
    );
    await updateControlState(
      userA.id,
      business.id,
      conversation.id,
      ConversationControlState.AI_CONTROLLED,
      ConversationControlState.PENDING_HANDOFF,
    );

    mockedAuth.mockResolvedValue({
      user: { id: userA.id, businessId: business.id },
    } as never);

    const { POST } = await import(
      '../src/app/api/conversations/takeover/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/takeover',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(200);

    mockedAuth.mockResolvedValue({
      user: { id: userB.id, businessId: business.id },
    } as never);

    const request2 = new Request(
      'http://localhost:3000/api/conversations/takeover',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id }),
      },
    );

    const response2 = await POST(request2 as never);
    expect(response2.status).toBe(409);

    const updatedEscalation = await prisma.escalation.findUniqueOrThrow({
      where: { id: escalation.id },
    });
    expect(updatedEscalation.assigneeId).toBe(userA.id);
  });
});

describe('POST /api/conversations/release', () => {
  it('releases a HUMAN_CONTROLLED conversation back to AI', async () => {
    const { user, business, conversation, escalation } =
      await setupTakeoverScenario();
    await updateControlState(
      user.id,
      business.id,
      conversation.id,
      ConversationControlState.PENDING_HANDOFF,
      ConversationControlState.HUMAN_CONTROLLED,
    );
    await assignEscalation(user.id, business.id, escalation.id, {
      assigneeId: user.id,
    });
    mockSession(user.id, business.id);

    const { POST } = await import(
      '../src/app/api/conversations/release/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/release',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation.id,
          escalationId: escalation.id,
        }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { success: boolean };
    expect(json.success).toBe(true);

    const updatedConversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
    });
    expect(updatedConversation.controlState).toBe(
      ConversationControlState.AI_CONTROLLED,
    );

    const updatedEscalation = await prisma.escalation.findUniqueOrThrow({
      where: { id: escalation.id },
    });
    expect(updatedEscalation.status).toBe(EscalationStatus.RESOLVED);
    expect(updatedEscalation.resolvedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLog.findFirst({
      where: {
        businessId: business.id,
        eventType: 'HUMAN_RELEASE',
        actorId: user.id,
      },
    });
    expect(audit).toBeTruthy();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mockNoSession();

    const { POST } = await import(
      '../src/app/api/conversations/release/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/release',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'x', escalationId: 'y' }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });

  it('rejects STAFF role with 403', async () => {
    const { user, business } = await createUserInBusiness(
      'staff-release@test.com',
      MembershipRole.STAFF,
    );
    mockSession(user.id, business.id);

    const { POST } = await import(
      '../src/app/api/conversations/release/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/release',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'x', escalationId: 'y' }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(403);
  });

  it('returns 409 for non-HUMAN_CONTROLLED conversation', async () => {
    const { user, business, conversation, escalation } =
      await setupTakeoverScenario();
    mockSession(user.id, business.id);

    const { POST } = await import(
      '../src/app/api/conversations/release/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/release',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation.id,
          escalationId: escalation.id,
        }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(409);
  });

  it('returns 404 for wrong assignee', async () => {
    const { user: userA, business, conversation, escalation } =
      await setupTakeoverScenario();
    const userB = await createUserInBusiness('release-wrong-assignee@test.com');
    await createMembership(userB.user.id, business.id);
    await updateControlState(
      userA.id,
      business.id,
      conversation.id,
      ConversationControlState.PENDING_HANDOFF,
      ConversationControlState.HUMAN_CONTROLLED,
    );
    await assignEscalation(userA.id, business.id, escalation.id, {
      assigneeId: userA.id,
    });
    mockSession(userB.user.id, business.id);

    const { POST } = await import(
      '../src/app/api/conversations/release/route'
    );

    const request = new Request(
      'http://localhost:3000/api/conversations/release',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation.id,
          escalationId: escalation.id,
        }),
      },
    );

    const response = await POST(request as never);
    expect(response.status).toBe(404);
  });
});
