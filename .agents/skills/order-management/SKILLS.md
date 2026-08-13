# Order Management Skill

Implement order creation and state management for LuxAId. Read `.agents/rules/architecture.md` (transition matrix, state machine), `.agents/rules/database.md` (persistence, concurrency, money handling), `.agents/rules/api.md` (idempotency) and `.agents/rules/error-handling.md` (error taxonomy), `.agents/rules/multi-tenancy.md` (tenant boundary), and the sibling skills `inventory-management` and `ai-commerce-agent` before building order code.

## Canonical States

```
DRAFT
AWAITING_PAYMENT
PAID
PROCESSING
READY_FOR_DELIVERY
SHIPPED
DELIVERED
CANCELLED
FAILED
REFUNDED
```

Do not invent alternative names for these states. `CANCELLED`, `FAILED`, and `REFUNDED` are terminal: no transitions out.

## Transition Matrix

Every order state change must be an explicit, guarded transition triggered through the domain layer. Never write arbitrary status values.

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
| `CANCELLED` / `FAILED` / `REFUNDED` | —                    | none                                     | terminal; no transitions out                            |

Rules:

- Conflicting transitions (e.g., verified payment vs cancellation) are rejected as a state conflict, never resolved by last-writer-wins.
- Order state changes happen only through the domain layer; neither clients nor AI may mutate status directly.
- Apply valid transitions atomically where appropriate, and preserve audit history.

## Creation

Before creating an order, verify business, customer, products/variants, quantities, inventory, authoritative prices, applicable charges, and final total. Confirm the final total with the customer when it can vary by delivery zone or has not been explicitly agreed.

## Pricing

Never trust frontend totals, customer-supplied prices, AI-generated totals, or stale cached prices. Authoritative values must be calculated/retrieved server-side.

- Store amounts as integers (`Int`/`BigInt`) in kobo, never `Float`.
- Order totals are derived from authoritative order data, never trusted from the client.
- Convert to Naira for display only, at the display layer.

## Inventory

Coordinate order confirmation with inventory rules and prevent concurrent requests from overselling stock.

- Reserve inventory conditionally (`WHERE stock >= quantity`) so concurrent requests cannot oversell.
- Use transactions with appropriate isolation for multi-record operations (order confirmation + inventory reservation must succeed or fail together).
- Commit the reserved quantity when the order reaches `READY_FOR_DELIVERY`; do not deduct at order creation.
- Release reservations back to available on `AWAITING_PAYMENT → CANCELLED` / `FAILED`, atomically and idempotently.
- Restore stock on `PAID → REFUNDED` only after the refund is confirmed server-side, per the merchant's policy; when none is configured, return the quantity to available by default.

## Payments

An order awaiting payment is not paid. Transition to `PAID` only after the approved payment-verification workflow succeeds.

- Payment verification and the `AWAITING_PAYMENT → PAID` transition must be applied atomically in one transaction (or an equivalent unique-constrained idempotent operation).
- A verified payment must not be applied to an order whose state machine rejects the transition.
- The internal payment attempt is persisted before the customer is redirected to the provider.
- Never treat a redirect, client-side state, or unverified webhook payload as proof of payment.

## Cancellation and Refunds

Cancellation and refund workflows must preserve historical order/payment information. Never claim a refund succeeded without authoritative confirmation.

- Never hard-delete cancelled or refunded orders or payments.
- `AWAITING_PAYMENT → CANCELLED` requires no confirmed payment; `PAID → REFUNDED` requires refund confirmed server-side with the provider.
- Refunds and other irreversible or high-impact actions require human approval per the `ai-commerce-agent` skill.

## Idempotency

Protect order creation and other side-effecting operations from duplicate requests and retries.

- Use a server-issued idempotency key backed by a unique constraint; a lookup-only check is not sufficient.
- Repeated AI/tool calls must not create duplicate orders.
- Pending-payment recovery and late webhooks resolving the same attempt must not both apply effects.

## Tenant Boundary

- Every order query must include the tenant boundary (`where: { tenantId }`) server-side.
- Resolve order ownership from the session, never from client-provided order/customer IDs.
- A merchant must never read or modify another merchant's orders.

## Error Handling

Map order failures to the error taxonomy in `error-handling.md`:

- `INVALID_ORDER` — order fails a domain guard.
- `INSUFFICIENT_STOCK` — requested quantity exceeds available inventory.
- `DELIVERY_UNAVAILABLE` — no delivery option applies to the order.
- `PAYMENT_MISMATCH` — verified transaction does not match reference, amount, currency, or status.
- `PAYMENT_UNVERIFIED` — no verification result obtainable for the reference.

Failed transitions must leave the order in a valid state and never expose internal details.

## Abandoned-Order Recovery

Orders stuck in `AWAITING_PAYMENT` beyond a defined window must not be silently dropped:

- Re-query the payment provider server-side on a schedule (never client-side).
- A recovered attempt passes the same verification and state-machine checks as a webhook.
- Recovery is idempotent: a late webhook and a recovery run resolving the same attempt must not both apply effects.
- If recovery confirms success, apply the atomic `AWAITING_PAYMENT → PAID` transition; if it confirms failure or times out, transition per the state machine and notify the merchant.

## Testing

Cover with integration tests (Jest) and E2E where applicable:

- Order creation happy path.
- Invalid input (missing customer, invalid product, bad quantities).
- Authoritative pricing: frontend/AI totals are ignored.
- Inventory concurrency: two concurrent purchases cannot oversell.
- Invalid state transitions rejected (e.g., `PAID` without verification, `CANCELLED → PAID`).
- Conflicting transitions resolved as state conflicts, not last-writer-wins.
- Cross-tenant access denial.
- Duplicate order creation (idempotency key) creates one order.
- Payment verification + `PAID` transition atomicity.
- Cancellation and refund preserve history.
- Refund requires human approval and authoritative provider confirmation.
- Abandoned-order recovery: late webhook + recovery do not double-apply.
- Audit records written for order state changes.
