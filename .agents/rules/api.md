# API Rules

> **VERSION** : 1.1
> **UPDATED** : 2026-08-13
> **COMPANION** : `error-handling.md` (error taxonomy) · `code-style.md` (response contracts) · `security.md` (secrets/payment safety) · Flutterwave integration skill (provider behavior)

---

## Purpose

Define consistent and secure API behaviour. Every route handler, server action, and webhook endpoint follows these rules.

---

## General Rules

```
- Validate all external input.
- Never trust client-provided authorization, tenant IDs, prices, totals, payment status, inventory status, or role information.
- Enforce authorization server-side.
- Keep business rules out of client-only code.
- Return predictable error structures.
- Do not expose internal stack traces or secrets.
- Use explicit contracts for requests and responses.
- Avoid breaking existing contracts without a deliberate migration/versioning strategy.
```

---

## Authentication and Authorization

Authentication proves identity. Authorization determines what that identity may do.

```
- Every protected endpoint MUST enforce both where required.
- Authorization MUST be checked server-side against the authenticated principal.
- Authorization MUST NOT be inferred from client-provided identifiers or role fields.
```

---

## Tenant Context

```
- Determine tenant/business context from trusted authentication and authorization context.
- MUST NOT rely solely on request body or query parameters for the active tenant.
- MUST resolve ownership of every referenced resource server-side.
- A request outside the caller's tenant MUST be treated as not-found or forbidden, never as a silent cross-tenant read.
```

---

## Validation

```
MUST validate at the boundary: types, required fields, lengths, formats, allowed enum values, numeric ranges, relationships, and business rules.
```

- Use strict schemas (zod `.strict()` by default) so unknown fields are rejected.
- Never treat a TypeScript type as proof of runtime validity.
- Reject malformed JSON, missing content types, and empty bodies explicitly.

---

## Idempotency

Idempotency is mandatory for operations where retries could create duplicate financial, order, inventory, or messaging effects.

```
- Payment creation MUST be idempotent against duplicate requests.
- Order creation from repeated AI/tool calls MUST be idempotent.
- Webhook processing and verification side effects MUST be idempotent.
- Idempotency keys MUST be server-issued where the client cannot be trusted.
- Deduplication MUST be backed by unique constraints, not lookup-only checks, so concurrent duplicates cannot both pass.
```

---

## Payment Verification

Payment success must never be inferred from a redirect, client-side state, or an unverified webhook payload.

```
- Before marking an order paid, the server MUST re-query Flutterwave.
- The verified transaction MUST match the expected payment attempt on:
  - reference identity
  - amount
  - currency
  - successful final status
- On any mismatch, MUST NOT mark the order paid; leave the attempt in a valid state and log the mismatch.
- An unknown reference MUST NOT create a payment or order.
- The payment and order state change MUST be applied atomically according to the valid state transitions.
```

---

## Webhooks

Webhook payloads are untrusted external input. Webhook endpoints should be thin.

```
1. Preserve the raw request body before parsing for signature verification.
2. Verify provider authenticity before any processing.
3. Reject unauthenticated requests.
4. Validate the payload shape.
5. Record the event using an idempotency key based on the provider event identity, backed by a unique constraint.
6. Acknowledge accepted receipt promptly (HTTP 200).
7. Enqueue a durable work item for the business effects (outbox pattern, see architecture.md).
```

- Never perform long-running work before acknowledging a valid webhook if it risks the provider timeout.
- Webhook routes are authenticated by provider signature, not by normal session auth or CSRF checks.
- Never mark a payment successful solely because a webhook arrived; payment must pass the Payment Verification rules.

---

## Error Responses

Errors must be safe, actionable, consistent, and free of secrets or internal implementation details.

```
- Use the error shape from code-style.md: { ok, error: { code, message, requestId } }.
- Use the error code taxonomy from error-handling.md.
- User-facing messages MUST NOT expose stack traces, internal service names, provider credentials, or database details.
- Include a requestId for support reference and log correlation.
```

---

## HTTP Status Codes

Use standard status codes consistently. Never return 200 for errors.

| Status | Usage                                                    |
| ------ | -------------------------------------------------------- |
| 200    | Successful read or update                                |
| 201    | Successful creation                                      |
| 202    | Accepted; async work queued (e.g., PAYMENT_PENDING)      |
| 204    | Successful deletion (no body)                            |
| 400    | Validation error (invalid input)                         |
| 401    | Not authenticated                                        |
| 403    | Not authorized (authenticated but not allowed)           |
| 404    | Resource not found                                       |
| 409    | Conflict (duplicate resource, invalid state transition)  |
| 413    | Request body too large                                   |
| 422    | Business-logic failure (e.g., PAYMENT_FAILED)            |
| 429    | Rate limited                                             |
| 500    | Internal error (logged, never exposed)                   |
| 502    | Upstream/external provider failure (INTEGRATION_FAILURE) |
| 503    | Provider/temporary service unavailable; retry later      |

---

## Pagination

List endpoints that can grow large must use a deliberate pagination strategy.

```
- Prefer cursor-based pagination over offset-based for large lists.
- Set a default page size and enforce a maximum; clamp or reject above the max.
- Return items plus a nextCursor (null when there are no more pages).
- Never rely on unpaginated full-list responses for orders, products, customers, or conversations.
```

---

## Rate Limiting

Protect authentication, public endpoints, expensive operations, messaging, AI operations, and webhook endpoints against abuse as appropriate.

```
- Apply rate limits to login, signup, password reset, order creation, uploads, and AI operations.
- Do not hardcode limits in route handlers; use the shared rate-limit utility.
- Health endpoints used by monitoring MUST NOT be rate-limited.
- Use a shared, production-safe backing store; in-memory limits are a development convenience only.
```

---

## CORS and CSRF

```
- Keep same-origin as the default for API routes; do not add permissive CORS headers.
- Do not set Access-Control-Allow-Origin: *.
- Add an explicit origin allowlist only when a cross-origin client is genuinely required.
- Rely on server-action CSRF protection and origin checks for state-changing route handlers.
- Webhook routes are server-to-server and bypass browser CORS; they are verified by provider signature.
```

---

## Forbidden

```
- Trusting frontend totals or status values.
- Returning another tenant's records.
- Logging credentials or secrets.
- Exposing raw provider responses unnecessarily.
- Marking an order paid from a redirect, client state, or unverified webhook payload.
- Processing the same payment event twice.
```
