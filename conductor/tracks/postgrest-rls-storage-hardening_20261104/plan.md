# Implementation Plan: PostgREST Direct Table RLS, Storage Policies, Trip/Friend Membership Validation, and Webhook Hardening

**Tracking:** Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93)  
**Specification Reference:** [spec.md](./spec.md)  

## Phase 1: Security Regression Tests - Red Phase (TDD Red phase)

- [ ] Task: Write failing security regression tests for PostgREST RLS, storage, membership, and RPCs (TDD Red phase)
    - [ ] Add integration test case in `lib/services/__tests__/supabase-rpc.integration.test.ts` asserting direct `INSERT` on `public.friends` with `status = 'accepted'` is rejected by RLS.
    - [ ] Add integration test case asserting `public.friends` `UPDATE` cannot be executed by `user1_id` and requires `status = 'pending'`.
    - [ ] Add integration test case asserting `visit-photos` storage objects reject unauthenticated or non-viewer access to private visit photos.
    - [ ] Add integration test case asserting direct `UPDATE` of `profiles.email` is denied for authenticated role.
    - [ ] Add integration test case asserting direct `SELECT` on `profiles` denies accessing other users' emails.
    - [ ] Add integration test case asserting `add_trip_member_by_email` and `send_friend_request` reject wildcard patterns (`%`, `_`) and match exact lower-case emails only.
    - [ ] Add integration test case asserting non-mutual friends cannot be inserted into `trip_members`, and non-owner members can `DELETE` their own row.
    - [ ] Add integration test case asserting `ensure_winery` rejects out-of-bound latitude/longitude, invalid ratings, and non-HTTP(S) URLs.
    - [ ] Add integration test case asserting `handle_activity_ledger_entry` records `privacy_level = 'private'` when the user's profile is private.
    - [ ] Execute containerized integration test suite (`npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`) and confirm test failures (Red).
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Security Regression Tests - Red Phase' (Protocol in workflow.md)

## Phase 2: Database Security Hardening Migration - Green Phase (TDD Green phase)

- [ ] Task: Implement database security hardening migration & verify tests pass (TDD Green phase)
    - [ ] Create `supabase/migrations/20261104000000_harden_postgrest_rls_and_storage.sql`.
    - [ ] Harden `public.friends`: add `CHECK (user1_id <> user2_id)` constraint, unique pair index on `(LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id))`, restrict `INSERT` RLS to `auth.uid() = user1_id AND status = 'pending'`, and restrict `UPDATE` RLS to `auth.uid() = user2_id AND status = 'pending' WITH CHECK (status IN ('accepted', 'declined'))`.
    - [ ] Harden `visit-photos` storage bucket: update `storage.buckets` configuration (`public = false`, `file_size_limit = 10485760`, `allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']`), and update `storage.objects` `SELECT` policy to check `public.is_visible_to_viewer(v.user_id, v.is_private)`.
    - [ ] Harden `public.profiles`: revoke `UPDATE (id, email)` from `authenticated`, restrict direct `SELECT` on `public.profiles` to `auth.uid() = id`, create unique index on `LOWER(email)`, and update `add_trip_member_by_email` and `send_friend_request` to match `LOWER(email) = LOWER(TRIM(p_email))`.
    - [ ] Harden `public.trip_members`: update `INSERT` policy to require member is trip owner or accepted mutual friend (`status = 'accepted'`), and update `DELETE` policy to permit trip owner or the member themselves (`user_id = auth.uid()`).
    - [ ] Harden `public.wineries` & `ensure_winery`: confirm table write grants remain revoked, and add checks for coordinate ranges, ratings (0..5), and `^https?://` URLs.
    - [ ] Harden triggers and functions: prioritize `vault.decrypted_secrets` before `app.settings` in `handle_activity_ledger_notification`, fix privacy level calculation in `handle_activity_ledger_entry`, and append `, pg_temp` to `SET search_path = public, auth, pg_temp` across all `SECURITY DEFINER` functions.
    - [ ] Reset local database stack (`npm run db:reset`) and verify migration applies cleanly.
    - [ ] Execute containerized integration tests (`npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`) and verify all security regression tests pass (Green).
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Database Security Hardening Migration - Green Phase' (Protocol in workflow.md)

## Phase 3: Security Advisor Linter Harness Expansion & Tooling (TDD Red & Green)

- [ ] Task: Write failing advisor tests for categories 0007, 0008, 0010 (TDD Red phase)
    - [ ] Expand catalog query in `scripts/db/verify-security-advisor.sql` to include checks for `0007_policy_exists_rls_disabled`, `0008_rls_enabled_no_policy`, and `0010_security_definer_view`.
    - [ ] Update `scripts/db/verify-security-advisor.ts` to assert zero violations for categories 0007, 0008, and 0010.
    - [ ] Run advisor check and verify test failures if any rule is unmet (Red).
- [ ] Task: Implement Security Advisor Linter Assertions & TypeScript Sync (TDD Green phase)
    - [ ] Ensure all database tables and views satisfy categories 0007, 0008, and 0010.
    - [ ] Regenerate database TypeScript definitions via `npm run db:gen-types`.
    - [ ] Verify TypeScript types compile cleanly with `npm run db:check-types:local`.
    - [ ] Run `npm run db:verify-advisor` and confirm 0 violations across categories 0007, 0008, 0010, 0026, 0027, 0028, and 0029 (Green).
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Security Advisor Linter Harness Expansion & Tooling' (Protocol in workflow.md)

## Phase 4: Full Test Suite Verification & Quality Gates (Verification)

- [ ] Task: Execute Full Containerized Test Suite & Production Build
    - [ ] Run full unit test suite: `npm run test:container`.
    - [ ] Run full integration test suite: `npm run test:integration:container`.
    - [ ] Run production build: `npm run build`.
    - [ ] Verify clean git status and absence of temporary artifacts.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Full Test Suite Verification & Quality Gates' (Protocol in workflow.md)
