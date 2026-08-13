# Security Rules

> **VERSION** : 1.1
> **UPDATED** : 2026-08-13
> **COMPANION** : `architecture.md` (structure/patterns) · `api.md` (CSRF/CORS, webhooks) · `error-handling.md` (safe errors) · `multi-tenancy.md` (isolation) · `ai-behaviour.md` (AI security) · `integrations.md` (provider boundaries)

Protect merchant businesses, customer data, payment information, credentials, and tenant boundaries while keeping the product usable.

---

## Secrets

```
MUST NOT commit secrets to source control:
  - Flutterwave secret keys        - webhook secret hash
  - API tokens                     - database credentials
  - session secrets                - encryption keys

MUST use environment/secret management appropriate to the deployment environment.
MUST NOT commit .env files.
MUST read configuration through the validated env schema (lib/env.ts), never process.env directly in feature code.
```

---

## Secrets Lifecycle and Incident Response

```
MUST rotate any secret that may have been exposed (commit, log, client bundle, screenshot).
MUST treat a leaked secret as compromised immediately; do not continue using it.
MUST follow this order on exposure:
  1. Rotate the secret at the provider.
  2. Update the environment variable in the deployment.
  3. Deploy.
  4. Revoke the old secret.
MUST NOT attempt to hide a leak; record scope and resolution in writing.
```

---

## Flutterwave Secrets

```
MUST treat as server-side secrets, at minimum:
  - Flutterwave secret key
  - Flutterwave webhook secret/hash config

MUST NOT expose either to browser/client code.
```

---

## HTTPS and Transport Security

```
MUST encrypt every connection in transit (HTTPS); never serve over plain HTTP.
MUST set secure cookie flags so cookies are sent only over HTTPS.
MUST set HSTS, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy headers at the edge, not per route.
```

---

## Authentication and Sessions

```
MUST use secure auth practices appropriate to the chosen architecture.
MUST protect sessions against fixation, theft, and unauthorized reuse.
MUST use httpOnly, secure, and sameSite cookie attributes.
MUST invalidate sessions server-side on logout (not just delete the cookie).
MUST NOT store sensitive credentials in insecure browser storage when a safer option exists.
```

---

## Password Security

```
MUST hash passwords with a strong adaptive algorithm (argon2id or bcrypt).
MUST NEVER store or log plaintext passwords.
Password reset tokens MUST:
  - expire (short time limit)
  - be single use (invalidated on first use, before applying the change)
  - be hashed at rest (never stored raw in the database)
  - be superseded on re-request (invalidate prior pending tokens)
MUST return the same response whether an email is registered or not.
```

---

## Authorization

```
MUST use least privilege.

MUST separate permissions for:
  - business administration      - products/inventory
  - orders                       - payments
  - customer conversations       - staff management
  - analytics

See multi-tenancy.md for tenant-scoped enforcement.
```

---

## Tenant Isolation

```
MUST authorize every request against the authenticated user's business membership/permissions.

MUST NEVER trust client-provided:
  - businessId      - customerId      - orderId      - AI-provided identifiers

MUST resolve ownership server-side.

Tenant isolation MUST be enforced server-side/domain-side, never by UI filtering.
See multi-tenancy.md for the full isolation rules.
```

---

## CSRF and CORS

```
MUST rely on server-action CSRF protection and origin checks for state-changing route handlers.
MUST NOT add permissive CORS headers (Access-Control-Allow-Origin: *).
MUST keep same-origin as the default; add an explicit origin allowlist only when a cross-origin client is genuinely required.
Webhook routes are server-to-server: verified by provider signature, not browser CSRF or CORS.
```

---

## Rate Limiting and Abuse Protection

```
MUST rate-limit authentication endpoints (login, signup, password reset) to slow credential stuffing.
MUST rate-limit public order creation to slow card-testing abuse.
MUST rate-limit expensive operations, messaging, AI operations, and webhook endpoints as appropriate.
MUST use a shared, production-safe backing store; in-memory limits are a development convenience only.
MUST NOT rate-limit health endpoints used by monitoring.
```

---

## Webhook Authentication

```
MUST authenticate webhook requests using the provider's CURRENT signature mechanism.
MUST use the exact signature header + verification algorithm per the Flutterwave integration skill / official docs.
MUST NOT rely on source IP allowlists as the primary authenticity mechanism.
Webhook routes MUST be authenticated by provider signature, not normal session auth.
```

---

## Payment Verification

```
MUST NOT grant value based solely on:
  - client-side payment status
  - redirect query parameters
  - a customer screenshot
  - an unverified webhook payload

MUST, before marking an order paid, verify with Flutterwave and compare:
  - transaction/reference identity
  - expected amount
  - expected currency
  - successful final transaction status

MUST confirm the verified transaction maps to the app's pending payment attempt/order.
See api.md and integrations.md for the full verification flow.
```

---

## Webhook Replay and Duplicates

```
MUST make webhook processing idempotent.
MUST record provider event identity (or a safe idempotency key) BEFORE irreversible effects.

A duplicate webhook MUST NOT:
  - create another order
  - confirm payment twice
  - send duplicate fulfilment instructions
  - trigger duplicate value delivery

Deduplication MUST be backed by unique constraints, not lookup-only checks.
```

---

## Input Security

```
MUST treat ALL external data as untrusted:
  - customer messages    - uploaded product data
  - AI outputs           - webhook payloads
  - provider responses   - query parameters

MUST validate and sanitize according to context.
MUST use strict schemas (zod .strict()) at every external boundary.
```

---

## AI Security

```
MUST NOT let AI bypass authorization or perform unrestricted data access.

AI tools MUST enforce:
  - tenant scope
  - user permissions
  - input validation
  - business-state validation
  - safe error handling

Prompt injection from customer messages MUST NOT override system/business rules or expose secrets.

MUST treat merchant-provided content (product descriptions, knowledge entries) as data, not instructions.
MUST NOT allow content embedded in data to redirect AI behavior or exfiltrate tool outputs or business data.
See ai-behaviour.md for full AI boundary rules.
```

---

## Sensitive Data

```
MUST collect only data necessary for the product workflow.
MUST NOT place unnecessary personal/payment data in logs, analytics, prompts, or error messages.
```

---

## Auditability

```
MUST record security-sensitive and financially significant events:
  - authentication changes   - permission changes
  - payment initiation       - payment verification
  - webhook acceptance/rejection
  - order state changes      - refund actions
  - human takeover

MUST NOT include secrets in audit records.
```

---

## Error Handling

```
User-facing errors MUST NOT expose:
  - stack traces        - internal service names
  - secrets             - database details
  - provider credentials

MUST log technical detail securely on the server where necessary.
See error-handling.md for the canonical error envelope and taxonomy.
```

---

## Dependency and Integration Security

```
MUST keep dependencies current per project policy.
MUST pin dependency versions; updates happen through deliberate automation/PR review, never silently.
MUST run npm audit (or equivalent) in CI and fail on high/critical vulnerabilities.
MUST review integrations for:
  - authentication          - signature verification
  - webhook replay          - rate limits
  - failure behavior        - data handling

MUST verify provider behavior against official documentation before implementation.
```
