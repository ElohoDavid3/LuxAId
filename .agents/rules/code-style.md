# Code Style Rules

> **VERSION** : 1.1
> **UPDATED** : 2026-08-11
> **COMPANION** : `architecture.md` (structure/patterns) · `design-system.md` (tokens) · `security.md` (secrets/payment safety)

Goal: every file reads the same way regardless of author. Consistency > preference.

---

## General

```
- write code that is explicit, readable, and easy to audit
- prefer simple implementations over clever abstractions
- no abstraction without a concrete reuse or domain boundary
```

---

## Formatting and Tooling

```
- enforced by Prettier + ESLint
- run lint + typecheck before finishing any change
- no committing files that fail Prettier/ESLint
- fix the tool config, do not reformat by hand
- never disable a lint rule without justification + developer approval
```

---

## Naming

### Business meaning

```
PREFER:
  paymentAttempt     expectedAmount    transactionReference
  verifiedPayment    orderId           businessId

AVOID (unless scope makes it obvious):
  data   thing   obj   result2
```

### Files and Folders

| Pattern         | Convention               | Example                       |
| --------------- | ------------------------ | ----------------------------- |
| general files   | `kebab-case`             | `payment-verification.ts`     |
| component files | `PascalCase`             | `ProductCard.tsx`             |
| test files      | colocated, `.test.ts`    | `product-validator.test.ts`   |
| route handlers  | `route.ts` in App Router | `src/app/api/orders/route.ts` |

### TypeScript Identifiers

| Scope                                     | Case                   | Example                                        |
| ----------------------------------------- | ---------------------- | ---------------------------------------------- |
| variables / functions / params            | `camelCase`            | `getVerifiedPayment()`                         |
| types / interfaces / classes / components | `PascalCase`           | `PaymentAttempt`                               |
| module-level constants                    | `SCREAMING_SNAKE_CASE` | `MAX_PAGE_SIZE`                                |
| hooks                                     | `use*` prefix          | `useOrders`                                    |
| booleans / predicates                     | read as a question     | `isVerified`, `hasPendingPayment`, `canCancel` |
| collections                               | plural noun            | `payments: Payment[]`                          |

---

## Types and Validation

```
MUST validate at the boundary:
  - request bodies      - webhook payloads
  - query parameters    - AI tool arguments
  - path parameters     - provider responses (before business state)

MUST  use zod, `.strict()` by default (unknown fields rejected).
MUST  NOT assume a TypeScript type proves runtime validity.
```

---

## TypeScript Strictness

```
MUST NOT use `any`                -> use `unknown` + type guards
MUST NOT use non-null `!`         -> narrow or check
SHOULD   avoid `as` casts         -> prefer guards / `satisfies`
MUST     prefer literal unions    -> `"DRAFT" | "AWAITING_PAYMENT" | "PAID"` over `string`
MUST     annotate params + returns -> let inference handle locals
```

---

## Imports

```
ORDER (blank line between groups):
  1. external packages
  2. @/lib
  3. @/features
  4. @/components
  5. relative

MUST  use @/ alias for src/ (no deep relative: ../../../lib/...)
MUST  NOT import from app/ into lib/ | features/ | components/
MUST  remove unused imports
```

---

## React and Components

```
MUST    use function components (no classes)
MUST    type props as `type Props = { ... }` and destructure
MUST    export one primary component per file (default export)
MUST    add "use client" only where interactivity is required
MUST    name handlers after the event: handleSubmit, handleAddToCart
MUST    style with CSS Modules + tokens (never inline styles / CSS-in-JS)
```

```tsx
type Props = { payment: Payment; onCancel: () => void };

export default function PaymentCard({ payment, onCancel }: Props) {
  return (
    <button className={styles.cancel} onClick={onCancel}>
      Cancel
    </button>
  );
}
```

---

## Errors

```
MUST be explicit
MUST preserve useful context for logs
MUST NOT leak secrets or sensitive information
MUST produce safe user-facing messages
MUST distinguish validation | authorization | provider | conflict | internal failures
MUST use the error shape + code taxonomy from architecture.md
MUST NOT silently catch and ignore errors
```

---

## Async and External Calls

```
- use timeouts where supported
- handle non-success responses
- do not blindly retry non-idempotent operations
- use idempotency where effects are financial or business-significant
- never make payment state decisions from unverified client input
```

---

## Payment Code

```
MUST make the verification boundary obvious.
MUST NOT treat a successful redirect as payment verification.
MUST NOT treat a webhook notification as final proof of transaction state.
MUST re-query Flutterwave before confirming an order.
```

---

## Logging

```
MUST NEVER log:
  - secret keys              - webhook secrets
  - authorization headers    - full payment credentials
  - unnecessary customer PII

MUST include safe correlation IDs (internal IDs, provider transaction IDs).
MUST use the structured logger from lib/logger.ts (no console.log/error in server code).
```

---

## Comments

```
MUST comment the REASON for non-obvious business rules, not what code does.
MUST NOT restate syntax.
```

```ts
// Payment must be re-verified because browser redirects are customer-controlled.
```

---

## Environment Variables

```
MUST read env vars only through the validated schema in lib/env.ts.
MUST NOT read process.env directly in feature code.
MUST add new vars to the zod schema in lib/env.ts first.
MUST NOT commit .env files.
```

---

## Tests

### Coverage

```
happy path        invalid input          unauthorized access
duplicate request provider failure       state conflict
missing data      human handoff
```

### Tooling

```
MUST   use Jest (unit + integration) and Playwright (critical E2E).
MUST   colocate test files next to the code they test.
MUST   NOT write snapshot tests for UI components.
MUST   verify idempotency + amount/currency/reference matching in payment/webhook tests.
```
