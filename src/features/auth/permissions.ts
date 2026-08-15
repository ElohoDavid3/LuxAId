import type { MembershipRole } from '@prisma/client';

export const SCOPE_AREAS = [
  'business_admin',
  'products_inventory',
  'orders',
  'payments',
  'conversations',
  'staff_management',
  'analytics',
] as const;

export type Scope = (typeof SCOPE_AREAS)[number];

const ROLE_SCOPES: Record<MembershipRole, readonly Scope[]> = {
  OWNER: [...SCOPE_AREAS],
  STAFF: ['orders', 'payments'],
  SUPPORT_AGENT: ['conversations'],
};

export function scopesForRole(role: MembershipRole): readonly Scope[] {
  return ROLE_SCOPES[role];
}

export function roleHasScope(role: MembershipRole, scope: Scope): boolean {
  return ROLE_SCOPES[role].includes(scope);
}
