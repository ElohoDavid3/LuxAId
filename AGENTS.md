# AGENTS.md

## Project

This repository contains the AI-powered customer-support and sales automation product defined by the PRD for Nigerian social-commerce businesses.

The product helps merchants turn customer conversations into verified commerce outcomes:

**Conversation → Intelligence → Product → Order → Payment → Fulfilment → Retention**

The MVP is intentionally focused. Do not expand the product into a general ERP, accounting platform, marketplace, full marketing suite, or generic AI chatbot unless the PRD is explicitly changed.

## Source of Truth

When implementing product behavior, use this order of authority:

1. AGENTS.md and approved project rules in `.agents/rules/`.
2. Relevant skill instructions in `.agents/skills/`.
3. Existing code and established project conventions.
4. External provider documentation for provider-specific behavior.
5. External provider documentation for provider-specific behavior.

If sources conflict, stop and surface the conflict rather than guessing.

## Non-Negotiable Product Principles

- Never invent business facts.
- Verified business data is authoritative for products, inventory, prices, orders, payments, delivery, policies, and analytics.
- Accuracy is more important than sounding helpful.
- AI must know when to stop and hand a conversation to a human.
- When a human takes control of a conversation, automated AI responses must stop until control is explicitly returned.
- Payment success must never be inferred from a browser redirect, client-side state, or unverified webhook payload alone.
- Every payment that can change an order state must be verified server-side with Flutterwave before value is granted.
- Webhook processing must be authenticated, idempotent, auditable, and resilient to retries.
- Do not expose secrets in source code, logs, client bundles, error messages, or generated UI.
- Do not invent prices, stock quantities, delivery fees, discounts, payment status, order status, or policies.
- If required information is missing or ambiguous, ask a concise clarification or escalate.

## Core MVP Capabilities

Prioritize these capabilities:

- Merchant/business setup.
- Product catalogue and variants.
- Inventory.
- Delivery configuration.
- Verified business knowledge.
- AI customer support.
- AI product discovery and recommendation.
- Conversational order creation.
- Flutterwave payment initiation and verification.
- Flutterwave webhook processing.
- Order management and state transitions.
- Customer profiles.
- Conversation inbox.
- Human handoff.
- Abandoned-order recovery.
- Basic automated notifications/follow-up.
- Operational analytics.

## Data Isolation

The application is multi-tenant. Every business-owned record must be associated with the correct business/tenant boundary. Never trust a client-provided tenant identifier without authorization checks.

A merchant must never be able to read or modify another merchant's products, customers, conversations, orders, payments, inventory, analytics, automations, or knowledge.

## Implementation Behavior

Before implementing a feature:

1. Identify the PRD requirement it satisfies.
2. Identify the business entities and state transitions involved.
3. Identify authorization and tenant boundaries.
4. Identify failure and retry behavior.
5. Identify audit requirements.
6. Implement the smallest complete behavior that satisfies the requirement.
7. Add validation and tests for critical paths.

For payment and order logic, prefer explicit state machines and idempotent operations over implicit status changes.

## UI Behavior

The UI should be flat, simple, warm, professional, and easy to understand at a secondary-school reading level. Avoid unnecessary technical language. The primary dashboard should answer: **What needs my attention right now?**

Do not add decorative complexity that interferes with merchant operations.

## AI Behavior

AI responses must be grounded in verified business data. The AI may not fill missing business facts with plausible assumptions.

When information is unavailable, conflicting, stale, or unsafe to infer, the system should either:

- ask for clarification when the customer can provide the missing information; or
- escalate to a human.

AI-generated actions that change business state must go through the same validation and authorization rules as non-AI actions.

## Flutterwave

Flutterwave is the payment provider for this product. Paystack must not be introduced as an alternative payment provider unless a future approved requirement explicitly adds it.

Use the Flutterwave integration skill for provider-specific implementation requirements.

Important provider rules include:

