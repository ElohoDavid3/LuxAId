# Error Handling Rules

> **VERSION** : 1.0
> **UPDATED** : 2026-08-13
> **COMPANION** : `api.md` (response shape, status codes) · `code-style.md` (logger) · `ai-behaviour.md` (AI errors) · `database.md` (auditability)

---

## Purpose

Make failures predictable, safe, and understandable. This file is the canonical owner of the error code taxonomy and the error envelope.

---

## Principles

```
- Never hide important failures.
- Never fabricate success.
- Never expose secrets or internal stack traces to customers.
- Preserve enough context for diagnosis.
- Use explicit error categories where appropriate.
- Recover safely where possible.
- Escalate to humans when automated resolution is unsafe.
```

---

## Error Envelope

Every route handler, server action, and webhook response uses the canonical error shape:

```typescript
// Success
{ ok: true, data: T }

// Failure
{
  ok: false,
  error: {
    code: string,   // from the taxonomy below
    message: string, // human-readable, sanitized for the customer
    requestId: string // for support tickets and log correlation
  }
}
```

```
- Every error response MUST include a requestId.
- The client MUST display the requestId for support reference.
- User-facing messages MUST NOT expose stack traces, internals, or secrets.
```

---

## Domain Error Categories

Grouped by layer. Do not create duplicate names for the same semantic error without a reason. Do not invent new codes without adding them here.

### Validation and Authorization

| Code               | Meaning                                                 |
| ------------------ | ------------------------------------------------------- |
| `VALIDATION_ERROR` | invalid input (types, required fields, formats, ranges) |
| `UNAUTHORIZED`     | not authenticated                                       |
| `FORBIDDEN`        | authenticated but not allowed                           |

### Domain

| Code                   | Meaning                                        |
| ---------------------- | ---------------------------------------------- |
| `UNKNOWN_PRODUCT`      | product does not exist                         |
| `PRODUCT_UNAVAILABLE`  | product exists but cannot be sold              |
| `INSUFFICIENT_STOCK`   | requested quantity exceeds available inventory |
| `INVALID_ORDER`        | order fails a domain guard                     |
| `DELIVERY_UNAVAILABLE` | no delivery option applies to the order        |

### Payment

| Code                 | Meaning                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `PAYMENT_PENDING`    | attempt exists but is not yet verified                            |
| `PAYMENT_FAILED`     | provider or reconciliation confirms failure                       |
| `PAYMENT_UNVERIFIED` | no verification result obtainable for the reference               |
| `PAYMENT_MISMATCH`   | verified tx does not match reference, amount, currency, or status |

### AI

| Code                        | Meaning                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `AI_KNOWLEDGE_GAP`          | required information is missing from verified business data |
| `AI_UNCERTAIN`              | conflicting or stale data; AI cannot answer with certainty  |
| `HUMAN_ESCALATION_REQUIRED` | policy or safety requires a human (see ai-behaviour.md)     |

### Integration and Internal

| Code                  | Meaning                                                  |
| --------------------- | -------------------------------------------------------- |
| `INTEGRATION_FAILURE` | external provider failed or returned an invalid response |
| `INTERNAL_ERROR`      | unexpected server error (logged, never exposed)          |

---

## HTTP Status Mapping

| Code                                                            | HTTP                    |
| --------------------------------------------------------------- | ----------------------- |
| `VALIDATION_ERROR`                                              | 400                     |
| `UNAUTHORIZED`                                                  | 401                     |
| `FORBIDDEN`                                                     | 403                     |
| `UNKNOWN_PRODUCT` / `PRODUCT_UNAVAILABLE`                       | 404                     |
| `INSUFFICIENT_STOCK` / `INVALID_ORDER` / `DELIVERY_UNAVAILABLE` | 409 or 422 by operation |
| `PAYMENT_FAILED` / `PAYMENT_MISMATCH` / `PAYMENT_UNVERIFIED`    | 422                     |
| `PAYMENT_PENDING`                                               | 202 or 409 by operation |
| `INTEGRATION_FAILURE`                                           | 502 or 503              |
| `INTERNAL_ERROR`                                                | 500                     |

See `api.md` for the full HTTP status contract. Never return 200 for errors.

---

## AI Errors

If the AI cannot safely answer, do not guess.

```
- Ask for clarification if that can resolve the issue.
- Otherwise explain the limitation plainly and escalate where appropriate.
- Map to AI error codes (AI_KNOWLEDGE_GAP, AI_UNCERTAIN, HUMAN_ESCALATION_REQUIRED) rather than inventing alternatives.
- Follow ai-behaviour.md for grounding and handoff rules.
```

---

## Payment Errors

```
- Never transition an order to PAID because a customer says they paid, a frontend callback says payment succeeded, or an unverified webhook arrived.
- On a verification mismatch, leave the attempt in a valid state and log the mismatch; never mark the order paid.
- Keep payment errors auditable (see database.md).
```

---

## Integration Errors

External provider failures must be distinguishable from business failures.

```
- Persist enough information for retry/reconciliation where appropriate.
- Never log full payment credentials, authorization headers, or unredacted provider payloads.
- Map provider failures to INTEGRATION_FAILURE; do not surface provider internals to customers.
```

---

## User-Facing Errors

Customer-facing messages should:

```
- Use plain English at a secondary-school reading level.
- Explain what happened without exposing internals.
- Give a useful next step.
- Avoid blame.
- Include the requestId for support reference.
```

---

## Developer-Facing Errors

Internal logs should contain useful diagnostic context.

```
- Include: request/event ID, business ID where appropriate, entity ID, operation, error category, and safe provider references.
- Use the structured logger (JSON) per code-style.md.
- Never log secrets, authentication tokens, full payment credentials, or unnecessary sensitive customer data.
```

---

## Recovery

For retryable failures:

1. Determine whether the operation is safe to retry.
2. Apply idempotency where required.
3. Retry within defined limits.
4. Record repeated failure.
5. Escalate or surface the failure if recovery is unsuccessful.

```
- Retries of financial or business-significant operations MUST be idempotent by construction.
- Webhook failures MUST be acknowledged promptly and recovered asynchronously; never swallow the failure.
```

---

## Partial Failure

Do not report an operation as fully successful when only part succeeded.

```
- Represent the actual state.
- Provide a safe recovery path.
```

---

## Forbidden

```
- Empty catch blocks.
- Silent failure.
- Generic success responses after failed operations.
- Swallowing webhook failures.
- Automatically retrying irreversible operations without idempotency.
- Inventing error codes not in the taxonomy above.
```
