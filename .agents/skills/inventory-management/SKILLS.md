# Inventory Management Skill

> **VERSION** : 1.0
> **UPDATED** : 2026-08-13
> **COMPANION** : `ecommerce-domain.md` (entities, inventory rules) · `multi-tenancy.md` (tenant boundary) · `database.md` (persistence, concurrency) · `ai-behaviour.md` (AI grounding, authorization)

---

## Purpose

Define reliable inventory behaviour for catalogue-driven e-commerce. Read `.agents/rules/ecommerce-domain.md`, `.agents/rules/multi-tenancy.md`, and `.agents/rules/database.md` before working on any inventory code.

---

## Source of Truth

```
- Inventory state MUST come from the authoritative inventory system.
- MUST NEVER invent stock quantities, availability, or reservation status.
- Treat cached or remembered stock as stale; re-check the domain layer before answering or acting.
```

---

## Tenant Boundary

```
- Inventory is tenant-owned. Every inventory read and write MUST be scoped to the current business/tenant.
- MUST resolve product and variant ownership against the caller's business context before any read or change.
- A tenant MUST NOT read or modify another tenant's inventory; a cross-tenant access attempt MUST fail identically to not-found.
- Tenant scoping MUST be enforced server-side at the repository/service layer, never by UI filtering.
- See multi-tenancy.md for the full boundary rules.
```

---

## Variants

```
- Resolve the correct product variant before checking or changing inventory.
- Inventory is tracked per ProductVariant; never substitute product-level stock for variant stock.
- Use the canonical variant identity from the domain layer; never trust client-provided variant IDs as authorization.
```

---

## Availability

Before accepting an order, verify all of the following from authoritative domain state:

- Product and variant.
- Requested quantity.
- Available inventory, not just total inventory (see Reservation Model).
- Sufficient stock (`available >= quantity`).

```
- MUST NOT accept an order when verified available stock is insufficient.
- MUST distinguish available vs reserved vs out of stock explicitly.
```

---

## Reservation Model

Decide and persist the stock model explicitly. Reserve at confirmation, deduct only on order confirmation; never treat a cart or conversation as a deduction.

```
- `available` = stock sellable now; `reserved` = stock held by in-flight orders; out of stock when available = 0.
- Reservation MUST happen atomically with order creation or confirmation.
- Deduction MUST happen only on the confirmed transition (e.g., order PAID or PROCESSING per ecommerce-domain.md), never on a browser action or unverified event.
```

---

## Concurrency

Inventory operations MUST prevent two concurrent customers from purchasing the same final unit when only one is available.

```
- Decrement/reserve conditionally: UPDATE inventory SET available = available - :qty WHERE variant = :variant AND available >= :qty, and MUST check the affected-row count.
- Use a database transaction with appropriate isolation for multi-record operations (reservation + order state change together).
- If the conditional update affects zero rows, treat it as INSUFFICIENT_STOCK and reject; never decrement to negative stock.
- Use unique constraints, not lookup-only checks, to back idempotency (see Idempotency).
- Never resolve a stock conflict by last-writer-wins on an unconditional write.
```

---

## Idempotency

Repeated or retried requests MUST NOT double-reserve or double-deduct inventory.

```
- Order/reservation and release operations MUST be idempotent, keyed by a unique request/order key.
- Deduplication MUST be enforced by a database unique constraint (or equivalent transaction), so concurrent duplicate requests cannot both pass a lookup-only check.
- A retried fulfilment or cancellation event MUST NOT apply its inventory effect twice.
```

---

## Inventory Changes

```
- Every inventory change MUST record a reason/source: order commitment, reservation, release, cancellation, return/refund, manual adjustment, or import.
- Inventory adjustments MUST be auditable and traceable to the triggering business record (order, payment, refund).
- Financial and order history MUST be preserved; do not hard-delete or silently rewrite past inventory events.
- Audit records MUST NOT include secrets or unnecessary sensitive data.
```

---

## Failure Recovery

Define the compensation path explicitly. If an order process fails after inventory is reserved or changed, inventory MUST NOT stay incorrectly locked or deducted.

```
- On order failure or cancellation with no confirmed payment: release the reservation (return quantity to available) atomically with the order state change.
- On return/refund after deduction: restore stock only after the refund is confirmed server-side, per ecommerce-domain.md.
- Releases MUST be idempotent so a duplicate release event cannot restore the same stock twice.
- If a reservation cannot be reconciled (e.g., missing order), surface it for manual resolution instead of guessing.
```

---

## AI

The AI is bound by ai-behaviour.md and may only act through validated domain operations.

```
- MAY state availability only from verified inventory information.
- MUST NOT invent, infer, or estimate stock quantities.
- MUST scope all inventory lookups and actions to the current business/tenant.
- AI-triggered inventory changes MUST pass the same validation, authorization, concurrency, and idempotency rules as non-AI actions.
- MUST surface uncertainty or escalate instead of guessing when stock cannot be verified.
```

---

## Testing

Inventory code requires integration tests that verify database state. Cover at minimum:

- Zero stock.
- One remaining unit.
- Concurrent purchases of the final unit (only one succeeds).
- Variant inventory resolution.
- Duplicate/reserved requests (idempotency; no double deduction).
- Failed-order recovery (reservation released, stock restored).
- Refund/return restoration.
- Cross-tenant access attempts fail identically to not-found (see multi-tenancy.md Testing).

Tests MUST assert the resulting database rows, not just the HTTP/UI outcome.
