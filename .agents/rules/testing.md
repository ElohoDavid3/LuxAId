# Testing Rules

> **VERSION** : 1.0
> **UPDATED** : 2026-08-13
> **COMPANION** : `api.md` (webhooks, idempotency) · `multi-tenancy.md` (isolation tests) · `ecommerce-domain.md` (state machine) · `integrations.md` (timeout/retry tests) · `code-style.md` (test placement)

---

## Purpose

Define the minimum verification standard for the application. This file is the canonical owner of testing requirements and tooling.

---

## Completion Standard

```
- Code is not complete because it compiles.
- A feature is complete only when its required behaviour has been implemented and verified.
```

---

## Tooling

```
- Unit and integration tests: Jest.
- Critical end-to-end journeys: Playwright.
- Colocate test files next to the code they test (e.g., lib/slug.test.ts tests lib/slug.ts).
- MUST NOT write snapshot tests for UI components.
- MUST NOT test only the happy path; cover the failure paths required below.
```

---

## Completion Gate

```
MUST run the relevant test set during development.
MUST run the broader required suite (unit + integration + critical E2E) before declaring completion.
MUST NOT declare a feature complete with failing, skipped, or deleted tests.
MUST run tests in CI; a change is not merged or shipped without the required suite passing.
```

---

## Test Priorities

Prioritize:

- Authentication
- Authorization
- Multi-tenancy
- Orders
- Payments
- Inventory
- AI guardrails
- Human handoff
- Webhooks
- Integrations
- Critical error paths

---

## Unit Tests

Test deterministic business logic in isolation.

```
- Cover validators, price/slug utilities, and state-transition guards.
- Keep provider calls and database access out of unit scope.
```

---

## Integration Tests

Test interactions between the application and database, payment boundaries, webhooks and state transitions, AI tools and commerce actions, and authentication/authorization.

```
- Verify database state after operations, not just response shapes.
- Mock provider transport (network) but keep signature verification and response-mapping logic real.
- Verify state transitions against ecommerce-domain.md's machine.
```

---

## Payment and State Transition Tests

```
- Verified successful payment: order AWAITING_PAYMENT → PAID.
- Mismatched reference, amount, or currency: order state unchanged, never PAID.
- Refund confirmed: order PAID → REFUNDED.
- Pending/unverified payment: order stays AWAITING_PAYMENT.
- Conflicting transitions are rejected as state conflicts, not last-writer-wins.
```

---

## Webhook Tests

```
- Valid signature accepted; invalid signature rejected.
- Malformed payload rejected.
- Duplicate event: no second order, no double payment confirmation, no duplicate email/fulfilment.
- Provider retries handled without duplicate effects.
- Processing failures recorded for recovery.
- Reconciliation paths exercised where applicable.
```

Idempotency MUST be asserted explicitly (see api.md and integrations.md).

---

## Security Tests

Include negative tests proving:

```
- Unauthorized users cannot access protected resources.
- One tenant cannot access another tenant's data, and the failure is identical to not-found (no existence oracle).
- Customers cannot modify authoritative prices/payment states.
- Customer messages cannot override system permissions.
- Unauthenticated and unauthorized access are indistinguishable in timing and body.
```

---

## AI Tests

Test:

- Unknown information
- Missing inventory
- Invalid product requests
- Prompt injection attempts (including merchant-provided content as data)
- False payment claims
- Human escalation
- Conflicting business data
- Correct use of verified tools/data
- Tenant scoping of AI retrieval

---

## Integration and Timeout Tests

```
- Failure-path tests for every integration.
- Duplicate-event tests.
- Timeout/retry tests where relevant (see integrations.md).
- Timeout is treated as unknown outcome and re-queried, not reported as confirmed failure.
```

---

## Regression Tests

When a bug is fixed, add a regression test when practical.

---

## Test Discipline

```
- Do not delete tests simply to make a change pass.
- Do not weaken assertions merely because implementation is inconvenient.
- Fix the implementation or deliberately revise the requirement.
- Run the relevant test set during development and the broader required suite before declaring completion.
```

---

## Completion Report

Report what changed, what tests were run, what passed, and any known limitations or unverified external dependencies.
