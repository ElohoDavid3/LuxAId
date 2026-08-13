# Multi-Tenancy Rules

> **VERSION** : 1.0
> **UPDATED** : 2026-08-13
> **COMPANION** : `database.md` (query scoping) · `ecommerce-domain.md` (entities, memberships) · `api.md` (tenant context) · `ai-behaviour.md` (tenant scoping for AI) · `integrations.md` (webhook business mapping)

---

## Purpose

Ensure strict isolation between businesses.

---

## Tenant Boundary

Business is the primary tenant boundary.

```
- Every business-owned record MUST be associated with a Business.
- Every access MUST happen only within an authorized business context.
- A business is the tenant boundary; do not substitute user, team, or channel scopes for it.
```

---

## Non-Negotiable Rule

```
Business A MUST NEVER be able to read, modify, infer, cache, search, export, or receive events belonging to Business B.
```

---

## Enforcement

Tenant isolation must be enforced server-side/domain-side, never merely by hiding UI elements.

Apply tenant checks to:

- API requests
- Database queries
- Mutations
- Background jobs
- Scheduled tasks
- Webhooks
- AI context
- Search/retrieval
- Caches
- File/object storage
- Notifications
- Analytics
- Exports
- Integrations

---

## Query Scoping

Every tenant-owned database query MUST carry the tenant boundary.

```
- Every Prisma query to a tenant-owned table MUST include a businessId/tenantId where clause (or equivalent).
- Enforce scoping at the repository/service layer, not in UI filtering.
- Tenant scoping MUST NOT be applied post-hoc by filtering a broader result set; scope the query itself.
- See database.md for the full persistence rules.
```

---

## Ownership Resolution

Every referenced resource ID must be resolved server-side against the caller's tenant.

```
- Never trust client-provided product, order, customer, conversation, or payment IDs as authorization.
- Resolve ownership of every referenced ID against the caller's business context before reading or writing.
- Combine the ownership check into the same query so a missing record and an unauthorized record are indistinguishable.
- For an unauthorized or missing resource, return not-found/forbidden in an identical manner; do not reveal existence.
- Apply the same resolution in background jobs, webhooks, and AI retrieval, not just API handlers.
```

---

## Tenant-Via-Relation

Ownership may be expressed through relationships, and the check must follow the full chain.

```
- Orders fetched via order.customer.business MUST still be constrained to the caller's tenant.
- Never rely on a single relation hop to establish tenant scope when ownership crosses entities.
- Composite ownership chains MUST be tenant-constrained at every hop.
```

---

## Global vs Tenant-Owned Data

Not every table is tenant-owned.

```
- Tenant-owned: products, variants, inventory, customers, conversations, orders, payments, deliveries, knowledge sources, automations, notifications, audit logs, analytics events.
- Platform-owned: users (identity), platform configuration, global reference data.
- Tenant scope MUST NOT be applied to platform-owned tables.
- Business-scoped queries MUST NOT return or modify platform-owned records.
- See ecommerce-domain.md for the canonical entity ownership table.
```

---

## Idempotency Keys and References

Globally unique keys must be tenant-resolved when used.

```
- Unique keys such as transactionReference MUST be resolved to the owning business before use.
- A duplicate-reference lookup MUST NOT match a row belonging to another business.
- Webhook idempotency keys MUST be recorded and checked within the resolved business context.
- Deduplication MUST be backed by unique constraints, not lookup-only checks.
```

---

## Membership and Roles

Authorization builds on the caller's business membership.

```
- Resource access MUST be checked against the caller's BusinessMembership and permissions (see ecommerce-domain.md).
- Least privilege MUST be applied to business administration, products/inventory, orders, payments, conversations, staff, and analytics.
- A user with access to Business A MUST NOT gain rights in Business B through shared platform identity.
```

---

## AI Context

```
- Establish business context before providing business information to the AI.
- Never allow retrieval to search across businesses.
- Scope AI lookups and actions to the current business (see ai-behaviour.md).
- Never accept tenant identifiers from untrusted conversation input without ownership resolution.
```

---

## Integrations

```
- Map webhook and integration events to the correct business before processing.
- Never accept a client-provided business ID as sufficient authorization.
- Resolve the owning business from verified provider/event data, then apply the same tenant rules.
```

---

## Caching

```
- Cache keys MUST include tenant/business scope wherever tenant-owned data is cached.
- A cached value MUST never be served to a different business.
- Cross-tenant cache poisoning MUST be treated as a tenant isolation failure.
```

---

## Logging

```
- Logs should contain enough tenant context (business ID) for debugging.
- Never log unnecessary personal or secret data.
- Audit records MUST be scoped to the owning business.
```

---

## Testing

```
- Every major business-owned resource MUST have tenant-isolation tests for read, create, update, delete where applicable, search, background processing, and AI retrieval.
- Include cross-tenant access attempts and verify they fail identically to not-found.
```
