# Product Requirements Document (PRD)

# AI E-Commerce Customer Support & Sales Automation Platform

**Working Product Name:** OrderAId
**Product Type:** B2B SaaS / AI commerce automation
**Primary Market:** Nigeria
**Initial Customer Segment:** Small and medium-sized social-commerce businesses
**Primary Channels:** WhatsApp, Instagram, website chat
**Document Status:** Product Definition / MVP Planning
**Date:** August 2026

---

# 1. Executive Summary

The product is an AI-powered customer-support and sales automation platform designed specifically for Nigerian e-commerce businesses that sell primarily through WhatsApp, Instagram, websites, and other social channels.

The core problem is simple:

> Nigerian online sellers receive customer enquiries through conversations, but much of the selling process is still handled manually.

A typical customer journey may look like:

**Instagram post → WhatsApp DM → product question → price question → availability question → delivery question → payment → order confirmation → fulfilment**

As order volume increases, merchants can lose sales because they:

- Respond too slowly.
- Miss customer messages.
- Give inconsistent information.
- Forget to follow up.
- Lose orders inside conversations.
- Manually confirm payments.
- Manually answer repetitive questions.
- Fail to update customers about orders.
- Do not have a reliable view of customer activity.

The product will turn these conversations into a structured commerce workflow:

> **Customer enquiry → AI assistance → product discovery → recommendation → order creation → payment → confirmation → fulfilment → follow-up → human escalation when necessary.**

The central product principle is:

> **Automate the repetitive parts of selling without sacrificing accuracy, trust, or human control.**

---

# 2. Product Vision

Build the most useful AI-powered sales and customer-support operating layer for Nigerian social-commerce businesses.

The product should allow a merchant to move from:

> "I have customers messaging me everywhere."

to:

> "My customers can ask questions, discover products, place orders, pay, receive updates, and get human help from one controlled system."

The product should not initially attempt to replace every e-commerce platform.

It should focus on the **conversation-to-order workflow**.

---

# 3. Problem Statement

## 3.1 Merchant Problem

Many social-commerce merchants operate through messaging platforms.

Their workflow may depend on:

- WhatsApp chats
- Instagram DMs
- Spreadsheets
- Notes
- Manual payment confirmation
- Manual delivery calculations
- Manual customer follow-up
- Manually maintained product lists

This creates operational problems.

### Problem 1 — Repetitive enquiries

Customers repeatedly ask:

- How much?
- Is it available?
- What sizes do you have?
- What colours are available?
- Where do you deliver?
- How much is delivery?
- How long does delivery take?
- How do I pay?

These questions consume merchant time.

### Problem 2 — Slow responses

Customers can move to another seller if they do not receive a response quickly.

### Problem 3 — Lost conversations

Important sales opportunities can disappear inside busy WhatsApp or Instagram inboxes.

### Problem 4 — Manual order processing

The merchant may manually copy:

- Customer name
- Phone number
- Product
- Variant
- Quantity
- Location
- Delivery fee
- Total

into another system.

### Problem 5 — Payment uncertainty

The merchant needs a reliable way to determine whether an order is actually paid.

### Problem 6 — Poor follow-up

Customers who show purchase intent may never be contacted again.

### Problem 7 — Lack of operational visibility

The merchant may not know:

- How many enquiries they receive
- How many become orders
- Which products are generating interest
- How many orders are abandoned
- How many conversations require human intervention
- Which customers are returning

---

# 4. Product Opportunity

Nigeria's e-commerce environment is increasingly shaped by social commerce.

Recent market research describes WhatsApp and Instagram as increasingly important sales channels, with Nigerian social-commerce transaction value projected to grow substantially through 2030.

This matters because the product is not trying to force Nigerian merchants into a traditional "website-first" buying model.

Instead, it is designed around the behaviour:

> **Discovery happens on social media. Conversation happens in messaging. Trust is built through interaction. Purchase happens through a guided transaction.**

That creates an opportunity to make the **conversation itself a commerce interface**.

---

# 5. Target Market

## 5.1 Primary ICP — Ideal Customer Profile

The initial ideal customer is a Nigerian small or medium-sized e-commerce merchant who:

- Sells physical products.
- Uses WhatsApp heavily.
- Uses Instagram for product discovery.
- Receives repeated customer enquiries.
- Has a catalogue of products.
- Has enough order volume for manual support to become painful.
- Wants more orders without hiring more customer-support staff.
- Already understands digital payments.
- Is comfortable using a smartphone.
- Wants a simple system rather than enterprise software.

---

# 6. Initial Vertical Focus

The product should initially focus on visually driven consumer categories.

Priority:

1. Fashion
2. Beauty
3. Skincare
4. Accessories
5. Fragrance
6. Lifestyle products
7. Home/lifestyle retail

These categories are attractive because customers commonly ask questions about:

- Product availability
- Price
- Size
- Colour
- Style
- Variants
- Recommendations
- Delivery
- Similar products

The product should not initially attempt to serve every possible business category.

