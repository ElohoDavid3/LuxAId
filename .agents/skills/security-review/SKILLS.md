# Security Review Skill

> **VERSION** : 1.0
> **UPDATED** : 2026-08-13
> **COMPANION** : `security.md` (canonical security rules) · `multi-tenancy.md` (isolation) · `api.md` (CSRF/CORS, webhooks) · `ai-behaviour.md` (AI boundaries) · flutterwave-integration skill (payment verification)

---

## Purpose

Provide a repeatable security audit for changes to the AI commerce platform. This skill is the verification checklist; the rules files are the source of truth for the requirements they verify.

Read `.agents/rules/security.md`, `.agents/rules/multi-tenancy.md`, `.agents/rules/api.md`, `.agents/rules/ai-behaviour.md`, and the flutterwave-integration skill before reviewing any payment, auth, or AI code.

---

## Review Areas

Verify each area below. Every check MUST be answered with evidence from code and tests, not from assumptions.

### Authentication and Sessions

```
- MUST verify protected resources require authentication and that auth failures do not leak unnecessary information.
- MUST verify sessions use httpOnly, secure, and sameSite cookie attributes and are invalidated server-side on logout.
- MUST verify passwords are hashed with a strong adaptive algorithm (argon2id or bcrypt); plaintext storage/logging is forbidden.
- MUST verify password reset tokens expire, are single-use, hashed at rest, and superseded on re-request.
```

### Authorization

```
- MUST verify sensitive operations enforce server-side authorization; UI restrictions are never security controls.
- MUST verify least-privilege separation for business administration, products/inventory, orders, payments, conversations, staff, and analytics.
```

### Multi-Tenancy

```
- MUST verify reads, writes, search, AI retrieval, caches, jobs, exports, and integrations cannot cross business boundaries.
- MUST verify ownership is resolved server-side and client-provided IDs are never trusted as authorization.
- MUST require negative isolation tests; a cross-tenant attempt MUST fail identically to not-found.
- MUST verify tenant scoping is enforced at the query/service layer, never by UI filtering.
```

### Transport, CSRF, and CORS

```
- MUST verify HTTPS-only and security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) at the edge.
- MUST verify state-changing routes rely on server-action CSRF protection and origin checks, not permissive CORS.
- MUST flag any Access-Control-Allow-Origin: * as a blocker.
```

### Input and Injection

```
- MUST treat all external data as untrusted: customer messages, uploaded product data, AI outputs, webhook payloads, provider responses, query parameters.
- MUST verify strict schema validation (zod .strict()) at every external boundary.
- MUST review protections against SQL/NoSQL injection, command injection, XSS, template injection, prompt injection, unsafe deserialization, and SSRF where applicable.
```

### AI Security

```
- MUST verify customer content cannot override system instructions, reveal secrets, change tenant context, or modify authoritative data outside authorized tools.
- MUST verify merchant-provided content (product descriptions, knowledge entries) is treated as data, not instructions.
- MUST verify AI tooling enforces tenant scope, user permissions, input validation, business-state validation, and safe error handling.
- MUST verify AI-driven actions cannot bypass payment/order controls (see ai-behaviour.md).
```

### Payments

```
- MUST verify secret protection; Flutterwave keys and webhook hash are never exposed to browser code.
- MUST verify webhook authentication via the provider's current signature mechanism and raw-body preservation.
- MUST verify server-side payment verification comparing reference, amount, currency, and final status before value is granted.
- MUST verify duplicate-event handling is idempotent and backed by unique constraints, not lookup-only checks.
- MUST verify webhook replay is handled (event identity recorded before irreversible effects) and rejected/ignored safely.
- MUST verify client-side payment state, redirect parameters, and screenshots are never accepted as authoritative.
```

### Secrets and Data

```
- MUST search for hard-coded credentials, secrets, and committed .env files.
- MUST verify a defined rotation/exposure response exists: rotate at the provider, update the environment, deploy, revoke the old secret.
- MUST verify configuration is read through the validated env schema (lib/env.ts), never process.env directly in feature code.
- MUST verify logs, analytics, prompts, and error messages avoid unnecessary personal/payment data.
- MUST verify customer, order, and payment data protection and that exports respect tenant boundaries.
```

### Error Handling

```
- MUST verify user-facing errors never expose stack traces, internal service names, secrets, database details, or provider credentials.
- MUST verify security-sensitive events are auditable: authentication and permission changes, payment initiation/verification, webhook acceptance/rejection, order state changes, refunds, human takeover.
```

### API Abuse

```
- MUST verify rate limits on auth endpoints, public order creation, expensive operations, AI operations, and webhook endpoints use a shared, production-safe store.
- MUST review enumeration risks and public endpoint exposure.
```

### Dependencies

```
- MUST review new dependencies for necessity, excessive privilege, and suspicious behaviour.
- MUST verify versions are pinned and npm audit (or equivalent) fails CI on high/critical vulnerabilities.
```

---

## Procedure

1. Understand the feature and its trust boundaries.
2. Identify inputs and privileged operations.
3. Check tenant isolation.
4. Check authentication and authorization.
5. Check transport, CSRF, and CORS.
6. Check data handling and error handling.
7. Check AI threats.
8. Check payment/integration boundaries.
9. Check abuse protection and dependencies.
10. Review negative/security tests.
11. Report findings and re-verify fixes.

---

## Findings

Every finding MUST be recorded with enough detail to reproduce and verify the fix:

| Field          | Requirement                                         |
| -------------- | --------------------------------------------------- |
| ID             | unique finding identifier                           |
| Location       | `file:line` range                                   |
| Class          | category (e.g., tenant isolation, auth, injection)  |
| Severity       | CRITICAL, HIGH, MEDIUM, or LOW                      |
| Evidence       | code path, request, or test demonstrating the issue |
| Impact         | what is at risk and to whom                         |
| Recommendation | concrete remediation                                |
| Status         | OPEN, FIXED, or ACCEPTED                            |

## Severity

| Severity | Meaning                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | Direct cross-tenant access, credential exposure, or unverified payment value. MUST be fixed before merge.                 |
| HIGH     | Auth/authorization bypass, injection, or idempotency gap with real exploitability. MUST be fixed before merge.            |
| MEDIUM   | Hardening gap (rate limits, headers, logging detail). Should be fixed in this change or tracked to a committed follow-up. |
| LOW      | Best-practice or defense-in-depth improvement. Tracked, non-blocking.                                                     |

```
- MUST NOT declare security-sensitive work complete with a known CRITICAL or HIGH issue unless the project owner explicitly accepts the risk in writing.
```

## Definition of Done

A security review is complete only when:

- Every check above is answered with evidence.
- Blocking findings are fixed, re-verified, or explicitly accepted by the owner.
- Negative tests exist for tenant isolation, auth, and payment/webhook paths (see flutterwave-integration skill test list).
- No secrets, `.env` files, or permissive CORS are introduced.
- Findings are recorded with status and location for traceability.
