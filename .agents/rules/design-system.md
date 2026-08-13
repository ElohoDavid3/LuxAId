# Design System Rules

> **VERSION** : 2.0
> **UPDATED** : 2026-08-11
> **COMPANION** : `architecture.md` (structure/patterns) · `code-style.md` (styling guidelines) · `tokens/design-tokens.css` (token source of truth)

---

## Product Character

```
character = [ warm, professional, simple, trustworthy, calm, operational-not-decorative ]
priority  : clarity > visual novelty
users     : merchants acting fast
```

---

## Visual Direction

```
FLAT UI. Avoid:
  - excessive gradients        - decorative 3D
  - heavy glass effects        - unnecessary animation
  - noisy dashboards           - decorative illustrations competing with data
```

---

## Design Tokens

```
SOURCE OF TRUTH : tokens/design-tokens.css
MUST build ALL styling on these tokens.
MUST NOT hardcode colours, fonts, or type metrics in components.
MUST NOT edit tokens/design-tokens.css by hand (auto-generated).
```

### Sources + Regeneration

```
sources:
  - tokens/material-theme.JSON          -> colour roles
  - tokens/design-tokens.tokens.json    -> typography (Inter scale)

regenerate:
  node tokens/convert-tokens.js
```

### Import

```css
@import "../../tokens/design-tokens.css";
```

### Naming

| Token             | Pattern                        | Examples                         |
| ----------------- | ------------------------------ | -------------------------------- |
| colour role       | `--color-{role}`               | `--color-primary`                |
| colour foreground | `--color-on-{role}`            | `--color-on-primary`             |
| typography        | `--type-dr-{scale}-{property}` | `--type-dr-body-large-font-size` |

### Theme and Contrast

| Scheme                | Selector                                      |
| --------------------- | --------------------------------------------- |
| Light (default)       | `:root`                                       |
| Dark                  | `[data-theme="dark"]`                         |
| Light medium contrast | `[data-contrast="medium"]`                    |
| Light high contrast   | `[data-contrast="high"]`                      |
| Dark medium contrast  | `[data-theme="dark"][data-contrast="medium"]` |
| Dark high contrast    | `[data-theme="dark"][data-contrast="high"]`   |

```
MUST render correctly in all six schemes.
MUST NOT use raw hex values that break dark mode or contrast variants.
dark    -> set data-theme="dark" on root
contrast-> set data-contrast="medium" | "high"
```

### Status Colours (provisional)

```
MUST use these mappings until approved token roles exist.
MUST NOT introduce new hex values on your own.

| status      | tokens                                |
|-------------|---------------------------------------|
| error/fail  | --color-error*, -container, -on-error |
| success     | --color-primary (brand green)         |
| pending     | --color-surface-variant, --color-outline |
| refunded    | --color-secondary                     |
| low stock   | NONE (surfaced gap; role added to material-theme.JSON only with approval, then regenerate) |
```

---

## Typography

```
family  : Inter (all 15 scales)
MUST use the token scale semantically:
  display/headline -> page headings
  title            -> section headings, cards
  body             -> reading content
  label            -> buttons, badges, captions

copy    : secondary-school reading level
MUST avoid unnecessary technical terminology in UI.
```

---

## Layout

```
MUST prioritize:
  clear hierarchy        predictable spacing    compact operational tables
  readable conversations obvious primary actions  strong empty states
  clear status indicators
```

---

## Dashboard

```
PRIMARY QUESTION: "What needs my attention right now?"

priority:
  pending escalations     pending orders      payment issues
  new conversations       low-stock products  sales/order summary

MUST NOT bury operational issues beneath vanity metrics.
```

---

## Conversation UI

```
MUST show immediately:
  customer        channel          conversation status
  AI/human control state           order context
  customer history                 escalation reason (where applicable)

human takeover MUST be visually obvious.
```

---

## Commerce UI

```
prices : clearly labelled, correct currency
inventory MUST distinguish: available | low stock | out of stock
payment MUST distinguish:    pending | successful | failed | refunded

MUST use status-colour mappings + readable labels.
MUST NOT use visual styling alone to communicate critical state.
```

---

## Forms

```
MUST:
  use plain labels
  explain required information
  validate near the relevant field
  preserve user input where safe
  avoid unnecessary fields
```

---

## Error and Empty States

```
Every major page MUST have states for:
  loading | empty | error | unauthorized | not found | pending

Error messages MUST explain:
  - what happened
  - what the user can do next
  in plain English.
```

---

## Accessibility

```
MUST maintain: accessible contrast · keyboard usability · meaningful labels · sensible focus · semantic structure.
MUST NOT use colour as the only indicator of payment/order/inventory/escalation status.
```
