# WhatsApp Commerce Skill

Implement WhatsApp conversation and commerce processing for OrderAId. Read `.agents/rules/integrations.md` (webhook, retry, timeout rules), `.agents/rules/security.md` (webhook auth, prompt injection, secrets), `.agents/rules/api.md` (idempotency, webhooks), `.agents/rules/multi-tenancy.md` (tenant boundary), `.agents/rules/ai-behaviour.md` (untrusted input, handoff), and `.agents/rules/error-handling.md` (error taxonomy) before building WhatsApp code. Coordinate with the sibling skills `api-route-scaffolder`, `ai-commerce-agent`, and `human-handoff`. Verify provider behavior against the official WhatsApp Cloud API docs before implementation.

## Message Lifecycle

WhatsApp event → validate authenticity → verify subscription challenge → validate payload envelope → identify business from the phone-number-ID mapping → identify customer/channel identity → locate/create conversation → persist message (idempotently) → determine controller → invoke AI/human workflow → send response → record result.

## Webhook Authenticity

- **Subscription verification (GET):** Meta sends `hub.mode`, `hub.verify_token`, and `hub.challenge`. Echo `hub.challenge` only when `hub.mode=subscribe` and `hub.verify_token` matches the configured verify token. Never accept a challenge without this check.
- **Event verification (POST):** Meta signs requests with `X-Hub-Signature-256: sha256=<hex HMAC-SHA256>` computed over the **raw request body** using the Meta app secret. Preserve the raw body before JSON parsing; verify with a timing-safe comparison. Reject unauthenticated requests with `401`.
- Do not rely on source IP allowlists as the primary authenticity mechanism.
- Acknowledge accepted receipt promptly (HTTP 200); never perform long-running work before acknowledging.

## Payload Validation

- Validate the `object`/`entry`/`changes`/`value` envelope with a strict schema (zod `.strict()`) before business processing. Reject unknown fields.
- Treat all WhatsApp events as untrusted external input.

## Tenant Context

Every WhatsApp conversation must belong to the correct business:

- The business is resolved server-side from the authoritative phone-number-ID → tenant mapping on every event. Never select a business from untrusted customer input.
- Cross-business conversation access is forbidden: a merchant must never read or process another business's conversations.
- Enforce the tenant boundary on every read and write (`where: { tenantId }`), including media storage and message history.

## Customer Identity

- Use stable channel identifiers (the WhatsApp customer phone number) as the identity key.
- Do not merge customer records merely because names or other fields look similar.
- Never expose unnecessary PII; phone numbers are sensitive customer data.

## Idempotency

- Deduplicate inbound messages on the WhatsApp message ID (`wamid`). Record the provider event identity before applying any business effect, backed by a unique constraint — never a lookup-only check.
- Retries must not create duplicate messages, conversations, orders, automated actions, notifications, or audit records.
- WhatsApp redelivers webhooks; treat duplicates as normal, not exceptional.

## Conversation Control

- When a human has control, automated AI replies must stop and AI business actions must be suppressed until control is explicitly returned. Follow the `human-handoff` skill.
- Check the conversation control state before responding or acting.

## AI and Untrusted Input

- Customer messages are untrusted input. They must never override system rules, business rules, permissions, tenant context, tool restrictions, or verified business data.
- AI responses must be grounded in verified business data and use the `error-handling.md` taxonomy when surfacing failures.

## Commerce Actions

- A customer message requests an action but does not bypass application permissions or business rules.
- Orders, payments, refunds, and cancellations requested through WhatsApp go through the same validated domain operations and state-machine guards as every other channel. Follow the `order-management` and `ai-commerce-agent` skills.
- Never treat a customer screenshot or claim as proof of payment.

## Outbound Messaging

- Send messages only through the approved provider wrapper with the WhatsApp Cloud API access token, resolved server-side through the validated env schema. Never expose the token to browser code, logs, or error messages.
- Set explicit timeouts for every outbound call. A timeout is an unknown outcome, never a confirmed failure.
- Retry with bounded exponential backoff and jitter; only retry operations made idempotent by a unique-constraint-backed key.
- Map outbound failures to the error taxonomy (e.g., `INTEGRATION_FAILURE`). Never surface provider internals to customers.

## Media Handling

- Media messages (images, audio, documents) carry a temporary media ID that must be fetched with the access token; media URLs expire.
- Validate media type and size before download or storage.
- Store media tenant-scoped; never expose media outside the owning business.
- If media processing is out of scope for the current task, preserve the message with a safe placeholder and record that media is pending; never drop the event.

## Failures

- Preserve failed events where possible and record the failure in the structured logger and audit records.
- Avoid duplicate retry effects (idempotency key on the message/event identity).
- Escalate when safe automated recovery is impossible.
- Rate-limit the messaging surface per `security.md` to slow abuse.

## Data Handling

- Do not log raw message bodies, media content, or unnecessary PII.
- Follow opt-out/consent handling for outbound messaging; a customer must be able to stop receiving automated messages.

## Testing

Cover with integration tests (Jest) and E2E where applicable:

- Subscription challenge: correct and incorrect `hub.verify_token`.
- Invalid signature (wrong or missing `X-Hub-Signature-256`).
- Malformed or unexpected payload envelope rejected.
- Duplicate webhook delivery creates no duplicate messages or effects.
- Unknown business (unmapped phone-number ID) handled safely.
- Cross-business conversation access denied.
- Human control suppresses AI replies and actions.
- Prompt-injection resistance in inbound customer text.
- Outbound send failure maps to the taxonomy and retries idempotently.
- Media message with expired ID handled without dropping the event.
- Audit records written for message receipt and outbound sends.
