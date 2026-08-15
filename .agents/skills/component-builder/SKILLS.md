# Component Builder

Build UI components for OrderAId that follow the design system and the design tokens. Before building any component, read `.agents/rules/design-system.md` and `.agents/rules/code-style.md`.

## Process

1. Check `components/` for an existing component that already solves the problem. Reuse before building.
2. Reuse primitives from `components/ui/` (Button, Input, Card, etc.) before creating new ones; build feature components on top of them.
3. Confirm the component fits the design-system rules (flat, simple, warm, secondary-school reading level).
4. Style only with CSS Modules and design tokens from `tokens/design-tokens.css`. Never use Tailwind, styled-components, CSS-in-JS, or raw hex values.
5. Verify the component in light, dark, and contrast variants before finishing.

## Component Conventions

- One primary component per file, exported as the default export.
- Name files `PascalCase.tsx` and name the component the same as the file (e.g., `ProductCard.tsx` exports `ProductCard`).
- Type props as `type Props = { ... }` and destructure them.
- Use function components only; never classes.
- Add `"use client"` only where interactivity is required. Fetch data on the server and pass it down as props where possible.
- Name handlers after the event: `handleSubmit`, `handleAddToCart`.
- Follow the naming and TypeScript rules in `code-style.md` (no `any`, literal unions, etc.).

## Token Usage

- Import tokens from the global stylesheet once; do not re-import `design-tokens.css` in individual components.
- Use `var(--color-{role})` for every colour. Examples:
  - `--color-primary`, `--color-on-primary`
  - `--color-surface`, `--color-on-surface`
  - `--color-surface-container`, `--color-on-surface-container`
  - `--color-outline`, `--color-outline-variant`
  - `--color-error`, `--color-error-container`
- Use `var(--type-dr-{scale}-{property})` for typography. Combine font-size, line-height, font-weight, letter-spacing, and font-family from the same scale.
- Do not hardcode fonts, font sizes, line heights, letter spacing, or colours.
- Do not use raw hex values, RGB, or Material primitive palette colours.
- Do not edit `tokens/design-tokens.css`; it is auto-generated.

## Status and State Colours

- Failed / error: `--color-error` family.
- Successful: `--color-primary`.
- Pending / neutral: `--color-surface-variant` and `--color-outline`.
- Refunded: `--color-secondary`.
- Do not invent a success or warning colour. The token set defines no warning role; surface the gap to the developer instead.

## Themes

- Components must render correctly in all six schemes defined by the tokens (light, dark, medium/high contrast).
- Never use a colour value that only works in light mode.
- Do not toggle `data-theme` or `data-contrast` inside a component; read them from the document root.

## State Communication

- Never communicate payment, order, inventory, or escalation status with colour alone. Always include a readable label.
- Status indicators must distinguish: available, low stock, out of stock; and pending, successful, failed, refunded.

## UI States

Every major page or surface must handle:

- Loading
- Empty
- Error
- Unauthorized
- Not found
- Pending

Error messages must explain what happened and what the user can do next, in plain English. Never expose stack traces, secrets, or internal details. Follow `error-handling.md` for safe user-facing errors.

## Forms

- Use plain labels.
- Explain required information.
- Validate near the relevant field; server validation remains authoritative.
- Preserve user input where safe.
- Avoid unnecessary fields.

## Dashboard and Conversation UI

- The dashboard must answer "What needs my attention right now?" — surface pending escalations, pending orders, payment issues, new conversations, and low stock before vanity metrics.
- Conversation UI must show customer, channel, conversation status, AI/human control state, order context, and escalation reason where applicable.
- Human takeover must be visually obvious; never use colour alone to communicate control state.

## Accessibility

- Maintain accessible contrast in every scheme.
- Use keyboard usability, meaningful labels, sensible focus states, and semantic structure.
- Do not use colour as the only indicator of critical state.

## Verification

- Preview the component in light and dark mode before finishing.
- Verify it responds correctly to `data-contrast` on the root element.
- Confirm no hardcoded colours or fonts remain in the CSS Module.
- Run the project lint and typecheck before declaring the component complete.
