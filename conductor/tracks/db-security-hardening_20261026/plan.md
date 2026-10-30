# Implementation Plan: Database Security Hardening, RLS Lockdown, and SECURITY INVOKER Conversion

**Tracking:** Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87)  
**Specification Reference:** [spec.md](./spec.md)  

## Phase 1: Client & Integration Test Modernization (Preparation)

- [x] Task: Modernize supabase-rpc Integration Tests & Prune Dead tripService Code [commit: c029eb596e8306c6cc6e59c0daea3e631e224aa7]
    - [x] Update `lib/services/__tests__/supabase-rpc.integration.test.ts`: replace deprecated `add_to_wishlist` calls with modern `toggle_wishlist`.
    - [x] Remove obsolete `send_follow_request` and `respond_to_follow_request` test blocks from `lib/services/__tests__/supabase-rpc.integration.test.ts`.
    - [x] Remove deprecated `addWineryToTripByApi` method from `lib/services/tripService.ts`.
    - [x] Remove `addWineryToTripByApi` test block from `lib/services/__tests__/tripService.mutations.test.ts`.
- [x] Task: Verify Existing Test Suites Pass on Current Baseline [commit: 5a6a566b60beb36a46f802fa8f9b91a00140d070]
    - [x] Run containerized unit test suite for mutations: `npm run test:container -- lib/services/__tests__/tripService.mutations.test.ts`.
    - [x] Run existing integration tests to confirm baseline stability before applying database changes.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Confirm no lingering client references to the 10 RPCs targeted for removal.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Client & Integration Test Modernization' (Protocol in workflow.md)

## Phase 2: Database Hardening & Security Regression (Strict TDD)

- [ ] Task: Write Failing Security Regression Tests (TDD Red phase)
    - [ ] Add integration test cases in `lib/services/__tests__/supabase-rpc.integration.test.ts` for unauthenticated (`anon`) access denial on `profiles`, `wineries`, `visits`, and user collections.
    - [ ] Add integration test case verifying direct `INSERT` on `public.wineries` is denied with code `42501` to regular authenticated users.
    - [ ] Add integration test cases verifying `ensure_winery` immutability on conflict (existing non-null attributes preserved, nulls backfilled, place ID aliasing, rating > 0).
    - [ ] Add integration test cases verifying composite `(user_id, idempotency_key)` isolation (cross-user key reuse does not leak records or collide) and top-level auth checks.
    - [ ] Add test cases asserting email redaction for non-friends in `get_friend_profile_with_visits`.
    - [ ] Run containerized integration tests (`npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`) and confirm test failures on the unhardened schema.
- [ ] Task: Implement Database Hardening Migration & Verify Green (TDD Green phase)
    - [ ] Create `supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql`.
    - [ ] Revoke table, sequence, and function privileges from `anon` in `schema public` and alter default privileges.
    - [ ] Drop `pg_graphql` extension (`DROP EXTENSION IF EXISTS pg_graphql CASCADE;`).
    - [ ] Drop `Authenticated users can insert wineries` RLS policy and revoke `INSERT`, `UPDATE`, and `DELETE` on `public.wineries` from `authenticated`.
    - [ ] Update `is_visible_to_viewer` to return `FALSE` when `auth.uid() IS NULL` and remove deprecated `follows` table check.
    - [ ] Update client-facing RLS policies with explicit `TO authenticated` and add missing `FOR UPDATE` policies to `favorites` and `wishlist`.
    - [ ] Revoke privileges on unused tables (`follows`, `follow_requests`, `visit_participants`).
    - [ ] Drop 10 dead/deprecated RPCs (`upsert_wineries_from_search`, `get_all_user_visits_list`, `get_user_dashboard`, `get_user_winery_data_aggregated`, `get_winery_details`, `get_wineries_in_bounds`, `add_winery_to_trips`, `add_to_wishlist`, `send_follow_request`, `respond_to_follow_request`).
    - [ ] Replace global unique constraints on `visits.idempotency_key` and `trips.idempotency_key` with composite `UNIQUE (user_id, idempotency_key)`.
    - [ ] Harden `ensure_winery` with caller auth check, parameter aliasing (`google_place_id` / `id`), rating normalization, and null-backfill conflict resolution for all attributes (`name`, `address`, `latitude`, `longitude`, `phone`, `website`, `google_rating`).
    - [ ] Refactor `log_visit`, `create_trip_with_winery`, and `add_winery_to_trip` to delegate to `ensure_winery`.
    - [ ] Scope `idempotency_key` queries and conflict clauses by `(user_id, idempotency_key)` with top-level auth checks.
    - [ ] Redact email in `get_friend_profile_with_visits` for non-friends.
    - [ ] Convert 8 read RPCs and 18 write RPCs to `SECURITY INVOKER`.
    - [ ] Retain 7 boundary RPCs as `SECURITY DEFINER` with explicit authenticated/service_role execute grants.
    - [ ] Lock down trigger functions (`handle_new_user`, `handle_activity_ledger_notification`, `handle_activity_ledger_entry`).
    - [ ] Reset local database stack (`npm run db:reset`) and verify migration applies cleanly.
    - [ ] Run containerized integration tests and verify that all 5 security regression tests pass (Green).
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Audit migration SQL for formatting, idempotency, and syntax cleanliness.
    - [ ] Verify local database logs and clean up any temporary test artifacts.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Database Hardening & Security Regression' (Protocol in workflow.md)

## Phase 3: Supabase Configuration & Client Type Synchronization (Tooling)

- [ ] Task: Remove pg_graphql from Supabase Configuration
    - [ ] Remove `"graphql_public"` from `db.schemas` in both `supabase/config.toml` and `supabase/config.ci.toml`.
- [ ] Task: Regenerate TypeScript Definitions & Verify Static Compilation Gate
    - [ ] Regenerate database TypeScript definitions via `npm run db:gen-types`.
    - [ ] Verify dropped RPCs are removed from `lib/database.types.ts`.
    - [ ] Verify TypeScript types compile cleanly with `npm run db:check-types:local`.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Audit generated types in `lib/database.types.ts` for clean exports.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Supabase Configuration & Client Type Synchronization' (Protocol in workflow.md)

## Phase 4: Security Advisor Linter & Final Quality Gates (Verification)

- [ ] Task: Verify Security Advisor Linter Warnings Resolution
    - [ ] Verify categories 0026, 0027, 0028, and 0029 warnings are fully eliminated against the local database schema.
- [ ] Task: Execute Full Containerized Test Suite & Production Build
    - [ ] Run full unit test suite: `npm run test:container`.
    - [ ] Run full integration test suite: `npm run test:integration:container`.
    - [ ] Run production build: `npm run build`.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Remove any temporary log or test artifacts.
    - [ ] Verify clean git status.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Security Advisor Linter & Final Quality Gates' (Protocol in workflow.md)