---

# 7. Secondary Users

## Business Owner

Needs:

- Sales visibility
- Order management
- Customer management
- AI automation
- Analytics
- Business configuration

## Customer Support Agent

Needs:

- Conversation inbox
- Customer context
- Order context
- AI handoff
- Ability to take control

## Operations / Fulfilment Staff

Needs:

- Order information
- Payment status
- Delivery status
- Customer information

## End Customer

Needs:

- Fast answers
- Accurate product information
- Product discovery
- Easy ordering
- Payment
- Order confirmation
- Delivery information
- Human assistance when necessary

---

# 8. Jobs To Be Done

## Merchant

> "Help me answer customers quickly without having to personally respond to every repetitive question."

> "Help me turn customer enquiries into completed orders."

> "Help me know which conversations need my attention."

> "Help me stop losing orders inside WhatsApp."

> "Help me recover customers who were ready to buy but did not complete the order."

## Customer

> "Help me quickly find what I want."

> "Tell me the real price and availability."

> "Help me place my order without unnecessary back-and-forth."

> "Tell me what is happening with my order."

> "Let me speak to a human when necessary."

---

# 9. Core Value Proposition

### For merchants

> **Turn customer conversations into organized, automated sales.**

### For customers

> **Get fast, accurate help and complete purchases without unnecessary back-and-forth.**

### Product differentiation

The product should not position itself simply as:

> "AI chatbot."

It should position itself as:

> **AI sales and customer-support infrastructure for Nigerian social commerce.**

---

# 10. Core Product Loop

The central product loop is:

```text
CUSTOMER
   ↓
ENQUIRY
   ↓
AI RESPONSE
   ↓
PRODUCT DISCOVERY
   ↓
PRODUCT RECOMMENDATION
   ↓
ORDER
   ↓
PAYMENT
   ↓
ORDER CONFIRMATION
   ↓
DELIVERY
   ↓
FOLLOW-UP
   ↓
REPEAT PURCHASE
```

Human intervention can enter at any stage.

---

# 11. Core Features

The following are the **core features**.

They should receive the highest priority during development.

---

## 11.1 AI Customer Support

The AI answers customer questions using verified merchant information.

It should handle:

- Product questions
- Price questions
- Availability
- Variants
- Delivery
- Policies
- Payment information
- Order status

### Critical requirement

The AI must not invent information.

If information cannot be verified:

> "I don't have the current information for that. Let me connect you with someone from the team."

---

## 11.2 Communication Channels and Messages

### MVP channel

The MVP ships on the **WhatsApp Business Platform (Cloud API)** first.

Instagram DMs and website chat are follow-on channels, added behind the same channel abstraction.

### Channel abstraction

The platform models all communication channels behind a common interface so that conversations, messages, orders, escalations, and customer profiles behave identically regardless of channel.

Each channel integration must support:

- Inbound message receipt with provider authenticity verification
- Outbound message sending through the approved provider wrapper
- Server-side mapping of channel identity (e.g., WhatsApp phone number) to a customer profile
- Media messages (images, audio, documents) with validated type/size, safe storage, and tenant isolation
- Idempotent message persistence keyed on the provider message ID
- Consent-aware outbound messaging with opt-out support

### Message handling

A conversation is composed of messages.

Each message must support:

- Text and media content
- Channel metadata (provider message ID, timestamps, channel)
- A tenant boundary — never visible outside the owning business
- Audit records for receipt and sending

Provider webhooks must be authenticated, validated, and acknowledged promptly. Duplicate deliveries must never create duplicate messages or effects.

---

# 12. Product Catalogue

Merchants can create and manage products.

Each product may include:

- Name
- Description
- Category
- Brand
- Base price
- Images
- Tags
- Status
- Variants
- Metadata

Products may have variants such as:

- Size
- Colour
- Material
- Style
- Other merchant-defined attributes

---

# 13. Inventory

The system should maintain verified inventory information.

Core capabilities:

- Available quantity
- Reserved quantity
- Low-stock threshold
- Stock status
- Product/variant relationship

The AI must use inventory data when answering availability questions.

Example:

Customer:

> "Do you have size 42?"

System:

```text
Product: Nike Air Max
Variant: Size 42
Available: 2
```

AI:

> "Yes, we currently have 2 available."

---

# 14. AI Product Discovery

Customers should be able to describe what they want naturally.

Example:

> "I need a black dress under ₦100,000."

The AI should:

1. Understand the requirements.
2. Search verified product data.
3. Filter products.
4. Return relevant matches.
5. Allow the customer to select a product.

The AI should not fabricate recommendations.

---

# 15. AI Product Recommendations

The AI can recommend products based on:

- Customer requirements
- Price range
- Product category
- Availability
- Variant
- Merchant-defined attributes
- Previous verified customer preferences where appropriate

Recommendations should be explainable in simple language.

Example:

> "This one matches your budget and is available in black."

---

# 16. Conversational Order Creation

The AI should be capable of guiding a customer through order creation.

