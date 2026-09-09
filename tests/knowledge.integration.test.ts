import { prisma } from '../src/lib/prisma';
import { getActiveKnowledge } from '../src/features/knowledge/knowledge.service';
import { createUserInBusiness, resetDatabase } from './helpers';
import { AppError } from '../src/lib/errors';

describe('Knowledge service', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns active and non-stale knowledge sources for the business', async () => {
    const { user, business } = await createUserInBusiness('knowledge-owner@test.com');

    // Create active knowledge source
    const activeKnowledge = await prisma.knowledgeSource.create({
      data: {
        businessId: business.id,
        content: 'Returns are allowed within 7 days.',
        status: 'ACTIVE',
        stale: false,
      },
    });

    // Create stale knowledge source
    await prisma.knowledgeSource.create({
      data: {
        businessId: business.id,
        content: 'Discounts expired',
        status: 'ACTIVE',
        stale: true,
      },
    });

    // Create archived knowledge source
    await prisma.knowledgeSource.create({
      data: {
        businessId: business.id,
        content: 'Old info',
        status: 'ARCHIVED',
        stale: false,
      },
    });

    const results = await getActiveKnowledge(user.id, business.id);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(activeKnowledge.id);
    expect(results[0].content).toBe('Returns are allowed within 7 days.');
  });

  it('enforces tenant isolation across businesses', async () => {
    const { user: userA, business: businessA } = await createUserInBusiness('user-a-knowledge@test.com');
    const { business: businessB } = await createUserInBusiness('user-b-knowledge@test.com');

    await prisma.knowledgeSource.create({
      data: {
        businessId: businessB.id,
        content: 'Confidential B',
        status: 'ACTIVE',
        stale: false,
      },
    });

    await expect(getActiveKnowledge(userA.id, businessB.id)).rejects.toThrow(AppError);
  });
});
