# Database Rules

> **VERSION** : 1.0
> **UPDATED** : 2026-08-13
> **COMPANION** : `architecture.md` (state transitions) · `multi-tenancy.md` (tenant boundary) · `error-handling.md` (error taxonomy) · `api.md` (idempotency) · db-migration-runner skill (schema changes)

---

## Purpose

Define safe, consistent database practices for the AI commerce platform. The database is the authoritative store for persistent business state.

---

## Core Rules

```
- Treat the database as the source of truth for persistent business state.
- Every business-owned record MUST have an explicit tenant/business ownership boundary.
- Never trust client-provided tenant IDs, prices, totals, payment status, inventory status, or permissions.
- Use migrations for schema changes. Never silently mutate schema assumptions.
- Preserve financial and order history; do not hard-delete records merely because they are cancelled or refunded.
- Use transactions for multi-record operations that must succeed or fail together.
- Prevent duplicate records and duplicate processing through unique constraints and idempotency where appropriate.
- Enforce valid relationships and referential integrity.
- Keep authoritative fields distinct from derived or cached fields.
- Never store secrets, payment credentials, or unnecessary sensitive data in plaintext.
- Do not introduce schema changes outside the current task's scope.
```

---

## Tenant Boundary

Every query to a tenant-owned table MUST be scoped to the current business.

```
- Every query MUST include the tenant boundary (e.g., a tenantId/businessId clause) server-side.
- Cross-tenant joins MUST NOT occur without explicit authorization.
- Tenant isolation MUST be enforced in every query path: API, background jobs, scheduled tasks, webhooks, AI context, search/retrieval, and caches.
- See multi-tenancy.md for the full boundary rules.
```

---

## Order and Payment Persistence

The money path has explicit persistence requirements.

```
- Persist the internal payment attempt BEFORE redirecting the customer to the provider.
- Each payment attempt MUST carry a unique transaction reference.
- The provider reference (e.g., gatewayReference) MUST be unique so duplicate webhook deliveries cannot create duplicate records or effects.
- Payment verification and the order state change MUST be applied atomically in one transaction.
- Payment and order history MUST be preserved; do not hard-delete transactions that were cancelled or refunded.
- Record provider verification results (status, amount, currency, reference) so payments remain auditable.
```

---

## State Transitions

Order and payment state changes must be guarded and validated.

```
- State MUST only change through the domain layer, never by arbitrary status writes.
- Every transition MUST pass the guards defined in architecture.md's state machine.
- Conflicting transitions MUST be rejected as a state conflict, never resolved by last-writer-wins.
- Record meaningful state transitions with timestamps so history is reconstructable.
```

---

## Concurrency

Prevent overselling and double-application of verified payments.

```
- Decrement inventory conditionally (WHERE stock >= quantity) so concurrent requests cannot oversell.
- Use transactions with appropriate isolation for multi-record operations.
- Idempotent deduplication MUST be backed by unique constraints, not lookup-only checks, so concurrent duplicate webhooks/recovery cannot both pass.
- A verified payment MUST NOT be applied twice under concurrent webhook and recovery processing.
```

---

## Money Handling

```
- Store amounts as integers (kobo), never floats.
- Never use Float columns for money; use Int or BigInt.
- Order totals MUST be derived from authoritative order data, never trusted from the client.
- Convert to Naira for display only, at the display layer.
```

---

## Schema Conventions

```
- Use migrations for all schema changes; never mutate the schema by hand.
- Store timestamps consistently (UTC); do not mix timezone-naive and timezone-aware values.
- Use unique constraints on lookup keys such as transactionReference and gatewayReference.
- Index columns used for tenant scoping and common lookups.
- Use clear, consistent naming (Prisma: camelCase fields, PascalCase models; DB: snake_case columns where applicable).
```

---

## Auditability

```
- Payment records and order state MUST remain auditable.
- Record audit data for financially significant events: payment initiation, payment verification, order state changes, webhook receipt/rejection, refunds.
- Audit records MUST NOT include secrets or unnecessary sensitive payloads.
- Use soft-delete (deletedAt or equivalent) for records that must be preserved, and filter them out of normal queries.
- Preserve refund and cancellation history; never erase historical transactions.
```

---

## Required Before Schema Changes

1. Inspect the existing schema.
2. Identify affected entities and constraints.
3. Create a migration.
4. Update affected application logic.
5. Add or update tests.
6. Verify existing flows still work.

Use the db-migration-runner skill for all schema changes.

---

## Forbidden

```
- Silent destructive migrations.
- Duplicate business records caused by retries.
- Cross-tenant joins without explicit authorization.
- Trusting frontend calculations for authoritative financial values.
- Hard-deleting financial or order history.
- Floating-point money.
```
