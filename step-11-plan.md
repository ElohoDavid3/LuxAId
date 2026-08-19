# Step 11 — WhatsApp Integration Audit

Audit the project for Step 11 readiness.

Do NOT write or modify any code.

---

## 1. What Step 11 Requires

From PRD §11.2 ("Communication Channels and Messages") and the `whatsapp-commerce` skill:

### Core Requirements

1. **WhatsApp Business Cloud API inbound webhook endpoint**
   - Subscription verification (GET) — echo `hub.challenge` when `hub.mode=subscribe` and `hub.verify_token` matches.
   - Event verification (POST) — verify `X-Hub-Signature-256` over raw body with timing-safe comparison. Reject unauthenticated with `401`.
   - Acknowledge accepted receipt promptly (`HTTP 200`); never perform long-running work inline.

2. **Payload validation** — strict schema (zod `.strict()`) on the `object`/`entry`/`changes`/`value` envelope. Reject unknown fields. Treat all events as untrusted input.

3. **Business resolution** — resolve the owning business server-side from the authoritative phone-number-ID → tenant mapping. Never select from untrusted input.

4. **Customer identity** — use stable channel identifiers (WhatsApp phone number) as identity key. Map to `CustomerChannelIdentity` → `Customer`.

5. **Conversation lifecycle** — locate or create a conversation for the customer within the business. Respect `controlState` before invoking AI.

6. **Message persistence (idempotent)** — deduplicate inbound messages on the WhatsApp message ID (`wamid`), backed by a unique constraint. Record provider event identity before applying business effects.

7. **AI invocation** — when `controlState === AI_CONTROLLED`, invoke the AI agent with the message. When human-controlled, suppress automated replies.

8. **Outbound messaging** — send replies through the WhatsApp Cloud API using the access token, resolved server-side. Set explicit timeouts. Retry with bounded exponential backoff and jitter for idempotent operations only.

9. **Media handling** — validate media type/size before download/storage. Store media tenant-scoped. Preserve message with safe placeholder if media processing is out of scope.

10. **Consent-aware outbound** — opt-out support. Customer must be able to stop receiving automated messages.

11. **Audit records** — for message receipt, outbound sends, and webhook events.

12. **Tenant isolation** — every conversation, message, and media record scoped to the correct business.

---

## 2. What Already Exists and Can Be Reused

### Schema (Prisma)

| Model | Status | Notes |
|-------|--------|-------|
| `Conversation` | ✅ Exists | Has `businessId`, `customerId`, `controlState`, `status`. Missing: `channel` field, no link to `CustomerChannelIdentity`. |
| `Message` | ✅ Exists | Has `businessId`, `conversationId`, `authorType`, `channel`, `providerMessageId`, `body`. Unique on `[businessId, channel, providerMessageId]`. Missing: no direction field (inbound vs outbound), no delivery status tracking. |
| `Customer` | ✅ Exists | Has `businessId`, `name`, `phone`, `email`, `location`. |
| `CustomerChannelIdentity` | ✅ Exists | Has `businessId`, `customerId`, `channel`, `channelId`. Unique on `[businessId, channel, channelId]`. **Exactly what's needed for phone-number → customer mapping.** |
| `Escalation` | ✅ Exists | Full lifecycle (OPEN → ASSIGNED → RESOLVED/CANCELLED). |
| `BusinessSettings` | ✅ Exists | `policies` (Json), `deliveryDefaults` (Json), `notificationConfig` (Json). Could hold WhatsApp config as JSON. |
| `AuditLog` | ✅ Exists | Tenant-scoped, structured. |

### Enums

| Enum | Status | Notes |
|------|--------|-------|
| `ConversationControlState` | ✅ | `AI_CONTROLLED`, `PENDING_HANDOFF`, `HUMAN_CONTROLLED` |
| `ConversationStatus` | ✅ | `NEW`, `ACTIVE`, `WAITING_FOR_CUSTOMER`, `RESOLVED`, `CLOSED` |
| `MessageAuthorType` | ✅ | `CUSTOMER`, `AI`, `HUMAN`, `SYSTEM` |
| `EscalationStatus` | ✅ | `OPEN`, `ASSIGNED`, `RESOLVED`, `CANCELLED` |

### Services