Example:

```text
Customer:
"I want the black dress."

AI:
"Sure. What size would you like?"

Customer:
"Medium."

AI:
"Great. Where should we deliver it?"

Customer:
"Ikeja."

AI:
"Delivery to Ikeja is ₦3,500. Your total is ₦88,500."
```

The system then creates the order.

---

# 17. Order Management

Orders should have explicit states.

Primary flow:

```text
DRAFT
↓
AWAITING_PAYMENT
↓
PAID
↓
PROCESSING
↓
READY_FOR_DELIVERY
↓
SHIPPED
↓
DELIVERED
```

Alternative states:

```text
CANCELLED
FAILED
REFUNDED
RETURNED
```

Invalid transitions must be prevented.

Every state change must be an explicit, guarded transition.

### RETURNED

A delivered order that the customer returns (or that must be returned to the merchant) moves to `RETURNED`.

A `RETURNED` order may move to `REFUNDED` only after the refund is confirmed server-side with the payment provider.

Returns must preserve the original order and payment history — never hard-delete a returned or refunded order.

### Abandoned orders

"Abandoned" is **not a separate order state**.

An order that remains in `AWAITING_PAYMENT` beyond a defined window is flagged as abandoned for recovery and analytics purposes while its true stored state remains `AWAITING_PAYMENT`.

The recovery workflow (see §23) resolves it only through server-side payment verification.

---

# 18. Payment

**Flutterwave is the initial and only payment provider in the MVP.**

The payment layer must support:

- Payment initiation
- Payment status
- Successful payment
- Failed payment
- Pending payment
- Refunds
- External transaction IDs
- Payment verification
- Duplicate-event protection

### Critical rule

The AI must never say:

> "Payment received."

unless payment has actually been verified.

### Hard requirements

The following are hard requirements, not optional implementation details:

- Webhook delivery must be authenticated, and the raw webhook body must be preserved for signature verification.
- Webhook processing must be idempotent. Duplicate events must never double-apply effects.
- A webhook payload alone is never sufficient to mark an order paid.
- The provider must be re-queried server-side, and the transaction reference, status, amount, and currency must be matched against the expected payment attempt before any order state change.
- Payment verification and the order state transition must be applied atomically.
- Pending transactions must have a recovery path if webhook delivery fails.
- Value is never granted from a browser redirect, client-side state, or a customer screenshot.
- No payment provider may be replaced or added without an approved requirement change.

---

# 19. Delivery

Merchants can define:

- Delivery zones
- Delivery fees
- Estimated delivery times
- Delivery partners
- Delivery status

The AI should use the merchant's verified delivery configuration.

---

# 20. Human Handoff

This is a **core feature**, not an optional add-on.

Customers must always be able to request human assistance.

The system should automatically recommend or initiate escalation when appropriate.

Examples:

- Refund disputes
- Payment disputes
- Complaints
- Missing orders
- Wrong orders
- Sensitive issues
- Unknown information
- Conflicting business data
- AI uncertainty

Once a human takes control:

> **AI stops responding automatically.**

AI control can only resume when explicitly returned.

---

# 21. Unified Conversation Management

The merchant needs a central view of customer conversations.

Each conversation should show:

- Customer
- Channel
- Messages
- Order information
- Customer history
- AI status
- Human assignment
- Escalation reason
- Conversation status

Primary states:

```text
NEW
ACTIVE
WAITING_FOR_CUSTOMER
WAITING_FOR_HUMAN
ESCALATED
RESOLVED
CLOSED
```

---

# 22. Customer Profiles

A customer profile should show:

- Name
- Phone
- Email where available
- Location
- Order history
- Previous conversations
- Tags
- Preferences
- Consent status
- Customer status

The merchant should be able to understand the customer without searching through old conversations.

---

# 23. Abandoned Order Recovery

The system should identify customers who:

- Started an order
- Added products
- Reached checkout
- Failed to complete payment
- Stopped responding

The merchant can configure appropriate follow-up automation.

The system should track:

```text
Abandoned
↓
Follow-up scheduled
↓
Message sent
↓
Customer responded
↓
Order recovered
```

The system should calculate recovered revenue from actual orders, not estimates presented as facts.

### Relationship to order states

An abandoned order is an order still in `AWAITING_PAYMENT` beyond the configured window. It is flagged as abandoned for recovery and analytics; its stored state is not changed to a separate "abandoned" value.

Recovery always re-verifies payment server-side before any state change, exactly like a webhook. A late webhook and a recovery run resolving the same attempt must not both apply effects.

---

# 24. Automated Follow-Up

Merchants should eventually be able to configure workflows such as:

### Order confirmation

Order created → send confirmation.

### Payment confirmation

Payment verified → notify customer.

### Delivery update

Order shipped → notify customer.

### Abandoned order

Order abandoned → follow up.

### Post-purchase

Order delivered → follow up.

### Re-engagement

Eligible customer → send merchant-approved campaign.

All automated communication must respect applicable platform rules and customer consent requirements.

