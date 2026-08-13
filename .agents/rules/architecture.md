# Architecture Rules

> **VERSION** : 1.1
> **UPDATED** : 2026-08-13
> **COMPANION** : `security.md` (secrets/payment safety) · `code-style.md` (style) · Flutterwave integration skill (provider behavior)

---

## Architectural Goal

Build a reliable, multi-tenant, conversation-led commerce system in which AI assists customers and merchants without bypassing core business validation.

The architecture must support this flow:

**Customer conversation → verified business knowledge → product discovery → order → Flutterwave payment → payment verification → fulfilment → follow-up**

---

## Technology Stack

AGENTS.md defines the mandated technology stack for this project. These rules do not override it.

```
- When these rules conflict with AGENTS.md, AGENTS.md wins.
- Keep domain logic framework-neutral so it survives stack changes.
- Keep provider-specific behavior behind integration boundaries.
- Do not introduce new frameworks without explicit approval.
```

---

## Domain Boundaries

Keep the following concerns logically separated even if the initial implementation is small:

- Identity and access.
- Tenant/business management.
- Product catalogue.
- Inventory.
- Customer profiles.
- Conversations and messages.
- AI/knowledge grounding.
- Orders.
- Payments.
- Delivery.
- Automations.
- Notifications.
- Analytics/events.
- Audit logging.

---

## Source of Truth

The order of authority for product behavior is defined by AGENTS.md. When this document conflicts with AGENTS.md or the other project rules, AGENTS.md wins.

This document is not a source of product requirements. Product requirements are owned by the project's authoritative requirement documents; do not treat a missing document as license to invent requirements.

Business state must live in authoritative domain records. Chat messages and AI outputs are not authoritative sources for:

- Product price.
- Inventory quantity.
- Delivery fee.
- Payment status.
- Order status.
- Refund status.
- Business policy.

AI may request an action, but the domain layer must validate the action before state changes.

---

## State Transitions

Order and payment states must use explicit, validated transitions.

The order lifecycle is:

`DRAFT → AWAITING_PAYMENT → PAID → PROCESSING → READY_FOR_DELIVERY → SHIPPED → DELIVERED`

Alternative terminal/exception states include:

- `CANCELLED`
- `FAILED`
- `REFUNDED`

Payment states:

- `PENDING` — attempt persisted, awaiting verification.
- `SUCCESSFUL` — verified against Flutterwave.
- `FAILED` — verification failed or provider declined.
- `REFUNDED` — refund confirmed server-side.

### Transition Matrix

| From                                | To                   | Trigger                                  | Guard                                                   |
| ----------------------------------- | -------------------- | ---------------------------------------- | ------------------------------------------------------- |
| `DRAFT`                             | `AWAITING_PAYMENT`   | merchant or AI confirms order            | items, prices, and customer verified                    |
| `AWAITING_PAYMENT`                  | `PAID`               | webhook + server-side verification       | verified tx matches reference, amount, currency, status |
| `AWAITING_PAYMENT`                  | `FAILED`             | verification fails or recovery times out | payment not verified                                    |
| `AWAITING_PAYMENT`                  | `CANCELLED`          | merchant or customer                     | no confirmed payment                                    |
| `PAID`                              | `PROCESSING`         | merchant                                 | payment confirmed                                       |
| `PAID`                              | `REFUNDED`           | merchant, refund verified with provider  | refund confirmed server-side                            |
| `PROCESSING`                        | `READY_FOR_DELIVERY` | merchant                                 | fulfilment ready, inventory allocated                   |
| `READY_FOR_DELIVERY`                | `SHIPPED`            | merchant or delivery provider            | tracking created                                        |
| `SHIPPED`                           | `DELIVERED`          | merchant or delivery provider            | delivery confirmed                                      |
| `CANCELLED` / `FAILED` / `REFUNDED` | —                    | none                                     | terminal; no transitions out                            |

```
- Do not permit arbitrary status mutation from the client or AI.
- Every transition MUST be triggered through the domain layer, which validates the guard.
- Conflicting transitions MUST be rejected as a state conflict, not resolved by last-writer-wins.
```

---

## Payment Architecture

Flutterwave is the payment provider.

The payment flow must support:

1. Creating a unique transaction reference.
2. Creating a Flutterwave checkout/payment link server-side.
3. Persisting the internal payment attempt before redirecting the customer.
4. Returning the hosted payment link to the customer-facing flow.
5. Handling the payment redirect without treating it as proof of payment.
6. Receiving authenticated Flutterwave webhooks.
7. Recording webhook events idempotently.
8. Re-verifying the transaction with Flutterwave.
9. Comparing verified transaction reference, status, amount, and currency to the expected payment.
10. Updating the payment and order atomically according to valid state transitions.

### Atomicity

```
- Payment verification and the order state change MUST succeed or fail together.
- Use a database transaction, or an equivalent unique-constrained idempotent operation.
- A verified payment MUST NOT be applied to an order whose state machine rejects the transition.
```

