# Implementation Plan: Database Security Hardening, RLS Lockdown, and SECURITY INVOKER Conversion

**Tracking:** Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87)  
**Specification Reference:** [spec.md](./spec.md)  

## Phase 1: Security Regression Tests & Database Hardening Migration

- [ ] Task: Write Failing Security Regression Tests (TDD Red phase)
    - [ ] Add integration test cases in `lib/services/__tests__/supabase-rpc.integration.test.ts` for unauthenticated (`anon`) access denial on `profiles`, `wineries`, `visits`, and user collections.
    - [ ] Add integration test cases verifying `ensure_winery` immutability on conflict (existing attributes preserved, nulls backfilled).
    - [ ] Add integration test cases verifying cross-user `idempotency_key` isolation and unauthenticated exception throwing in write RPCs (`create_trip`, `create_trip_with_winery`, `log_visit`, `update_visit`).
    - [ ] Add test cases asserting email redaction for non-friends in `get_friend_profile_with_visits`.
    - [ ] Run containerized integration tests (`npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`) and confirm test failures.
- [ ] Task: Implement Database Hardening Migration & Apply Locally (TDD Green phase)
    - [ ] Create `supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql`.
    - [ ] Revoke table, sequence, and function privileges from `anon` in `schema public` and alter default privileges.
    - [ ] Drop `pg_graphql` extension (`DROP EXTENSION IF EXISTS pg_graphql CASCADE;`).
    - [ ] Update `is_visible_to_viewer` to return `FALSE` when `auth.uid() IS NULL` and remove deprecated `follows` table check.
    - [ ] Update client-facing RLS policies with explicit `TO authenticated` and add missing `FOR UPDATE` policies to `favorites` and `wishlist`.
    - [ ] Revoke privileges on unused tables (`follows`, `follow_requests`, `visit_participants`).
    - [ ] Drop 10 dead/deprecated RPCs (`upsert_wineries_from_search`, `get_all_user_visits_list`, `get_user_dashboard`, `get_user_winery_data_aggregated`, `get_winery_details`, `get_wineries_in_bounds`, `add_winery_to_trips`, `add_to_wishlist`, `send_follow_request`, `respond_to_follow_request`).
    - [ ] Harden `ensure_winery` with caller auth check and non-null column preservation on conflict.
    - [ ] Refactor `log_visit`, `create_trip_with_winery`, and `add_winery_to_trip` to delegate to `ensure_winery`.
    - [ ] Scope `idempotency_key` queries by `AND user_id = auth.uid()` and add top-level auth checks.
    - [ ] Redact email in `get_friend_profile_with_visits` for non-friends.
    - [ ] Convert 8 read RPCs and 17 write RPCs to `SECURITY INVOKER`.
    - [ ] Retain 7 boundary RPCs as `SECURITY DEFINER` with explicit authenticated/service_role execute grants.
    - [ ] Lock down trigger functions (`handle_new_user`, `handle_activity_ledger_notification`, `handle_activity_ledger_entry`).
    - [ ] Reset local database stack (`npm run db:reset`) and verify migration applies cleanly.
    - [ ] Run containerized integration tests and verify that the security regression tests pass.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Audit migration SQL for formatting, clean comments, and idempotent statements.
    - [ ] Verify local database logs and clean up any temporary test artifacts.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Security Regression Tests & Database Hardening Migration' (Protocol in workflow.md)

## Phase 2: Supabase Configuration & Client Type Synchronization

- [ ] Task: Write Failing Tests for Config and Type Contract (TDD Red phase)
    - [ ] Add test asserting `supabase/config.toml` and `supabase/config.ci.toml` do not include `"graphql_public"`.
    - [ ] Run test and observe failure on existing configs.
- [ ] Task: Synchronize Configs, Prune Legacy Client RPCs & Regenerate Types (TDD Green phase)
    - [ ] Remove `"graphql_public"` from `db.schemas` in `supabase/config.toml` and `supabase/config.ci.toml`.
    - [ ] Remove deprecated `addWineryToTripByApi` from `lib/services/tripService.ts`.
    - [ ] Regenerate database TypeScript definitions via `npm run db:gen-types`.
    - [ ] Verify TypeScript types compile cleanly with `npm run db:check-types:local`.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Audit generated types in `lib/database.types.ts` to confirm dropped RPCs are removed.
    - [ ] Remove any temporary type check scripts.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Supabase Configuration & Client Type Synchronization' (Protocol in workflow.md)

## Phase 3: Integration Test Suite Modernization & Security Verification

- [ ] Task: Update Integration Tests to Use Modern RPCs (TDD Red phase)
    - [ ] Update `lib/services/__tests__/supabase-rpc.integration.test.ts` to replace legacy `add_to_wishlist` calls with `toggle_wishlist`.
    - [ ] Remove deprecated `send_follow_request` and `respond_to_follow_request` test blocks.
    - [ ] Confirm tests fail before running full migration-backed suite if any legacy assumptions remain.
- [ ] Task: Execute and Stabilize Full Integration Test Suite (TDD Green phase)
    - [ ] Run complete containerized integration suite: `npm run test:integration:container`.
    - [ ] Ensure all RPC integration tests pass against the hardened schema.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Audit integration test assertions for clarity, determinism, and lack of flakiness.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Integration Test Suite Modernization & Security Verification' (Protocol in workflow.md)

## Phase 4: Full Quality Gates, Linter Gate & Verification

- [ ] Task: Verify Security Advisor Linter Warnings Resolution (TDD Red phase)
    - [ ] Run database security lint checks or inspect security warnings to assert 0026, 0027, 0028, and 0029 are resolved.
- [ ] Task: Execute Full Containerized Test Suite & Build Verification (TDD Green phase)
    - [ ] Run full unit test suite: `npm run test:container`.
    - [ ] Run TypeScript checks: `npm run db:check-types:local`.
    - [ ] Verify project builds cleanly.
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Remove any temporary log or test artifacts.
    - [ ] Verify clean git status.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Full Quality Gates, Linter Gate & Verification' (Protocol in workflow.md)