| Service | Status | Notes |
|---------|--------|-------|
| `conversation.service.ts` | ✅ | Tenant-scoped CRUD, control state transitions, authorization. |
| `message.service.ts` | ✅ | Create (idempotent on `providerMessageId`), list with cursor pagination, tenant-scoped. |
| `customer.service.ts` | ✅ | CRUD with `CustomerChannelIdentity` included in results. |
| `escalation.service.ts` | ✅ | Full lifecycle with state machine guards, idempotent creation. |
| `knowledge.service.ts` | ✅ | Active knowledge retrieval for AI grounding. |

### AI Agent

| Component | Status | Notes |
|-----------|--------|-------|
| `agent.ts` | ✅ | Handles incoming messages, checks `controlState`, invokes LLM with tool loop, creates AI messages, escalates on failure. |
| `tools/definitions.ts` | ✅ | 8 tools: `search_products`, `get_product`, `check_stock`, `list_delivery_zones`, `create_order`, `initiate_payment`, `get_order`, `escalate_to_human`. |
| `tools/handlers.ts` | ✅ | All handlers use system-user auth, tenant-scoped. |
| `prompts/system.ts` | ✅ | Builds grounded system prompt from business data, policies, knowledge, delivery zones. |
| `llm/provider.ts` | ✅ | OpenAI-based provider abstraction. |

### Auth / Authorization

| Component | Status | Notes |
|-----------|--------|-------|
| `authorization.ts` | ✅ | `requireScope()` — membership + role-based scope check. |
| `permissions.ts` | ✅ | Role → scope mapping. |
| `audit.ts` | ✅ | `logAudit()` + `safeAudit()`. |

### Rules and Skills

| Document | Status | Notes |
|----------|--------|-------|
| `whatsapp-commerce/SKILLS.md` | ✅ | Comprehensive: lifecycle, auth, payload validation, tenant context, identity, idempotency, conversation control, AI/untrusted input, commerce actions, outbound, media, failures, data handling, testing. |
| `ai-commerce-agent/SKILLS.md` | ✅ | Agent grounding, tenant boundary, orders/payments, idempotency, human approval gate, escalation, prompt injection. |
| `human-handoff/SKILLS.md` | ✅ | Escalation state machine, control, context, authorization, idempotency, audit, failure handling. |
| `integrations.md` | ✅ | Webhook pattern (10-step), retry strategy, timeout behavior, secrets, observability. |
| `multi-tenancy.md` | ✅ | Tenant boundary, enforcement, ownership resolution, query scoping, caching, logging. |
| `security.md` | ✅ | Webhook auth, input security, AI security, sensitive data, rate limiting. |
| `api.md` | ✅ | Validation, idempotency, webhook rules, error responses, HTTP status codes. |
| `error-handling.md` | ✅ | Error taxonomy including `INTEGRATION_FAILURE`, `AI_KNOWLEDGE_GAP`, etc. |
| `architecture.md` | ✅ | State transitions, payment architecture, webhook processing, outbox pattern, idempotency, multi-tenancy. |

### Infrastructure

| Component | Status | Notes |
|-----------|--------|-------|
| `lib/env.ts` | ✅ | Zod-validated env schema. Missing: WhatsApp variables. |
| `lib/errors.ts` | ✅ | `AppError` class with codes and HTTP mapping. Missing: `INTEGRATION_FAILURE`, `PAYMENT_*` codes. |
| `lib/logger.ts` | ✅ | Structured JSON logger. |
| `lib/prisma.ts` | ✅ | Prisma client singleton. |

---

## 3. What Is Genuinely Missing

### A. Schema Gaps

1. **No `channel` field on `Conversation`** — conversations have no record of which channel they originated from. Required for multi-channel support and WhatsApp-specific conversation window management.

2. **No phone-number-ID → business mapping** — the skill requires resolving the business server-side from the WhatsApp phone-number-ID. There is no model, configuration, or mapping table for this.

3. **No WhatsApp credentials storage** — `BusinessSettings` has no structured fields for WhatsApp Business Account ID, Phone Number ID, Access Token, or Verify Token. These could go in the existing `notificationConfig` JSON field, but a structured approach is cleaner.

