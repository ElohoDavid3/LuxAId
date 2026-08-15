# E-Commerce Domain Rules

> **VERSION** : 1.2
> **UPDATED** : 2026-08-13
> **COMPANION** : `architecture.md` (state machine, inventory lifecycle) · `database.md` (persistence, kobo) · `multi-tenancy.md` (tenant boundary) · `ai-behaviour.md` (AI grounding) · `error-handling.md` (domain errors)

---

## Purpose

Define the canonical commerce vocabulary and business state rules. This file is the reference for entity boundaries and state definitions; sibling rule files build on it.

---

## Core Entities

Every business-owned entity below MUST belong to a Business and be accessed only within an authorized business context (see `multi-tenancy.md`).

| Entity                    | Owner                  | Key fields                                        | Primary relations                             |
| ------------------------- | ---------------------- | ------------------------------------------------- | --------------------------------------------- |
| `Business`                | — (root tenant)        | name, settings                                    | User (members), products, customers, orders   |
| `User`                    | Business               | name, email, passwordHash                         | BusinessMembership                            |
| `BusinessMembership`      | Business               | role/permissions, status                          | User, Business                                |
| `BusinessSettings`        | Business               | policies, delivery defaults, notification config  | Business                                      |
| `Product`                 | Business               | name, description, price (kobo), status           | Business, ProductVariant, OrderItem           |
| `ProductVariant`          | Product                | name, sku, attributes                             | Product, Inventory                            |
| `Inventory`               | Product/ProductVariant | available, reserved, location (authoritative)     | ProductVariant                                |
| `Customer`                | Business               | name, email?, phone?                              | CustomerChannelIdentity, Conversation, Order  |
| `CustomerChannelIdentity` | Business               | channel, channel ID                               | Customer                                      |
| `Conversation`            | Business               | control state, escalation state                   | Customer, Message, Escalation                 |
| `Message`                 | Conversation           | author, body, timestamp                           | Conversation                                  |
| `KnowledgeSource`         | Business               | content, status, staleness                        | Business                                      |
| `Escalation`              | Business               | reason, status, assignee                          | Conversation, User                            |
| `Order`                   | Business               | status, total (kobo)                              | Customer, OrderItem, PaymentAttempt, Delivery |
| `OrderItem`               | Order                  | product/variant, quantity, unit price (kobo)      | Order, Product, ProductVariant                |
| `PaymentAttempt`          | Business               | reference, amount, currency, status               | Order (1:N)                                   |
| `Delivery`                | Business               | status, fee (kobo), carrier/tracking              | Order, DeliveryZone                           |
| `DeliveryZone`            | Business               | name, fee (kobo), coverage (location/area labels) | Business, Delivery                            |
| `Automation`              | Business               | trigger, action, enabled                          | Business, AutomationExecution                 |
| `AutomationExecution`     | Automation             | status, result, timestamp                         | Automation                                    |
| `Notification`            | Business               | channel, status, sentAt                           | Business, Order, Customer                     |
| `AuditLog`                | Business               | event type, actor, timestamp, payload             | Business                                      |
| `AnalyticsEvent`          | Business               | event type, properties, timestamp                 | Business                                      |

```
- Price, totals, and delivery fees MUST be stored as integers (kobo), never floats (see database.md).
- Every entity listed above is canonical; do not introduce alternative names without updating this definition.
- `Business` is the canonical domain entity; "tenant" refers to the architectural multi-tenancy isolation concept, and the tenant-boundary field on business-owned records is `businessId`.
- `InventoryMovement` is an approved, rule-supported domain extension to this list (see Inventory Rules).
```

---

## Product Status

Canonical `Product.status` values: `DRAFT`, `ACTIVE`, `ARCHIVED`.

`OUT_OF_STOCK` MUST NOT be a `Product.status`. Availability is determined by the authoritative `Inventory` entity; a product may be `ACTIVE` while its inventory is zero/out of stock.

---

## Order States

Canonical order states:

```
DRAFT → AWAITING_PAYMENT → PAID → PROCESSING → READY_FOR_DELIVERY → SHIPPED → DELIVERED
```

Exception states: `RETURNED` (reachable only from `DELIVERED`). Terminal states: `CANCELLED`, `FAILED`, `REFUNDED`.

Do not introduce alternative state names without updating this domain definition.