---

# 25. Business Dashboard

The dashboard is the merchant's operating centre.

The initial dashboard should surface:

```text
Today's sales
Today's orders
New conversations
Pending escalations
Pending orders
Payment issues
Low-stock products
Recovered orders
```

It should not become a generic analytics dashboard.

The most important question should be:

> **"What needs my attention right now?"**

---

# 26. Analytics

Core metrics:

- Conversations
- AI-resolved conversations
- Human escalations
- Orders created
- Orders completed
- Payment success rate
- Abandoned orders
- Recovered orders
- Recovered revenue
- Average order value
- Product enquiries
- Repeat customers

Analytics must be based on real recorded events.

---

# 27. Knowledge System

The AI should have access to verified business knowledge.

Sources may include:

- Products
- Inventory
- Delivery settings
- Business policies
- FAQs
- Payment information
- Merchant-provided knowledge

The AI should prioritize current verified information.

If information conflicts:

> Do not guess.

The system should flag the conflict or escalate.

---

# 28. AI Guardrails

The following rules are fundamental.

The AI must never invent:

- Prices
- Stock
- Product specifications
- Delivery fees
- Delivery times
- Payment status
- Order status
- Discounts
- Refund status
- Business policies
- Customer information
- Revenue
- Analytics

The system should prioritize:

> **Accuracy > reliability > simplicity > automation > additional features**

---

# 29. User Roles

The platform should support:

### Business Owner

Full business control.

### Manager / Staff

Controlled access based on permissions.

### Customer Support Agent

Conversation and customer-support access.

### Customer

Access to their own customer journey.

---

# 30. Multi-Tenant Architecture

The product should be capable of serving multiple businesses.

Each business must have isolated:

- Products
- Inventory
- Customers
- Conversations
- Orders
- Payments
- Analytics
- AI knowledge
- Automations
- Staff

A merchant must never be able to access another merchant's data.

---

# 31. Core Data Model

The conceptual schema includes:

```text
Business
User
BusinessMembership
BusinessSettings

Product
ProductVariant
Inventory

Customer
CustomerChannelIdentity

Conversation
Message
KnowledgeSource
Escalation

Order
OrderItem
Payment
Delivery
DeliveryZone

Automation
AutomationExecution

Notification
AuditLog
AnalyticsEvent
```

The relationships between these entities must remain consistent.

---

# 32. Security and Privacy

The application handles customer and business information.

It must protect:

- Personal information
- Authentication credentials
- Payment secrets
- API credentials
- Business information
- Customer conversation history

Authorization must be enforced at the application level.

Do not rely only on frontend visibility controls.

## 32.1 Data Protection, Consent and Compliance

The platform must comply with the Nigeria Data Protection Act 2023 and its implementing regulations (including the NDPR).

Requirements:

- Obtain and record customer consent before storing personal data or sending automated messages.
- Respect customer opt-outs across all automated communication channels.
- Provide a clear path for customers and merchants to request access to, correction of, or deletion of their personal data.
- Enforce a defined data-retention policy and purge personal data past its retention period.
- Treat conversation history and contact details as sensitive customer data.
- Never log raw message bodies, media content, or unnecessary personal data.
- Never expose customer data across tenant boundaries.

---

# 33. Market Intelligence

## 33.1 Market Direction

The Nigerian e-commerce market is increasingly influenced by social commerce.

Research published in 2026 describes WhatsApp and Instagram as important commerce channels and projects Nigerian social-commerce transaction value to rise from approximately **$2.04 billion in 2025 to $3.96 billion in 2030**.

> **Validation note:** These figures are uncited estimates. They must not be used in external materials (investor decks, marketing, or pricing) until traced to a verifiable published source and confirmed current.

This supports the strategic decision to build around **conversation-led commerce** rather than assuming every merchant starts with a sophisticated standalone online store.

---

## 33.2 Why WhatsApp Matters

WhatsApp is particularly important because it can function simultaneously as:

- Customer-support channel
- Sales channel
- Product discovery channel
- Order-taking channel
- Customer relationship channel
- Notification channel

This creates an opportunity to make the messaging conversation itself part of the commerce infrastructure.

However, this also means the product is dependent on third-party platform policies, APIs, pricing, availability, and approval processes.

This dependency must be treated as a strategic risk.

---

## 33.3 Nigerian Market Characteristics

The product should be designed around realities including:

- Mobile-first business operations
- Social-media-led discovery
- WhatsApp-heavy customer communication
- Naira transactions
- Local delivery complexity
- Trust concerns
- Small business resource constraints
- Need for simple interfaces
- Manual operations at early business stages
- Multi-language customer base (English, Nigerian Pidgin, Yoruba, Hausa, Igbo, and others)
- Variable data connectivity and bandwidth
- Amount formatting expectations (Naira, with kobo)

The product should not assume that the Nigerian merchant workflow is identical to a US or European Shopify merchant.

### Localization