4. **No outbound message delivery tracking** — no way to record WhatsApp message IDs for sent messages, delivery status, read status, or failed delivery. Needed for follow-up timing and analytics.

5. **No consent/opt-out field on `Customer`** — PRD §11.2 and the skill require consent-aware outbound messaging. The `Customer` model has no `consentStatus` or `optedOut` field.

6. **No outbound message queue/outbox** — `architecture.md` requires durable outbox pattern for side effects. No outbox table exists for outbound WhatsApp messages.

7. **Missing error codes** — `lib/errors.ts` lacks `INTEGRATION_FAILURE`, `PAYMENT_PENDING`, `PAYMENT_FAILED`, `PAYMENT_UNVERIFIED`, `PAYMENT_MISMATCH` codes referenced in `error-handling.md`.

### B. Integration Layer Gaps

8. **No WhatsApp Cloud API client** — no wrapper for sending outbound messages, managing templates, or fetching media.

9. **No webhook handler** — no `POST /api/webhooks/whatsapp` endpoint exists.

10. **No subscription verification endpoint** — no `GET /api/webhooks/whatsapp` for Meta's challenge verification.

11. **No outbound message sending service** — no service for composing and sending WhatsApp messages with timeout, retry, and idempotency.

### C. Configuration Gaps

12. **WhatsApp env variables not in schema** — `env.ts` lacks:
    - `WHATSAPP_APP_SECRET` — for webhook signature verification
    - `WHATSAPP_VERIFY_TOKEN` — for subscription challenge
    - `WHATSAPP_ACCESS_TOKEN` — for outbound messages (could be per-business, but at minimum a system-level token for MVP)

13. **WhatsApp config not in `.env.example`** — no documentation of required variables.

### D. Conversation Window Management

14. **No 24-hour service window tracking** — Meta's WhatsApp Business API uses 24-hour conversation windows. The system needs to know whether it can send free-form messages or must use pre-approved templates. No mechanism exists for this.

### E. Template Message System

15. **No template message management** — outbound follow-ups (order confirmation, payment confirmation, delivery updates, abandoned-order recovery) require Meta-approved templates. No system exists for:
    - Storing template names and parameters
    - Tracking template approval status
    - Rendering template messages
    - Managing template usage/costs

### F. Media Handling

16. **No media download/storage infrastructure** — WhatsApp media messages carry temporary IDs that must be fetched with the access token. No storage strategy, type validation, or size limits are defined.

---

## 4. Blocking Decisions — Confirmed

| # | Decision | Confirmed Choice | Rationale |
|---|----------|-----------------|-----------|
| 1 | **Phone-number-ID → business mapping storage** | **BusinessSettings JSON** — store in `notificationConfig` alongside credentials | Tenant-scoped, no new model, one WhatsApp number per business for MVP. Revisit for multi-number. |
| 2 | **WhatsApp credentials location** | **BusinessSettings JSON** — `notificationConfig` field | Structured JSON within existing tenant-scoped model. System-level `WHATSAPP_APP_SECRET` and `WHATSAPP_ACCESS_TOKEN` in env for shared config; per-business token in `notificationConfig`. |
| 3 | **Media storage strategy** | **Defer with placeholder** — preserve message with safe placeholder, record media metadata, no download | Reduces MVP scope. Media can be fetched on-demand later. |
| 4 | **Template message scope** | **Hardcode approved templates** — store template names in `BusinessSettings.notificationConfig`, no management UI | Pre-approved Meta templates for order/payment confirmations. No UI needed yet. |
| 5 | **24-hour window tracking** | **Add `lastInboundAt` to `Conversation`** | Simple DateTime field. Updated on every inbound webhook. Enables window-aware messaging. |
| 6 | **Outbound message queue** | **Inline with retry for MVP** — send inline, audit, retry. Outbox later when automated follow-ups ship. | Pragmatic MVP scope. |

---

## 5. Contradictions or Gaps

