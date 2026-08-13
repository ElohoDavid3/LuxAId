# DB Migration Runner

Apply and manage Prisma schema changes for LuxAId. All database schema changes must go through this workflow and Prisma. Never alter the database schema by hand.

Read `.agents/rules/database.md` (schema conventions, money handling, auditability) before touching the schema. Read `.agents/rules/architecture.md` (state machines) for any change touching orders, payments, or other stateful models.

## Workflow

1. **Understand the change.** Identify the PRD requirement and the business entities involved. Confirm tenant boundaries for any new tenant-owned model.
2. **Edit the schema.** Update `prisma/schema.prisma` only. Follow the existing model conventions and naming in `AGENTS.md` and the schema conventions in `.agents/rules/database.md`. Run `npx prisma format` after editing.
3. **Check for drift.** Run `npx prisma migrate status`. If the database has drifted from the migration history, resolve the drift before creating a new migration; do not let `migrate dev` act on it silently.
4. **Review the generated SQL before applying anything.** Generate the migration without applying it:

   ```sh
   npx prisma migrate dev --create-only --name <short-descriptive-name>
   ```

   Inspect the generated SQL in `prisma/migrations/`. Confirm no active production column is dropped and no existing data is lost. Do not use `npx prisma diff` for this review; `--create-only` is the correct mechanism.

5. **Apply the migration in development:**

   ```sh
   npx prisma migrate dev
   ```

   Prisma applies the reviewed migration to the local database and regenerates the client. If the schema has drifted further, resolve the drift and rerun; never apply partial migrations manually.

6. **Test.** Run the project tests and confirm the schema change works against local data.
7. **Deploy the migration in production.** Confirm `npx prisma migrate status` is clean, verify a production backup exists (or the hosting provider's backup is current), and run:

   ```sh
   npx prisma migrate deploy
   ```

   Do not use `migrate dev` against production. Prefer running the deploy against a staging environment first when one exists.

## Multi-Tenancy Rules

- Every new tenant-owned entity must include a `tenantId` field and a relation to `Tenant`.
- Existing tenant-owned tables must keep the tenant boundary intact.
- Query isolation requires `where: { tenantId }` (or equivalent) in every Prisma query on a tenant-owned model. Ensure any new model is queried with that boundary.
- Add an index on `tenantId` for tenant-owned models used in common lookups.

## Pre-Flight Checklist

- [ ] The change maps to a documented requirement.
- [ ] The generated migration SQL contains no unintended changes.
- [ ] No active production column is dropped.
- [ ] New tenant-owned models include `tenantId` and an index on it.
- [ ] Money columns use `Int` or `BigInt` (kobo), never `Float`.
- [ ] Lookup keys such as transaction/gateway references have unique constraints.
- [ ] Financially significant history uses soft-delete (`deletedAt` or equivalent), never hard-delete.
- [ ] Timestamps are UTC and consistent.
- [ ] The local database is backed up or reset with known state before `migrate dev`.
- [ ] The database shows no schema drift (`npx prisma migrate status`).
- [ ] Foreign keys and required relations match the existing data model.
- [ ] A production backup is confirmed before `migrate deploy`.

## Never Do This

- Do not run `migrate dev` against the production database.
- Do not manually edit the database with raw SQL outside a migration file.
- Do not drop columns that are actively used in production.
- Do not silently change the schema without a review of the generated migration.
- Do not commit a migration without the generated client being regenerated.

## Failure Handling

- If `migrate dev` fails, resolve the schema error first, then rerun it. Do not apply partial migrations manually.
- If a migration fails mid-way in development, use `npx prisma migrate reset` only on a local database, then rerun the workflow.
- In production, never reset the database. Roll forward with a corrected migration.

## Commit Expectations

- Commit `prisma/schema.prisma`, the new migration folder, and the regenerated Prisma client together.
- Write a commit message that names the schema change (e.g., "add refund status to orders").
