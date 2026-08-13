# Human Handoff Skill

Move customer conversations safely from AI to a human operator and back. Read `.agents/rules/ai-behaviour.md` (Human Handoff, Human Approval Gate), `.agents/rules/architecture.md` (audit events), `.agents/rules/multi-tenancy.md` (tenant boundary), and `.agents/rules/security.md` (sensitive data) before implementing any handoff code.

## Purpose

Define the safe movement of a customer conversation from AI control to human control, and back. A human taking control is a state change, not a flag: it must be authorized, tenant-scoped, idempotent, guarded, and auditable.

## Escalation Triggers

Escalate for explicit human requests, AI uncertainty, missing/conflicting business data, payment disputes, refund requests requiring human/provider action, complaints requiring judgement, or unsupported/unsafe order problems.

Cross-reference the Human Approval Gate in `ai-behaviour.md`: refunds, cancellations, price changes, and other irreversible or high-impact actions must never be executed by AI without human approval. Refund-driven escalations feed this gate.

## Escalation State Machine

An escalation moves through explicit states with guarded transitions. Model it like order/payment state:

```
OPEN → ASSIGNED → RESOLVED
OPEN → CANCELLED   (customer retracts, or AI can resolve safely and the operator agrees)
ASSIGNED → OPEN    (operator explicitly returns the conversation unassigned)
```

Rules:

- Every transition is triggered through the domain layer, which validates the guard.
- Takeover must be atomic: an `OPEN`/`ASSIGNED` escalation may only be assigned by exactly one operator. Resolve the assignment with a conditional update (e.g., assign where `status = OPEN`), never by last-writer-wins.
- Release is only valid from `ASSIGNED`. Control returns to AI only after an explicit operator release action. A customer retracting an escalation requires an explicit `CANCELLED` transition first.
- Conflicting transitions (e.g., two operators taking control, or a release before takeover) are rejected as a state conflict.

## Lifecycle

AI → escalation decision → create escalation (idempotent) → preserve context → notify/queue human → human takes control (ASSIGNED) → human resolves → human releases control (RESOLVED) → AI resumes.

## Control

- Human control must be explicit and atomic. While a human is in control (`ASSIGNED`), automated AI responses must not be sent.
- While in control, AI business actions must also be suppressed: the AI must not initiate orders, payments, refunds, cancellations, or any state-changing domain operation for that conversation.
- AI resumes only after an explicit operator release (`RESOLVED`). Never resume on a timer or on customer silence.
- Human takeover must be surfaced in the conversation UI with a readable label (never colour alone), per the component-builder skill.

## Context

Provide the human with verified, tenant-scoped business data: customer, conversation, order, payment, product, and escalation information. Rules:

- Only authoritative business data from the domain layer; never chat messages or AI output.
- Only the conversation's own tenant; never another business's records.
- Never include payment credentials, authorization details, or unnecessary sensitive data. Follow `security.md` Sensitive Data rules.
- Include the escalation reason, current order/payment state, and conversation control state.

## Authorization and Tenant Boundary

- Escalations and conversations are tenant-owned records. Every query must include the tenant boundary server-side.
- Only authorized staff of the owning business may view, take over, resolve, or release an escalation.
- Resolve ownership and permission server-side. Never trust client- or AI-provided tenant/customer/conversation IDs.
- A human operator must never see or act on another business's conversations or escalations.

## Idempotency

- Escalation creation must be idempotent. Back it with a unique constraint on an active escalation key per conversation (e.g., one active escalation per conversation per tenant), never a lookup-only check.
- Duplicate escalation attempts must not create duplicate escalations, duplicate notifications, or duplicate audit records.
- Notification and follow-up sends must be idempotent.

## Audit

Record every handoff event as a structured audit record without secrets or unnecessary sensitive data:

- Escalation created (reason, conversation, tenant, actor).
- Takeover (operator, timestamp).
- Release (operator, timestamp).
- Notification failure and recovery.
- AI resume after release.

Human takeover is a required auditable event per `architecture.md`.

## Failure Handling

- If human notification fails, preserve the escalation in `OPEN` and record the failure. Retry with bounded exponential backoff and jitter (see `integrations.md` retry rules).
- Never silently return control to AI when human attention is still required.
- If takeover fails (conflict, unauthorized operator), leave the escalation unchanged and surface a user-visible error.
- Unresolved escalations must not be silently dropped: re-notify or surface them in the dashboard as attention items beyond a defined SLA window.

## Testing

Cover with integration tests (Jest) and E2E where applicable:

- Customer-requested escalation.
- AI-uncertainty escalation.
- Payment/refund dispute escalation.
- Human takeover (happy path).
- Concurrent takeover by two operators (exactly one wins).
- Cross-tenant access denial (operator of business A cannot see business B).
- Unauthorized operator rejected.
- AI replies suppressed while in control.
- AI business actions suppressed while in control.
- Human release; AI resumes only after release.
- Release-before-takeover rejected.
- Duplicate escalation attempt (no duplicate created).
- Notification failure and recovery (escalation preserved, retry succeeds).
- Audit records written for create/takeover/release/failure.
- Customer retraction path (`CANCELLED`) before AI resumes.