| # | Issue | Severity | Resolution |
|---|-------|----------|------------|
| 1 | `Conversation` model has no `channel` field. PRD requires channel-aware conversations. | **High** | Add `channel String` to `Conversation`. Index on `[businessId, channel]`. |
| 2 | `Conversation` has no direct link to `CustomerChannelIdentity`. Skill requires mapping channel identity → conversation. | **Medium** | Add optional `channelIdentityId` to `Conversation`, or resolve via `Customer` → `CustomerChannelIdentity` at runtime. |
| 3 | `Message` model uses `channel` as plain string, not enum. Both inbound WhatsApp and outbound WhatsApp use `'whatsapp'`. No direction field. | **Medium** | Add `direction` field (`INBOUND` / `OUTBOUND`) to distinguish. Keep `channel` as string for flexibility. |
| 4 | `lib/errors.ts` is missing several codes from `error-handling.md`: `INTEGRATION_FAILURE`, `PAYMENT_PENDING`, `PAYMENT_FAILED`, `PAYMENT_UNVERIFIED`, `PAYMENT_MISMATCH`, `INVALID_ORDER`, `DELIVERY_UNAVAILABLE`, `PRODUCT_UNAVAILABLE`, `UNKNOWN_PRODUCT` (exists), `UNKNOWN_CUSTOMER` (exists). | **High** | Add all missing codes with correct HTTP mappings before WhatsApp integration. |
| 5 | `Message` model has no `providerMessageId` for outbound messages. Unique constraint `[businessId, channel, providerMessageId]` may conflict for outbound messages where `providerMessageId` is set after send. | **Medium** | Ensure outbound flow sets `providerMessageId` after API response. The nullable constraint already allows this. |
| 6 | No consent/opt-out tracking on `Customer`. PRD §11.2 and skill require consent-aware outbound. | **High** | Add `consentStatus` field to `Customer` (e.g., `OPTED_IN` / `OPTED_OUT` / `UNKNOWN`). Default `UNKNOWN`. |
| 7 | `ConversationStatus` enum is missing `WAITING_FOR_HUMAN` from PRD §21. | **Low** | Add if needed for UI. `PENDING_HANDOFF` in `ConversationControlState` partially covers this. |
| 8 | No outbound message retry or delivery status tracking. Skill requires recording send result. | **Medium** | Add `Message.status` field (`SENT` / `DELIVERED` / `FAILED`) for outbound messages. |
| 9 | WhatsApp access token may need per-business rotation. `BusinessSettings.notificationConfig` JSON makes rotation harder to audit. | **Low** | Acceptable for MVP. Document rotation procedure. |

---

## 6. Smallest Necessary Implementation Sequence

### Phase 1: Schema and Config (prerequisite)

1. Add missing error codes to `lib/errors.ts`:
   - `INVALID_ORDER` → 409
   - `DELIVERY_UNAVAILABLE` → 422
   - `PAYMENT_PENDING` → 202
   - `PAYMENT_FAILED` → 422
   - `PAYMENT_UNVERIFIED` → 422
   - `PAYMENT_MISMATCH` → 422
   - `INTEGRATION_FAILURE` → 502