- Verify webhook authenticity.
- Preserve the raw webhook body when the current Flutterwave verification method requires it.
- Return HTTP 200 promptly after accepted webhook receipt.
- Make webhook processing idempotent.
- Re-query Flutterwave to verify critical transaction data before confirming payment.
- Match transaction reference, status, amount, and currency against the expected transaction in the application.
- Keep a recovery path for pending transactions if webhook delivery fails.

## What Not To Do

- Do not choose or introduce a technology stack merely because it is familiar.
- Do not rewrite working architecture without a requirement.
- Do not add unrelated features.
- Do not silently change product requirements.
- Do not weaken security to make a demo work.
- Do not mark an order as paid because a user reached a success page.
- Do not process the same payment event twice.
- Do not log full payment secrets, authorization headers, or unnecessary sensitive customer data.

## Completion Standard

A feature is not complete merely because its happy-path UI works. Critical flows must also handle validation, authorization, failure, retries, duplicate events, auditability, and user-visible error states.

## Technology Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Payment Gateway:** Flutterwave
- **Styling:** CSS Modules + CSS custom properties (design tokens in `tokens/design-tokens.css`, auto-generated; see `.agents/rules/design-system.md`)
- **Auth:** NextAuth.js
- **Email:** SMTP Free Options
- **Hosting:** Vercel

_(Note: AI agents must strictly adhere to this stack and not introduce new frameworks without explicit approval.)_

## Database & Migrations

- All database schema changes must be executed via the `db-migration-runner` skill and managed with Prisma.
- Never manually alter the database schema or drop columns that are actively used in production.
- **Critical Multi-tenant Rule:** Every query to a tenant-owned table MUST include a `where: { businessId }` clause (or equivalent tenant boundary) in Prisma to ensure isolation.

## Testing and Quality Assurance

- **Unit Tests:** Use Jest for testing business logic, utilities, and isolated components.
- **Integration Tests:** Critical paths, particularly webhook handlers and payment state transitions, require integration tests to verify database state.
- **End-to-End (E2E):** Use Playwright for critical UI flows (e.g., merchant onboarding, checkout).

## Error Handling & Logging

- Use structured JSON logging for all system events. Do not log raw HTTP request objects or unredacted payment provider payloads.
- API responses must follow standard HTTP status codes.
- User-facing error messages must be safe, actionable, and never expose stack traces or database schema details.

## Code Style and Architecture

- Enforce formatting and linting via Prettier and ESLint.
- Group logic by feature or domain (e.g., `src/features/orders`) rather than technical concern.
- Extract database queries into repository or service layers to keep API routes and UI components clean.

## Folder Structure

```
orderaid/
├── src/
│   ├── app/
│   │   ├── api/                   API routes including webhooks (e.g., /api/webhooks/flutterwave)
│   │   ├── (auth)/                Authentication pages (login, signup)
│   │   └── (dashboard)/           Merchant dashboard pages
│   ├── components/                Shared UI components and design system elements
│   ├── features/                  Domain-specific logic, grouped by feature
│   │   ├── auth/                  Authentication logic and services
│   │   ├── orders/                Order management, state machines
│   │   ├── payments/              Flutterwave integrations, payment verification
│   │   ├── products/              Product catalogue and inventory logic
│   │   └── customers/             Customer profiles and conversation history
│   ├── lib/                       Shared utilities (e.g., Prisma client, logger, NextAuth config)
│   └── styles/                    Global CSS (imports ../../tokens/design-tokens.css)
├── prisma/
│   ├── schema.prisma              Database schema and models
│   └── migrations/                Database migration scripts
├── public/                        Static assets
└── .agents/                       AI agent customizations (rules, skills)
```

## Core Data Models

`Business` is the canonical domain entity and the root tenant. "Tenant" refers to the architectural multi-tenancy isolation concept; the tenant-boundary field on business-owned records is `businessId`. Every business-owned record MUST belong to a Business, and every query to a business-owned table MUST include the `businessId` boundary server-side.

The canonical domain model is the 23-entity list defined authoritatively in `.agents/rules/ecommerce-domain.md` (see also PRD §31):