- The merchant UI should default to simple, plain English with a path to localized languages.
- The AI should handle the languages customers actually use in conversations, without inventing facts in any language.
- All monetary values are shown in Naira, formatted for Nigerian users, while stored precisely in kobo.
- Interfaces should be low-bandwidth-friendly and usable on mid-range smartphones.

---

## 33.4 WhatsApp Business API Feasibility and Cost

WhatsApp is the MVP's primary channel, so its platform requirements directly shape the product.

### Access and approval

- WhatsApp Business Cloud API access requires a Meta Business portfolio, an approved Business Verification, and a WhatsApp Business Account.
- Business verification can take time and may require documentation. This must be planned into merchant onboarding.
- Access can be revoked or restricted by Meta at any time. Treat continued access as an operational risk with monitoring.

### Pricing model

- Meta prices messaging per conversation (24-hour windows), with different rates for service and marketing templates, and by country.
- AI-assisted conversations consume these windows and carry per-conversation costs.
- The cost per conversation must be modeled against expected order value before the "AI conversation allowance" pricing hypothesis is used. A conversation that repeatedly ends in escalation still costs the same as one that produces an order.
- Template messages (outbound follow-ups, abandoned-order recovery, delivery updates) are billed as business-initiated conversations and are subject to Meta template approval and content policy.

### Product implications

- The MVP must track which conversation windows and template categories are in use so per-order unit economics stay visible.
- Outbound automation volume should default to conservative settings that merchants can raise only after seeing costs.
- A fallback channel (e.g., website chat or Instagram DM) must be supported behind the channel abstraction so the business is not stranded if WhatsApp access is interrupted.

---

# 34. Competitive Landscape

There are currently several categories of competitors.

The most important distinction is:

### Category A — Nigerian commerce operating systems

Examples:

- Myshoplet
- Paystack Commerce
- Bumpa

### Category B — WhatsApp / conversational commerce platforms

Examples:

- Wati
- respond.io
- Interakt
- Trengo
- SleekFlow

### Category C — General e-commerce platforms

Examples:

- Shopify
- WooCommerce
- Selar

### Category D — Other listed platforms

- **Trengo** — omnichannel shared inbox and messaging automation; broad and horizontal, not built around Nigerian small-merchant commerce.
- **SleekFlow** — conversational CRM and social commerce (WhatsApp, Instagram, catalogues); strong in Asian markets, not Nigeria-first.
- **Shopify** — leading standalone store platform with a large ecosystem; store-first rather than conversation-first, and costly/complex for the target segment.
- **WooCommerce** — storefront plugin for WordPress; requires technical setup and a separate store, not conversation-led.
- **Selar** — Nigerian platform strong for digital and creator sales; weaker for conversation-led physical-product ordering.

These are monitored rather than treated as primary comparables for the MVP.

The product sits at the intersection of:

> **Commerce infrastructure + AI customer support + conversational sales automation.**

---

# 35. Competitor Analysis

## 35.1 Myshoplet

**Threat level: VERY HIGH**

Myshoplet is the closest visible competitor to this product concept.

Its current offering includes:

- WhatsApp selling
- Online storefront
- AI Sales Agent
- Product catalogue
- Order management
- Inventory
- Payments
- Delivery
- Analytics
- Marketing
- POS
- CRM
- Team management

Its AI Sales Agent can answer product questions and create orders through WhatsApp.

### Strategic implication

We cannot position the product simply as:

> "An AI WhatsApp sales agent for Nigerian businesses."

That positioning is already occupied.

### Potential differentiation

The product should instead compete on:

- Superior AI accuracy
- Better customer-support workflows
- Better human handoff
- Better conversation intelligence
- Better automation reliability
- Better merchant control
- Better UX
- Better integrations
- Better support for businesses that already have their own store rather than forcing them into another commerce platform

---

# 36. Paystack Commerce

Paystack Commerce provides Nigerian/African sellers with storefronts, product variants, delivery details, WhatsApp customer chat, orders, inventory and related commerce functionality.

### Strengths

- Strong Nigerian payment ecosystem
- Commerce infrastructure
- Storefront
- Orders
- Inventory
- WhatsApp connection
- Strong trust/brand recognition

### Weakness

Its primary value proposition is broader commerce infrastructure rather than an AI-first customer-support operating layer.

### Opportunity

Do not compete directly with Paystack on payments.

Instead:

> **Use payment infrastructure as an underlying capability while owning the conversation-to-order experience.**

---

# 37. Wati

Wati is a major conversational commerce competitor.

Its e-commerce offering includes:

- WhatsApp catalogues
- Automated support
- Order confirmation
- Billing updates
- Product promotions
- Abandoned-cart recovery
- WhatsApp automation
- Integrations with e-commerce platforms

Wati also provides shared inbox, CRM, AI agents, segmentation, campaigns, and multi-channel capabilities.

### Strengths

- Mature WhatsApp ecosystem
- Strong automation
- Broad integrations
- Shared inbox
- CRM
- AI
- Marketing automation

### Weakness