2. Add `channel String` to `Conversation` model. Index `[businessId, channel]`.
3. Add `lastInboundAt DateTime?` to `Conversation` model (for 24-hour window tracking).
4. Add `MessageDirection` enum (`INBOUND`, `OUTBOUND`) and `direction` field to `Message` model.
5. Add `MessageDeliveryStatus` enum (`PENDING`, `SENT`, `DELIVERED`, `FAILED`) and `status` field to `Message` model.
6. Add `CustomerConsentStatus` enum (`OPTED_IN`, `OPTED_OUT`, `UNKNOWN`) and `consentStatus` field to `Customer` model.
7. Add WhatsApp env variables to `env.ts`: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN` (all optional for local dev).
8. Document WhatsApp variables in `.env.example`.
9. Run Prisma migration.

### Phase 2: Integration Layer

10. Create `src/features/whatsapp/config.ts` — resolve WhatsApp credentials from `BusinessSettings.notificationConfig` + env vars. System-level `WHATSAPP_ACCESS_TOKEN` fallback.
11. Create `src/features/whatsapp/signature.ts` — HMAC-SHA256 signature verification against raw body. Timing-safe comparison.
12. Create `src/features/whatsapp/client.ts` — WhatsApp Cloud API client for outbound messages (send text, send template). Explicit timeout, bounded exponential backoff retry, idempotent send keyed on outbound message ID.
13. Create `src/features/whatsapp/webhook-events.ts` — parse and validate the WhatsApp webhook envelope (zod `.strict()` schema). Treat all events as untrusted input.
14. Create `src/features/whatsapp/phone-mapping.ts` — resolve phone-number-ID → business by querying `BusinessSettings.notificationConfig` where `config.whatsappPhoneNumberId === incomingId`. Tenant-scoped lookup.
15. Create `src/features/whatsapp/customer-identity.ts` — resolve WhatsApp phone number → `CustomerChannelIdentity` → `Customer`, or create new customer with `consentStatus: UNKNOWN`.

### Phase 3: Webhook Endpoints

16. Create `src/app/api/webhooks/whatsapp/route.ts`:
    - `GET` handler: subscription verification — check `hub.mode=subscribe`, echo `hub.challenge` when `hub.verify_token` matches env `WHATSAPP_VERIFY_TOKEN`.
    - `POST` handler: event processing.
17. Implement POST flow:
    1. Preserve raw body for signature verification.
    2. Verify `X-Hub-Signature-256` with timing-safe comparison. Reject unauthenticated with `401`.
    3. Parse and validate envelope with zod `.strict()`.
    4. Return `200` immediately for accepted events.
    5. Resolve business from `phone_number_id` via `phone-mapping.ts`.
    6. Resolve customer identity via `customer-identity.ts`.
    7. Resolve or create conversation for customer within business.
    8. Persist inbound message idempotently on `wamid` (unique constraint).
    9. Update `conversation.lastInboundAt`.
    10. Check `conversation.controlState`:
        - If `AI_CONTROLLED` → invoke `handleIncomingMessage()` from `ai/agent.ts`.
        - If `HUMAN_CONTROLLED` or `PENDING_HANDOFF` → suppress AI, persist message only.
    11. Send AI reply via outbound service (if AI responded).
    12. Record audit events for receipt, AI invocation, and outbound send.

### Phase 4: Outbound and Message Flow

18. Create `src/features/whatsapp/send.ts`:
    - Compose message from AI reply text.
    - Check `customer.consentStatus` — skip if `OPTED_OUT`.
    - Check `conversation.lastInboundAt` — within 24h window → free-form; outside → template.
    - Send via `client.ts` with timeout and retry.
    - Persist outbound `Message` with `direction: OUTBOUND`, `status: SENT`, `providerMessageId` from API response.
    - Audit outbound send.
19. Wire AI agent responses to outbound: after `handleIncomingMessage()` returns, send the reply via `whatsapp/send.ts`.
20. Implement template message sending for order confirmation, payment confirmation (when those features ship). Template names stored in `BusinessSettings.notificationConfig.whatsappTemplates`.

### Phase 5: Testing

21. Unit tests (Jest):
    - Signature verification (valid, invalid, missing).
    - Payload schema validation (valid, malformed, unknown fields).
    - Phone-number mapping (known number, unknown number).
    - Customer identity resolution (existing customer, new customer, cross-business).
    - Consent check (OPTED_IN allows send, OPTED_OUT blocks send).
    - 24-hour window check (within window → free-form, outside → template).
22. Integration tests (Jest):
    - Subscription challenge: correct `hub.verify_token` → challenge echoed; incorrect → rejected.
    - Invalid signature → `401`.
    - Malformed payload → rejected.
    - Duplicate webhook delivery → no duplicate messages or effects.
    - Unknown business (unmapped phone-number-ID) → handled safely.
    - Cross-business conversation access → denied.
    - Human control suppresses AI replies.
    - Prompt injection in inbound customer text → does not override rules.
    - Outbound send failure → maps to `INTEGRATION_FAILURE`, retries idempotently.
    - Audit records written for message receipt and outbound sends.

---

## Verdict

**READY TO IMPLEMENT**

All blocking decisions have been confirmed:
- Credentials and phone mapping → `BusinessSettings.notificationConfig` JSON.
- Media → deferred with placeholder.
- Templates → hardcoded approved names, no UI.
- Conversation `channel` field → adding.
- Customer `consentStatus` → adding.
- `lastInboundAt` on Conversation → adding.
- Message `direction` and `status` fields → adding.
- 7 missing error codes → adding with correct HTTP mappings.

Schema prerequisites (Phase 1) are small, well-defined migrations with no ambiguity. Implementation can proceed through the 5-phase sequence above.
