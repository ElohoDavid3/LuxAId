# Integration Rules

> **VERSION** : 1.0
> **UPDATED** : 2026-08-13
> **COMPANION** : `api.md` (idempotency, webhooks, status codes) · `security.md` (secrets) · `error-handling.md` (INTEGRATION_FAILURE) · `architecture.md` (payment flow) · Flutterwave integration skill (provider behavior)

---

## Purpose

Define safe boundaries for third-party services. External providers are dependencies; keep provider-specific logic behind clear integration boundaries.

---

## Integration Principle

```
- Keep provider-specific logic behind clear integration boundaries.
- The commerce domain MUST depend on application capabilities, never raw provider APIs.
- Provider-specific details MUST NOT leak throughout the domain model.
- See the Flutterwave integration skill for provider-specific behavior.
```

---

## Required Behaviour

Every integration MUST define:

```
- Authentication
- Configuration
- Request validation
- Response mapping
- Error mapping
- Retry strategy
- Timeout behaviour
- Idempotency
- Webhook handling where applicable
- Logging/observability
- Failure recovery
```

---

## Payment Verification

Payment success must never be inferred from a redirect, client-side state, or an unverified webhook payload.

```
- Before granting value, the integration MUST re-query the provider and compare:
  - reference identity
  - amount
  - currency
  - successful final status
- On any mismatch, leave the state unchanged and log the mismatch; never mark the order paid.
- An unknown reference MUST NOT create a payment or order.
- The payment and order state change MUST be applied atomically according to the valid state transitions.
- Keep a recovery path for pending transactions if webhook delivery fails.
```

---

## Webhooks

For every webhook:

```
1. Preserve the raw request body before parsing.
2. Verify provider authenticity (signature) before any processing.
3. Reject unauthenticated requests.
4. Validate the payload shape.
5. Determine the correct business context from trusted data, never from untrusted fields alone.
6. Check idempotency using the provider event identity, backed by a unique constraint.
7. Process the event.
8. Persist resulting state.
9. Acknowledge accepted receipt promptly (HTTP 200).
10. Record failures for recovery.
```

```
- Never perform long-running work before acknowledging a valid webhook if it risks the provider timeout.
- Process business effects asynchronously where the architecture supports it.
- A duplicate webhook MUST NOT create another order, confirm payment twice, or duplicate value delivery.
- Pending transactions MUST have a recovery path if webhook delivery fails.
```

---

## Retries

Retries must be deliberate, bounded, and idempotent-safe.

```
- Retry with exponential backoff and jitter, within defined limits.
- Only retry operations that are idempotent or made idempotent by a unique-constraint-backed key.
- Do not retry non-idempotent operations blindly.
- Duplicate suppression MUST be backed by unique constraints, not lookup-only checks.
- Record repeated failure and escalate if recovery is unsuccessful.
```

---

## Timeouts

A timeout is an unknown outcome, not a confirmed failure.

```
- Set explicit timeouts for every external call.
- On timeout, MUST re-query the provider for authoritative state before deciding the outcome for payments and other value-bearing operations.
- A timeout MUST NOT be reported as a confirmed failure for an operation whose outcome is unknown.
- Persist enough state to retry or reconcile safely.
```

---

## External Failure

```
- An external outage MUST NOT cause fabricated success.
- Persist enough state to retry or reconcile safely.
- Map provider failures to INTEGRATION_FAILURE (see error-handling.md).
- Never surface provider internals to customers.
```

---

## Secrets and Configuration

```
- Provider secrets MUST never be committed to source control or exposed to the client.
- Read all provider configuration through the validated env schema (lib/env.ts); never read process.env directly in feature code.
- Follow security.md for secret handling, rotation, and incident response.
- Never log full payment credentials, authorization headers, or unredacted provider payloads.
```

---

## Observability

```
- Log with the structured logger; include safe provider references (transaction/reference IDs) and the request/event ID.
- Never log raw HTTP request objects or unredacted provider payloads.
- Record webhook receipt and rejection as auditable events (see architecture.md).
```

---

## Current Providers

Flutterwave is the payment provider for this project.

```
- Do not introduce Paystack payment logic.
- Other integrations MUST be added only when required by the product or explicitly approved.
- When product requirements are ambiguous, defer to AGENTS.md's order of authority rather than guessing.
```

---

## Testing

Integration code must have:

```
- Unit tests for mapping/validation logic.
- Integration tests where feasible.
- Failure-path tests.
- Duplicate-event tests.
- Timeout/retry tests where relevant.
```