Business, User, BusinessMembership, BusinessSettings, Product, ProductVariant, Inventory, Customer, CustomerChannelIdentity, Conversation, Message, KnowledgeSource, Escalation, Order, OrderItem, PaymentAttempt, Delivery, DeliveryZone, Automation, AutomationExecution, Notification, AuditLog, AnalyticsEvent

`InventoryMovement` is an approved, rule-supported domain extension for auditable inventory change history (see `.agents/rules/ecommerce-domain.md`).

Reference models:

### Business

```
id              String    @id @default(cuid())
name            String
createdAt       DateTime  @default(now())
memberships     BusinessMembership[]
settings        BusinessSettings?
products        Product[]
customers       Customer[]
orders          Order[]
```

### User

```
id              String    @id @default(cuid())
name            String
email           String    @unique
passwordHash    String
createdAt       DateTime  @default(now())
memberships     BusinessMembership[]
```

### Product

```
id              String    @id @default(cuid())
businessId      String
name            String
description     String
price           Int
status          String    // DRAFT | ACTIVE | ARCHIVED
createdAt       DateTime  @default(now())
business        Business  @relation(...)
variants        ProductVariant[]
```

### ProductVariant

```
id              String    @id @default(cuid())
productId       String
name            String
sku             String
attributes      Json
product         Product   @relation(...)
inventory       Inventory?
```

Inventory quantities are NOT stored on Product or ProductVariant. `Inventory` is the single authoritative inventory source.

### Inventory

```
id              String    @id @default(cuid())
productVariantId String   @unique
available       Int
reserved        Int
location        String?
productVariant  ProductVariant @relation(...)
movements       InventoryMovement[]
```

### InventoryMovement

```
id              String    @id @default(cuid())
inventoryId     String
quantityDelta   Int
reason          String
sourceType      String
sourceId        String
createdAt       DateTime  @default(now())
inventory       Inventory @relation(...)
```

### Customer

```
id              String    @id @default(cuid())
businessId      String
name            String
email           String?
phone           String?
location        String?
business        Business  @relation(...)
channelIdentities CustomerChannelIdentity[]
conversations   Conversation[]
orders          Order[]
```

### Conversation

```
id              String    @id @default(cuid())
customerId      String
status          String
controlState    String
createdAt       DateTime  @default(now())
customer        Customer  @relation(...)
messages        Message[]
escalations     Escalation[]
```

### Order

```
id              String    @id @default(cuid())
businessId      String
customerId      String
status          String
totalAmount     Int
createdAt       DateTime  @default(now())
business        Business  @relation(...)
customer        Customer  @relation(...)
items           OrderItem[]
paymentAttempts PaymentAttempt[]
delivery        Delivery?
```

### PaymentAttempt

```
id              String    @id @default(cuid())
orderId         String
transactionReference String @unique
gatewayReference String?  @unique
status          String
amount          Int
currency        String
createdAt       DateTime  @default(now())
order           Order     @relation(...)
```

`PaymentAttempt.orderId` is intentionally NOT unique: an Order has a 1:N relationship with PaymentAttempt and a customer may retry payment. Only a successfully verified attempt may transition the order to PAID. Provider verification results (status, amount, currency, reference) are recorded on the attempt for auditability.

Remaining canonical entities (BusinessMembership, BusinessSettings, CustomerChannelIdentity, Message, KnowledgeSource, Escalation, OrderItem, Delivery, DeliveryZone, Automation, AutomationExecution, Notification, AuditLog, AnalyticsEvent) are defined in `.agents/rules/ecommerce-domain.md`.

## Environment Variables

The following environment variables are required to run the application. Do not commit `.env` files to version control.

```env
# Database
DATABASE_URL="postgresql://user:password@host:port/dbname?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret"

# Flutterwave Integration
FLW_PUBLIC_KEY="FLWPUBK_TEST-..."
FLW_SECRET_KEY="FLWSECK_TEST-..."
FLW_SECRET_HASH="your-webhook-secret-hash"

# SMTP / Email (e.g., Resend, SendGrid, or free SMTP)
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="user"
SMTP_PASSWORD="password"
SMTP_FROM="noreply@yourdomain.com"
```