It is a broad horizontal platform rather than a product designed specifically around the Nigerian merchant workflow.

### Opportunity

Win through:

- Nigeria-first UX
- Simpler setup
- Local business workflows
- Local commerce assumptions
- Stronger integration with Nigerian payments/delivery
- Vertical-specific experiences

---

# 38. Respond.io

Respond.io is positioned around customer conversations for mid-market B2C companies.

Its capabilities include:

- Omnichannel inbox
- WhatsApp
- Instagram
- Facebook Messenger
- TikTok
- CRM integration
- AI agents
- Lead qualification
- Product recommendations
- Routing
- Sales automation

### Strengths

- Strong omnichannel architecture
- Advanced AI agents
- Mature conversation management
- CRM integrations
- Enterprise capabilities

### Weakness

It is not primarily designed around the specific operational realities of small Nigerian social-commerce merchants.

### Opportunity

Compete on:

> **Local depth + simplicity + commerce-specific workflows.**

---

# 39. Haptik

Haptik focuses on AI-powered customer care and WhatsApp-based customer service.

Its use cases include:

- Order tracking
- FAQs
- Payment issues
- Post-sales support
- Customer self-service
- Human escalation

### Strength

Strong enterprise customer-support automation.

### Weakness

Less focused on the complete small-merchant conversation-to-order workflow.

### Opportunity

Target the underserved SME segment with a simpler commerce-first product.

---

# 40. Competitive Positioning

The product should **not** position itself as:

> "Another WhatsApp chatbot."

It should position itself as:

> **The AI sales and customer-support operating system for Nigerian social-commerce businesses.**

The difference is important.

A chatbot answers questions.

This product should:

```text
UNDERSTAND
     ↓
RECOMMEND
     ↓
SELL
     ↓
CREATE ORDER
     ↓
VERIFY PAYMENT
     ↓
TRACK FULFILMENT
     ↓
FOLLOW UP
     ↓
ESCALATE
     ↓
LEARN FROM REAL BUSINESS DATA
```

---

# 41. Competitive Differentiation Strategy

The strongest defensible combination should be:

### 1. Nigeria-first

Built around Nigerian commerce workflows.

### 2. Commerce-aware AI

The AI understands:

- Products
- Inventory
- Orders
- Payments
- Delivery
- Customers

It is not merely a general-purpose conversational bot.

### 3. Accuracy-first

The system is explicitly designed not to hallucinate business facts.

### 4. Human-in-the-loop

AI and human agents work together rather than treating humans as a failure state.

### 5. Conversation-to-order

The central unit is not simply the "chat."

It is:

> **conversation → commercial outcome**

### 6. Merchant-controlled automation

The merchant controls important workflows.

### 7. Simple UX

The product should be understandable by a small-business owner without technical training.

---

# 42. Product Moat

The long-term moat should not be:

> "We use AI."

AI models are increasingly commoditized.

The moat should instead come from:

### Business workflow data

Understanding how conversations become orders.

### Merchant-specific knowledge

Products, inventory, policies, customers, delivery, payments.

### Commerce integrations

Messaging + payment + delivery + order infrastructure.

### Conversation intelligence

Understanding which conversations are:

- Information requests
- High-intent buyers
- Existing customers
- Complaints
- Abandoned orders
- Upsell opportunities

### Operational reliability

Businesses will continue using a system that they trust with money and customer relationships.

---

# 43. MVP

The MVP should be deliberately narrow.

## Required MVP

### Merchant

- Authentication
- Business profile
- Product management
- Product variants
- Inventory
- Delivery settings
- Business policies

### Customer

- AI conversation
- Product discovery
- Product recommendations
- Product questions
- Order creation
- Payment flow
- Order confirmation
- Human handoff

### Merchant Operations

- Conversation inbox
- Customer profiles
- Orders
- Payment status
- Delivery status
- Escalations

### Automation

- Order confirmation
- Payment confirmation
- Basic abandoned-order recovery
- Basic delivery notification

### Analytics

- Conversations
- Orders
- Conversion
- AI resolution
- Escalations
- Recovered orders

## Build Priority

The MVP is sequenced into three tiers.

### P0 — Foundation (must ship first)

- Merchant authentication and business setup
- Product catalogue and variants
- Inventory
- Delivery configuration
- Verified business knowledge
- WhatsApp Business API channel connection
- AI customer support grounded in verified data
- Conversational order creation
- Payment flow (Flutterwave)
- Server-side payment verification and the order `PAID` transition
- Human handoff
- Conversation inbox

### P1 — Operations (ship as soon as P0 is stable)

- Customer profiles
- Order management and fulfilment states
- Escalations
- Order confirmation and payment confirmation notifications
- Basic abandoned-order recovery
- Analytics (conversations, orders, conversion, escalations)

### P2 — Follow-on (only after real merchant usage)

- Basic delivery notifications
- Advanced abandoned-order recovery controls
- Recovered-order analytics
- Business dashboard refinements

