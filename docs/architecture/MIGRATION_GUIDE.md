# Database Migration "Golden Rules" (Squash-and-Repair)

## 🚨 Zero-Drift Policy
Our project enforces a strictly synchronized database state. All structural changes MUST be captured in a migration file. Direct mutations to production or staging are forbidden.

## 1. Local Development Workflow
1. Start the local database: `npm run db:start`
2. Iterate on the schema using SQL: `npx supabase db query "..."`
3. Generate updated TypeScript types: `npm run db:gen-types`
4. Verify changes in the app.
5. Once stable, pull the changes into a new migration: `npx supabase db pull <descriptive_name> --local`
6. Verify the migration: `npx supabase migration list --local`

## 2. Pre-Push Safety Audit
Before pushing your changes, you MUST run the local audit script:
```bash
npm run db:audit
```
This script performs:
- **Linting:** Checks for SQL syntax errors and best practices.
- **Type Check:** Ensures `lib/database.types.ts` is up to date.
- **Drift Detection:** Compares your local migrations against the linked production project to ensure you haven't missed any remote changes.

## 3. Squash-and-Repair Protocol
If you encounter migration history drift (e.g., someone else pushed a migration while you were working), follow this protocol:
1. **Fetch remote state:** `npx supabase migration fetch --linked`
2. **Rebase local branch:** Sync your code with `main`.
3. **Repair history:** If the remote migration history is out of sync with your local files, use `npx supabase migration repair --status applied <version>`.
4. **Squash (Optional):** If you have too many small migrations, squash them into a single file BEFORE merging to `main`.

## 4. CI/CD Enforcement
The CI pipeline will FAIL if:
- `npm run db:lint` reports errors.
- `lib/database.types.ts` is out of sync with the local migrations.
- `supabase db diff --linked` detects any structural drift against the production project.

---
*Maintained by Conductor: Places API v1 Refactor & Enrichment Track*