### Transition Matrix

| From                                | To                   | Trigger                                  | Guard                                                   |
| ----------------------------------- | -------------------- | ---------------------------------------- | ------------------------------------------------------- |
| `DRAFT`                             | `AWAITING_PAYMENT`   | merchant or AI confirms order            | items, prices, customer verified; inventory reserved    |
| `AWAITING_PAYMENT`                  | `PAID`               | webhook + server-side verification       | verified tx matches reference, amount, currency, status |
| `AWAITING_PAYMENT`                  | `FAILED`             | verification fails or recovery times out | payment not verified                                    |
| `AWAITING_PAYMENT`                  | `CANCELLED`          | merchant or customer                     | no confirmed payment                                    |
| `PAID`                              | `PROCESSING`         | merchant                                 | payment confirmed                                       |
| `PAID`                              | `REFUNDED`           | merchant, refund verified with provider  | refund confirmed server-side                            |
| `PROCESSING`                        | `READY_FOR_DELIVERY` | merchant                                 | fulfilment ready, inventory allocated                   |
| `READY_FOR_DELIVERY`                | `SHIPPED`            | merchant or delivery provider            | tracking created                                        |
| `SHIPPED`                           | `DELIVERED`          | merchant or delivery provider            | delivery confirmed                                      |
| `DELIVERED`                         | `RETURNED`           | merchant, return recorded                | delivery confirmed; return validated                    |
| `RETURNED`                          | `REFUNDED`           | merchant, refund verified with provider  | refund confirmed server-side                            |
| `CANCELLED` / `FAILED` / `REFUNDED` | —                    | none                                     | terminal; no transitions out                            |

```
- State changes MUST go through the domain layer and pass these guards.
- Conflicting transitions MUST be rejected as a state conflict, never resolved by last-writer-wins.
```

---

## Payment Rules

Payment is modeled as a **payment attempt**. An Order has a 1:N relationship with `PaymentAttempt`; `PaymentAttempt.orderId` MUST NOT be unique. Each attempt MUST carry its own unique internal transaction reference and provider gateway reference where applicable.

A payment attempt's state is authoritative only after verification from the payment provider or an approved reconciliation process.

### Payment Terminology

The PRD uses the term `Payment`; the canonical domain entity is `PaymentAttempt`.

```
- An Order has a 1:N relationship with `PaymentAttempt`.
- `PaymentAttempt.orderId` is NOT unique.
- Multiple payment attempts are supported because a customer may retry a failed or declined payment.
- A single `Payment` entity per order would imply 1:1 and contradict retry support; the PRD term `Payment` maps to the canonical domain entity `PaymentAttempt`.
```

### PaymentAttempt States

| State        | Meaning                                  |
| ------------ | ---------------------------------------- |
| `PENDING`    | attempt persisted, awaiting verification |
| `SUCCESSFUL` | verified against provider                |
| `FAILED`     | verification failed or provider declined |
| `REFUNDED`   | refund confirmed server-side             |

### PaymentAttempt → Order Mapping