No P1/P2 feature may block a P0 feature from shipping.

---

# 44. Explicitly Out of MVP

Do not initially build:

- Full accounting
- Payroll
- HR
- Complex ERP
- Marketplace functionality
- Advanced POS
- Sophisticated loyalty system
- Complex advertising platform
- Full email marketing suite
- Advanced financial reporting
- Multi-country expansion
- Extensive AI content-generation tools

These may become future opportunities but should not distract from the core product.

---

# 45. Primary User Journey

## Merchant onboarding

```text
Create account
↓
Create business
↓
Add products
↓
Add inventory
↓
Configure delivery
↓
Configure business policies
↓
Connect communication channel
↓
Activate AI
```

---

# 46. Primary Customer Journey

```text
Customer sends message
↓
AI identifies intent
↓
AI checks verified business data
↓
AI answers / recommends
↓
Customer selects product
↓
AI collects order information
↓
System calculates total
↓
Customer pays
↓
Payment verified
↓
Order confirmed
↓
Merchant receives order
↓
Delivery begins
↓
Customer receives updates
```

---

# 47. Human Escalation Journey

```text
Customer conversation
↓
AI cannot safely answer
OR
customer requests human
↓
Escalation created
↓
Agent notified
↓
Agent takes control
↓
AI stops responding
↓
Agent resolves issue
↓
Conversation resolved
```

---

# 48. Abandoned Order Journey

```text
Customer starts order
↓
Order created
↓
Payment not completed
↓
Order becomes abandoned
↓
Automation eligibility checked
↓
Follow-up scheduled
↓
Customer receives approved message
↓
Customer returns
↓
Payment completed
↓
Order recovered
```

---

# 49. Non-Functional Requirements

The product must prioritize:

## Reliability

The system must not falsely report successful transactions.

## Accuracy

Business data must be authoritative.

## Security

Customer and merchant data must be protected.

## Performance

Customer interactions should feel responsive.

## Resilience

External integration failures should not corrupt business data.

## Auditability

Important actions should be traceable.

## Scalability

The architecture should support additional businesses without cross-business data leakage.

## Maintainability

Business logic should remain modular.

---

# 50. Critical Failure Scenarios

The product must handle:

### AI does not know the answer

→ Human escalation.

### Inventory unavailable

→ Do not recommend as available.

### Payment fails

→ Keep order/payment state accurate.

### Payment webhook repeats

→ Do not duplicate payment/order processing.

### Delivery integration fails

→ Do not fabricate delivery status.

### Customer gives ambiguous information

→ Ask clarification.

### Business data conflicts

→ Do not guess.

### Human takes over

→ AI stops automatic responses.

### External service unavailable

→ Explain failure and provide a safe next step.

---

# 51. Success Metrics

The initial product should measure:

## Activation

- Percentage of merchants who complete onboarding
- Time to first product added
- Time to first connected channel
- Time to first AI conversation

## Engagement

- Conversations per merchant
- AI interactions
- Human escalations
- Active merchants

## Commerce

- Orders created
- Orders completed
- Conversation-to-order conversion
- Payment success rate
- Average order value
- Recovered orders
- Recovered revenue

## AI

- AI resolution rate
- Human escalation rate
- AI-to-order conversion
- Incorrect-response rate
- Knowledge-gap rate

## Retention

- Monthly active merchants
- Merchant retention
- Merchant churn
- Repeat usage

## Operational Definitions

Each metric must be computed identically by product and engineering. These definitions are authoritative.

### Conversation

A threaded message exchange between one customer and one business on one channel, opened by an inbound message and closed when the conversation reaches `RESOLVED` or `CLOSED`.

### Conversation-to-order conversion rate

Distinct conversations that produced at least one order, divided by total conversations in the period.

### AI resolution rate

Conversations resolved (`RESOLVED`/`CLOSED`) without human assignment or control, divided by total resolved conversations in the period.

### Human escalation rate

Conversations escalated to a human, divided by total conversations in the period.

### AI-to-order conversion

Orders whose creation began in an AI-handled conversation, divided by AI-handled conversations in the period.

### Incorrect-response rate

AI responses flagged or corrected (by human override or customer correction), divided by total AI responses in the period. This requires a lightweight flag/review mechanism.

### Knowledge-gap rate

AI responses that ended in "information unavailable → escalate," divided by total AI responses in the period.

### Payment success rate

Orders reaching `PAID`, divided by payment attempts initiated in the period.

### Average order value

Sum of verified order totals, divided by the number of orders in the period.

### Abandoned order

An order flagged as abandoned per §17 (an `AWAITING_PAYMENT` order past the configured window).

### Recovered order

An order flagged as abandoned that later reaches `PAID` after recovery action.

### Recovered revenue

Sum of the total amounts of recovered orders in the period. Actual verified orders only — never estimates.

### Repeat customer

A customer with more than one completed order in the period.

---

# 52. North Star Metric

The primary North Star Metric should be:

> **Verified revenue generated or recovered through AI-assisted customer conversations per active merchant.**