### Concurrency

```
- Webhook processing, recovery jobs, and merchant actions may run concurrently.
- The webhook event record MUST have a unique constraint on the provider event identity.
- A lookup-only duplicate check is NOT sufficient; concurrent duplicates must be impossible to both pass.
- Conflicting transitions (verified payment vs. cancellation) MUST be resolved by the state machine guard, never by ordering of writes.
```

---

## Webhook Processing

Webhook endpoints should be thin:

1. Capture the raw request when required for signature verification.
2. Verify the Flutterwave signature.
3. Reject unauthenticated requests.
4. Validate the payload shape.
5. Record the event using an idempotency key based on the provider event identity.
6. Acknowledge accepted receipt promptly.
7. Process business effects asynchronously where the project architecture supports it.

Never perform long-running work before acknowledging a valid webhook if doing so risks the provider timeout.

---

## Idempotency

Idempotency is mandatory for:

- Payment creation where duplicate requests could create duplicate charges.
- Webhook processing.
- Payment verification side effects.
- Order creation from repeated AI/tool calls.
- Notifications where duplicate sends have business impact.
- Pending-payment recovery (see below).

Idempotency keys MUST be backed by unique constraints, not lookup-only checks.

---

## Pending Payment Recovery

Webhook delivery can fail. The system must not silently leave verified payments stuck.

```
- A payment attempt still PENDING past a defined window MUST be re-queried with Flutterwave.
- Recovery runs server-side on a schedule; never client-side.
- A recovered attempt MUST pass the same verification and state-machine checks as a webhook.
- Recovery MUST be idempotent: a late webhook and a recovery run resolving the same attempt MUST NOT both apply effects.
- If recovery confirms success, apply the atomic AWAITING_PAYMENT → PAID transition.
- If recovery confirms failure or timeout, transition per the state machine and notify the merchant.
```

---

## Multi-Tenancy

Every tenant-owned entity must have a reliable business boundary.

```
- Authorization MUST be enforced server-side for every read/write operation.
- Never rely on UI filtering to enforce tenant isolation.
- Every query to a tenant-owned table MUST include the tenant boundary (e.g., `tenantId`) server-side.
- Never trust client- or AI-provided tenant/customer/order identifiers without ownership resolution.
```

---

## AI Boundary

AI should interact with domain capabilities through explicit, validated operations rather than unrestricted database access.

AI tools/actions should:

- Receive validated input.
- Enforce authorization.
- Query authoritative data.
- Validate requested state changes.
- Return structured outcomes.
- Surface uncertainty instead of guessing.

### Verified Business Knowledge

```
- AI MUST ground answers in authoritative domain records (products, inventory, prices, policies).
- Knowledge used by AI MUST be refreshed or marked stale when the source records change.
- AI MUST NOT fill missing business facts with plausible assumptions; ask for clarification or escalate.
- AI actions that change business state MUST go through the same validation and authorization as human actions.
```

---

## Fulfilment and Follow-up

```
- Fulfilment MUST NOT start before the order reaches PAID.
- Delivery progression uses the order state machine (READY_FOR_DELIVERY → SHIPPED → DELIVERED).
- Abandoned-order recovery targets orders stuck in AWAITING_PAYMENT beyond the defined window.
- Automated notifications/follow-ups MUST be idempotent.
```

---

## Error Handling

Domain errors use explicit codes, never raw provider or internal messages.

| Code                  | Meaning                                   | HTTP |
| --------------------- | ----------------------------------------- | ---- |
| `VALIDATION_ERROR`    | invalid input                             | 400  |
| `AUTHORIZATION_ERROR` | missing or insufficient permissions       | 403  |
| `NOT_FOUND`           | unknown resource or reference             | 404  |
| `CONFLICT`            | state transition not allowed              | 409  |
| `PROVIDER_ERROR`      | Flutterwave or external provider failure  | 502  |
| `PAYMENT_FAILED`      | payment not verified or provider declined | 422  |
| `INTERNAL_ERROR`      | unexpected failure                        | 500  |

```
- Errors MUST preserve context for logs without leaking secrets.
- User-facing messages MUST be safe, actionable, and never expose internals.
- Failed transitions MUST leave the order/payment in a valid state.
```

---

## External Integrations

External providers must be isolated behind integration boundaries. Provider-specific details should not leak throughout the domain model unnecessarily.

Integration failures must produce recoverable application states, not silent corruption.

---

## Observability

Important business operations should produce structured audit/event records, especially:

- Authentication changes.
- Permission changes.
- Product/inventory changes.
- Order state changes.
- Payment initiation.
- Payment verification.
- Pending-payment recovery.
- Webhook receipt.
- Webhook rejection.
- Refunds.
- Human takeover.
- AI-triggered business actions.

Do not log secrets or unnecessary sensitive payloads.
