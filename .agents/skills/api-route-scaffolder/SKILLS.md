# API Route Scaffolder

Create Next.js App Router route handlers for LuxAId. Read `.agents/rules/api.md`, `.agents/rules/error-handling.md`, `.agents/rules/architecture.md`, and `.agents/rules/security.md` before building a route.

## Location and Naming

- Route handlers live at `src/app/api/{resource}/route.ts`.
- One route file per resource path segment; group related actions under the same route segment (e.g., `src/app/api/orders/route.ts` and `src/app/api/orders/[id]/route.ts`).
- Conversations and customer-facing actions use route handlers under `src/app/api/`. Dashboard actions use server actions, not route handlers.
- Do not call the Flutterwave API directly from a route handler. Use the `lib/flutterwave.ts` wrapper.

## Response Shape

Every route handler returns this shape:

```typescript
// Success
type SuccessResponse<T> = {
  ok: true;
  data: T;
};

// Failure
type ErrorResponse = {
  ok: false;
  error: {
    code: string; // from the error-code taxonomy
    message: string; // human-readable, sanitized for the client
    requestId: string; // for support tickets and log correlation
  };
};
```

Do not return `200` for errors. Use the HTTP status that matches the error.

## HTTP Status Codes

| Status | Usage                                                                     |
| ------ | ------------------------------------------------------------------------- |
| 200    | Successful read or update                                                 |
| 201    | Successful creation                                                       |
| 202    | Accepted; async work queued (e.g., PAYMENT_PENDING)                       |
| 204    | Successful deletion (no body)                                             |
| 400    | Validation error (client sent bad input)                                  |
| 401    | Not authenticated                                                         |
| 403    | Not authorized (authenticated but not allowed)                            |
| 404    | Resource not found                                                        |
| 409    | Conflict (duplicate transaction, etc.)                                    |
| 413    | Request body too large                                                    |
| 422    | Business logic failure (e.g., Flutterwave payment could not be completed) |
| 429    | Rate limited                                                              |
| 500    | Internal server error (logged, never exposed to the client)               |
| 502    | Upstream/external provider failure (INTEGRATION_FAILURE)                  |
| 503    | Provider/temporary service unavailable; retry later                       |

## Error-Code Taxonomy

Use the codes defined in `.agents/rules/error-handling.md`, which is the canonical owner of the taxonomy. Add new codes there if the taxonomy genuinely needs them. Do not use codes outside that taxonomy.