This is better than simply measuring:

> "Number of AI conversations."

A thousand conversations that produce no business value are less useful than 100 conversations that generate real orders.

Supporting metric:

> **Conversation-to-order conversion rate.**

---

# 53. Product Principles

## Principle 1 — Never fabricate business facts

Accuracy is more important than sounding helpful.

## Principle 2 — AI should act, not merely chat

The AI should help move the customer toward a legitimate commercial outcome.

## Principle 3 — Humans remain in control

AI should know when to stop.

## Principle 4 — Business data is the source of truth

Products, inventory, payment, orders, and delivery must come from verified systems.

## Principle 5 — Simplicity wins

The merchant should not need technical expertise.

## Principle 6 — Build around the Nigerian workflow

Do not simply copy a Western e-commerce SaaS model.

## Principle 7 — Every feature must justify itself

If it does not improve:

- Customer support
- Sales
- Order management
- Payment
- Delivery
- Customer retention
- Automation

it probably does not belong in the MVP.

---

# 54. Strategic Risks

## Risk 1 — Direct competition

The biggest immediate strategic concern is that competitors such as Myshoplet already combine Nigerian commerce, WhatsApp, AI sales, orders, inventory, payments, delivery and analytics.

**Response:**

Do not compete on feature count.

Compete on a sharper experience and a clearly defined customer problem.

---

## Risk 2 — Platform dependency

WhatsApp and other social platforms control important APIs, policies, pricing and access.

**Response:**

Build integration abstractions and avoid making the entire business dependent on one channel.

---

## Risk 3 — AI hallucination

An incorrect price or payment statement can directly damage a merchant's business.

**Response:**

Verified-data architecture + strict action verification + human escalation.

---

## Risk 4 — Feature creep

The product could become a giant commerce platform before finding product-market fit.

**Response:**

Keep the MVP centred on:

> **Conversation → Product → Order → Payment → Human support.**

---

## Risk 5 — Merchant onboarding friction

Small merchants may not want complicated setup.

**Response:**

The onboarding experience should be extremely simple.

The merchant should be able to reach:

> **First product → connected channel → first AI conversation**

as quickly as possible.

---

# 55. Go-To-Market Hypothesis

The initial sales proposition should not be:

> "We have AI."

Instead:

> **"Stop losing customers in WhatsApp and Instagram messages. Let your AI assistant answer questions, recommend products, take orders and hand difficult customers to you."**

For early customers, a service-assisted onboarding model may be more effective than pure self-service.

The founder/developer can initially:

1. Find a merchant.
2. Import/configure products.
3. Configure business policies.
4. Connect their channel.
5. Activate the AI.
6. Monitor conversations.
7. Demonstrate recovered/created orders.
8. Convert the merchant into a recurring customer.

This also provides real-world data for improving the product.

---

# 56. Pricing Hypothesis

Pricing should eventually be based on the value created rather than merely the number of AI messages.

Potential pricing dimensions:

- Monthly subscription
- AI conversation allowance
- Number of products
- Number of orders
- Number of connected channels
- Team members
- Automation volume

A hybrid subscription + usage model may eventually be appropriate.

Do not finalize pricing before testing willingness to pay with real merchants.

---

# 57. Future Product Expansion

Only after the core product demonstrates traction should the product consider:

- More social channels
- Advanced CRM
- Advanced marketing
- Loyalty
- More delivery integrations
- Advanced analytics
- Voice support
- Multilingual AI
- AI-assisted merchandising
- Customer segmentation
- Predictive customer retention
- Advanced campaign automation
- Multi-location businesses
- International markets

These are **future opportunities, not MVP requirements.**

---

# 58. Definition of Done for MVP

The MVP is ready for real merchant testing when a merchant can successfully complete this entire flow:

```text
Merchant creates account
        ↓
Adds product
        ↓
Adds price + inventory
        ↓
Configures delivery
        ↓
Connects customer channel
        ↓
Customer asks question
        ↓
AI answers from verified data
        ↓
Customer requests product
        ↓
AI recommends available product
        ↓
Customer selects product
        ↓
AI collects order details
        ↓
System creates order
        ↓
Customer initiates payment
        ↓
Payment is verified
        ↓
Order becomes PAID
        ↓
Merchant sees order
        ↓
Customer receives confirmation
        ↓
Human can take over conversation
        ↓
Order can proceed through fulfilment
```

No part of this journey should depend on the AI guessing.

---

# 59. Final Product Definition

The product is **not fundamentally a chatbot**.

It is not fundamentally an online store.

It is not fundamentally a CRM.

It is not fundamentally a payment application.

It is:

> **A conversation-led commerce operating layer that helps Nigerian e-commerce businesses turn customer conversations into verified orders while keeping humans in control.**

The product's central loop is:

# **Conversation → Intelligence → Product → Order → Payment → Fulfilment → Retention**

Everything in the MVP should strengthen this loop.

If a feature does not strengthen this loop, it should be treated as secondary.
