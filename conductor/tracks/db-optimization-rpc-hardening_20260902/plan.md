# Implementation Plan: Database Performance Optimization, RPC Hardening & Schema Integrity

## Phase 1: Relational Indexes, Query Inlining & Idempotent Migrations [checkpoint: 55a4de4]

- [x] Task: Write Failing Tests for Query Execution and RLS Inlining (Red Phase) [ea8927d]
    - [x] Add integration test asserting `get_map_markers` RPC query plan uses hash joins without per-row subqueries
    - [x] Add integration test asserting `visits` visibility filtering inlines without PL/pgSQL function overhead
    - [x] Run integration tests against local database to confirm failure or baseline execution
- [x] Task: Implement Database Migration for Covering Indexes and Query Inlining (Green Phase) [72fa017]
    - [x] Create migration file `supabase/migrations/20260902100000_indexes_and_query_optimization.sql`
    - [x] Add covering indexes on `visits(user_id)`, `visits(winery_id)`, `visits(winery_id, user_id)`, `trip_wineries(winery_id)`, `trip_members(user_id)`, `follows(following_id)`, and `wineries(name)`
    - [x] Add composite index on `activity_ledger(activity_type, object_id)`
    - [x] Rewrite `get_map_markers` RPC using pre-filtered hash joins and `SET search_path = public, pg_temp`
    - [x] Refactor `is_visible_to_viewer` to `LANGUAGE sql STABLE` or inline RLS `USING` predicates
    - [x] Apply migration locally via `npm run db:start` and verify query plans with `EXPLAIN ANALYZE`
    - [x] Run `npm run db:lint` and `npm run db:gen-types` to ensure schema integrity and update types
    - [x] Run `npm run db:check-types:local` to verify TypeScript type definitions
- [x] Task: Conductor - User Manual Verification 'Phase 1: Relational Indexes, Query Inlining & Idempotent Migrations' (Protocol in workflow.md) [55a4de4]

## Phase 2: RPC Consolidation & Winery Service Optimization

- [x] Task: Write Failing Tests for Single-Roundtrip Toggles and Places API Route (Red Phase) [5d63044]
    - [x] Create unit tests in `lib/services/__tests__/wineryService.test.ts` verifying `toggle_favorite` makes a single RPC call without secondary upsert
    - [x] Create tests in `app/api/wineries/__tests__/route.test.ts` verifying Places API (New) V1 payload handling and awaited database upsert
    - [x] Run unit tests to confirm red state
- [ ] Task: Implement RPC Update, Service Optimization, and Route Modernization (Green Phase)
    - [ ] Create migration `supabase/migrations/20260902110000_toggle_favorite_composite_return.sql` updating `toggle_favorite` to return `jsonb` with `is_favorite` and `winery_id`
    - [ ] Update `lib/services/wineryService.ts` to consume single RPC response and remove redundant `ensureInDb` upsert
    - [ ] Update `app/api/wineries/route.ts` to call Places API (New) V1 and properly await database upsert or use Next.js `after()`
    - [ ] Run `npm run db:gen-types` and verify `npm run db:check-types:local`
    - [ ] Re-run unit and integration tests to confirm green state
- [ ] Task: Conductor - User Manual Verification 'Phase 2: RPC Consolidation & Winery Service Optimization' (Protocol in workflow.md)

## Phase 3: Security Configuration, Webhook Parameterization & Edge Function Cleanup

- [ ] Task: Write Failing Tests for Parameterized Webhook and Edge Function Suite (Red Phase)
    - [ ] Add Deno / Edge Function tests in `supabase/functions/tests/` asserting dynamic webhook URL resolution
    - [ ] Verify orphaned Edge Function `update-gemini-summary` removal does not break `enrich-winery` imports
    - [ ] Run test suite to verify initial status
- [ ] Task: Implement Webhook Parameterization and Prune Orphaned Edge Function (Green Phase)
    - [ ] Create migration `supabase/migrations/20260902120000_parameterize_notification_webhook.sql` replacing hardcoded Supabase project URL and service secret with `current_setting('app.settings.supabase_url', true)`
    - [ ] Delete orphaned directory `supabase/functions/update-gemini-summary/`
    - [ ] Audit remaining SQL migrations to ensure all DDL operations use `IF NOT EXISTS` / `IF EXISTS`
    - [ ] Run `npm run test:functions` to verify Edge Function test suite passes
    - [ ] Run `npm run db:lint` and `npm run db:check-types:local`
    - [ ] Run `CI=true npm test` to confirm zero regressions across entire project
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Security Configuration, Webhook Parameterization & Edge Function Cleanup' (Protocol in workflow.md)
