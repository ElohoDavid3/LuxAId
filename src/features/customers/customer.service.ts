import { prisma } from '../../lib/prisma';
import { requireScope } from '../auth/authorization';
import { AppError } from '../../lib/errors';
import { Prisma } from '@prisma/client';
import {
  createCustomerSchema,
  listCustomersSchema,
  parseOrThrow,
  updateCustomerSchema,
} from './validation';

const CUSTOMERS_SCOPE = 'conversations' as const;

async function resolveMembership(userId: string, requestedBusinessId: string) {
  return requireScope(userId, requestedBusinessId, CUSTOMERS_SCOPE);
}

const customerInclude = {
  channelIdentities: true,
  _count: {
    select: { orders: true, conversations: true },
  },
} satisfies Prisma.CustomerInclude;

export type CustomerWithRelations = Prisma.CustomerGetPayload<{
  include: typeof customerInclude;
}>;

export async function createCustomer(
  userId: string,
  requestedBusinessId: string,
  input: unknown,
): Promise<CustomerWithRelations> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(createCustomerSchema, input);
  return prisma.customer.create({
    data: {
      businessId: membership.businessId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      location: data.location ?? null,
    },
    include: customerInclude,
  });
}

export async function getCustomer(
  userId: string,
  requestedBusinessId: string,
  customerId: string,
): Promise<CustomerWithRelations> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId: membership.businessId },
    include: customerInclude,
  });
  if (!customer) {
    throw new AppError('UNKNOWN_CUSTOMER', 'Customer not found.');
  }
  return customer;
}

export async function updateCustomer(
  userId: string,
  requestedBusinessId: string,
  customerId: string,
  input: unknown,
): Promise<CustomerWithRelations> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  const data = parseOrThrow(updateCustomerSchema, input);
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, businessId: membership.businessId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError('UNKNOWN_CUSTOMER', 'Customer not found.');
  }
  return prisma.customer.update({
    where: { id: existing.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
    },
    include: customerInclude,
  });
}

export async function listCustomers(
  userId: string,
  requestedBusinessId: string,
  input: unknown = {},
): Promise<{ items: CustomerWithRelations[]; total: number }> {
  const membership = await resolveMembership(userId, requestedBusinessId);
  parseOrThrow(listCustomersSchema, input);
  const where = { businessId: membership.businessId };
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: customerInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customer.count({ where }),
  ]);
  return { items, total };
}