| Code                   | HTTP       | When to use                                                       |
| ---------------------- | ---------- | ----------------------------------------------------------------- |
| `VALIDATION_ERROR`     | 400        | Zod validation failed on input                                    |
| `UNAUTHORIZED`         | 401        | No session or invalid session                                     |
| `FORBIDDEN`            | 403        | Authenticated but not allowed (e.g., another tenant's data)       |
| `RATE_LIMITED`         | 429        | Too many requests                                                 |
| `UNKNOWN_PRODUCT`      | 404        | Product does not exist                                            |
| `PRODUCT_UNAVAILABLE`  | 404        | Product exists but cannot be sold                                 |
| `INSUFFICIENT_STOCK`   | 409 or 422 | Requested quantity exceeds available inventory                    |
| `INVALID_ORDER`        | 409 or 422 | Order fails a domain guard                                        |
| `DELIVERY_UNAVAILABLE` | 409 or 422 | No delivery option applies to the order                           |
| `PAYMENT_PENDING`      | 202 or 409 | Attempt exists but is not yet verified                            |
| `PAYMENT_FAILED`       | 422        | Provider or reconciliation confirms failure                       |
| `PAYMENT_UNVERIFIED`   | 422        | No verification result obtainable for the reference               |
| `PAYMENT_MISMATCH`     | 422        | Verified tx does not match reference, amount, currency, or status |
| `INTEGRATION_FAILURE`  | 502 or 503 | External provider failed or returned an invalid response          |
| `INTERNAL_ERROR`       | 500        | Unexpected server error (logged, never exposed)                   |

## Required Sequence

Follow this order in every protected route handler:

1. **Request ID:** create or read a request ID and attach it to the logger context.
2. **Rate limit:** call the `lib/rate-limit.ts` utility. Do not hardcode limits in the handler.
3. **Authenticate:** check the session with `lib/auth.ts` `getSession()`. Return `401 UNAUTHORIZED` if missing.
4. **Parse and validate:** parse the body, then validate with the zod schema in `lib/validators/`. Return `400 VALIDATION_ERROR` with a sanitized message.
5. **Authorize:** resolve the resource ownership server-side. Never trust client-provided `tenantId`, `customerId`, or `orderId`. Return `403 FORBIDDEN` for cross-tenant access.
6. **Check idempotency:** for operations that could duplicate financial, order, inventory, or messaging effects (payment creation, order creation), use a server-issued idempotency key backed by a unique constraint. Never use a lookup-only check.
7. **Run domain logic:** call the domain service in `features/`. Never write business logic inline in the handler.
8. **Map domain errors:** convert domain failures from `features/` services into taxonomy codes and matching HTTP statuses (see Error-Code Taxonomy). Never leak internal details.
9. **Audit money/state changes:** record payment initiation, payment verification, and order state changes as audit events (see `architecture.md`).
10. **Log and respond:** log through the structured logger with the request ID; return the standard response shape.

### Public and Health Routes

- Routes that must be public (e.g., product page data, health check) skip authentication but still enforce rate limits and input validation where appropriate.
- `GET /api/health` is unauthenticated and must not be rate-limited. It is used by monitoring tools. Never expose environment variables, connection strings, or internal details in its response.

### CSRF and CORS

- State-changing route handlers rely on origin checks; server actions have built-in CSRF protection.
- Do not add permissive CORS headers (`Access-Control-Allow-Origin: *`). Keep same-origin as the default; add an explicit allowlist only when a cross-origin client is genuinely required.
- The Flutterwave webhook route is server-to-server: verified by provider signature, not browser CSRF or CORS.

## Payment Routes

Routes that initiate or confirm payments follow the money path. Never grant value from client state.

1. **Persist the internal payment attempt before redirecting the customer.**
2. **Create the Flutterwave checkout/payment link server-side** through `lib/flutterwave.ts`. Do not call the Flutterwave API directly.
3. **Handle the redirect as untrusted.** The success page shows "Verifying your payment..." and never marks the order paid.
4. **On webhook, verify server-side with Flutterwave** and compare reference, amount, currency, and successful final status against the expected payment attempt.
5. **Update payment and order atomically** according to the valid state transitions in `architecture.md`. On any mismatch, leave the state unchanged and log the mismatch.

## Malformed Request Handling

- **Invalid JSON:** if `request.json()` throws, return `400 VALIDATION_ERROR` with "Request body is not valid JSON."
- **Missing Content-Type:** if a POST route expects JSON but the `Content-Type` header is absent or not `application/json`, return `400 VALIDATION_ERROR`.
- **Empty body on POST:** if a POST route requires a body and none is provided, return `400 VALIDATION_ERROR`.
- **Unexpected fields:** use zod `.strict()` mode. Reject unknown fields rather than silently ignoring them.

## Tenant Isolation

- Every Prisma query on a tenant-owned table must include `tenantId` in the `where` clause.
- Resolve ownership from the session, never from client input.
- A merchant must never read or modify another merchant's products, customers, conversations, orders, or payments.

## Pagination

List endpoints use cursor-based pagination:

- Query params: `?cursor={id}&limit=20`.
- Default page size 20; max 50 (clamp above 50).
- Response: `{ ok: true, data: { items: [...], nextCursor: string | null } }`.
- Never use `skip`/`offset` in Prisma queries.

## Logging

- Use `lib/logger.ts`. Do not use `console.log` or `console.error` in server code.
- Every log statement within a request must include the request ID.
- Never log secrets, authorization headers, full payment credentials, or unnecessary customer data.

## Tests

Route handlers require Jest integration tests that mock Prisma and external providers. Cover:

- Happy path.
- Invalid input.
- Unauthorized access.
- Cross-tenant access.
- Duplicate request.
- Provider failure.
- Missing business data.

Place tests next to the code they test (e.g., `src/app/api/orders/route.test.ts`).