| Attempt state | Order effect                                                                                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PENDING`     | order stays `AWAITING_PAYMENT`                                                                                                                                                            |
| `SUCCESSFUL`  | `AWAITING_PAYMENT` → `PAID` (only a successfully verified attempt may do this)                                                                                                            |
| `FAILED`      | order stays `AWAITING_PAYMENT`; the customer may retry. The order transitions `AWAITING_PAYMENT` → `FAILED` only via the guarded transition when verification fails or recovery times out |
| `REFUNDED`    | `PAID` → `REFUNDED`                                                                                                                                                                       |

```
- A customer statement such as "I paid" is not proof of payment.
- Payment success MUST NEVER be inferred from a redirect, client-side state, or an unverified webhook payload alone.
- A failed payment attempt does not make the order permanently failed; the customer may retry payment on the same order.
- Only a successfully verified payment attempt may transition the order to PAID.
```

---

## Inventory Rules

Inventory availability must come from the inventory system.

```
- Availability MUST be read from authoritative inventory state, never guessed.
- Inventory operations MUST account for concurrency and prevent overselling where required.
- Distinguish available vs reserved vs out of stock explicitly.
- Decrement inventory conditionally (WHERE stock >= quantity) to prevent overselling.
- The `Inventory` entity is the single authoritative inventory source; no inventory quantity is stored on `Product` or `ProductVariant`. `OUT_OF_STOCK` is an inventory-derived condition (available = 0), never a `Product.status`.
- The `Inventory` entity stores exactly two quantity fields: `available` and `reserved`. `allocated` is a fulfilment lifecycle condition, not a third Inventory quantity; do NOT add an `allocated` field to `Inventory`.
```

### Inventory Movement History

Every inventory change MUST produce a durable `InventoryMovement` record (quantity delta, reason/source, reference to the triggering business record, timestamp), written atomically with the change and never rewritten or hard-deleted. `InventoryMovement` is an approved, rule-supported domain extension to the canonical entity list.

Inventory operations are idempotent, enforced by the unique constraint `@@unique([inventoryId, reason, sourceId])` (not lookup-only checks), so a retried operation cannot apply its effect twice. The idempotency key is composed as follows:

- Order-scoped operations (`reservation`, `commitment`, `release`, `return/refund`) use `sourceId = orderId`, keyed per variant; one order can perform each operation on a given variant exactly once.
- `import` (initial stock set) uses `sourceId = variantId`: it is a single canonical set per variant; later stock changes go through `manual_adjustment`.
- `manual_adjustment` uses an optional client `idempotencyKey` as `sourceId`, or a generated UUID when none is supplied.

Allowed movement `reason` values: `reservation`, `commitment`, `release`, `return/refund`, `manual_adjustment`, `import`. Allowed `sourceType` values: `ORDER`, `VARIANT`, `MANUAL_ADJUSTMENT`. New reasons or source types require a rule change.

### Inventory Lifecycle

```
- Reserve atomically at order confirmation (DRAFT → AWAITING_PAYMENT), conditionally (available >= quantity), and idempotently.
- Commit the reserved quantity when the order reaches READY_FOR_DELIVERY (the transition guard requires inventory allocated).
- Release reservations back to available on AWAITING_PAYMENT → CANCELLED / FAILED, atomically and idempotently.
- Restore stock on PAID → REFUNDED only after the refund is confirmed server-side, per the merchant's policy; when none is configured, return the quantity to available by default.
- Every inventory change MUST record a reason/source and stay auditable.
- See architecture.md for the canonical lifecycle; the inventory-management skill for implementation.
```

---

## Conversation Rules

A conversation belongs to one business and one customer identity within that business.

### Conversation Control States

```
AI_CONTROLLED     → automated AI responses are active
PENDING_HANDOFF   → escalation requested/triggered; AI must not act further
HUMAN_CONTROLLED  → a human is in control; AI responses are stopped
```

```
- When control moves to HUMAN_CONTROLLED, automated AI responses MUST stop until control is explicitly returned.
- Conversation control and escalation state MUST be explicit and visible.
- Escalations MUST record a reason and target assignee.
```

---

## Customer Rules

Customer identities from different channels may be linked only when the system has sufficient evidence and the operation is authorized.

```
- Never merge customers merely because names appear similar.
- Customer ownership is scoped to one business; a customer belongs to exactly one business.
```

---

## Delivery Rules

Delivery status and delivery charges must come from verified merchant configuration or an approved delivery integration.

```
- Delivery fees MUST be derived from authoritative DeliveryZone configuration, never invented.
- Delivery state progression uses the order state machine (READY_FOR_DELIVERY → SHIPPED → DELIVERED).
```

### DeliveryZone Coverage

For the MVP, `DeliveryZone.coverage` is a merchant-defined list of location/area labels (e.g., "Yaba", "Surulere", "Ikeja"). A customer-provided location is resolved to a DeliveryZone by matching it against the configured coverage. No GIS, radius, or coordinate resolution is required for the MVP unless explicitly required later.

---

## KnowledgeSource Rules

```
- Knowledge content MUST be traceable to authoritative business records (products, inventory, prices, policies).
- KnowledgeSource MUST carry a staleness/refresh status and be marked stale when source records change.
- AI MUST NOT treat KnowledgeSource content as a substitute for verified business data (see ai-behaviour.md).
```

---

## Domain Integrity

```
- Do not bypass domain rules from the UI.
- Server-side/domain validation remains authoritative.
- State transitions must be explicit and validated.
- Financial history must remain auditable.
- Do not hard-delete financial or order history (see database.md).
```
