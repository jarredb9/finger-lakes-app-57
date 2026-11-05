# Implementation Plan: PostgREST Direct Table RLS, Storage Policies, Trip/Friend Membership Validation, and Webhook Hardening

**Tracking:** Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93)  
**Specification Reference:** [spec.md](./spec.md)  

## Phase 1: Identity & Social Consent Hardening (Friends & Profiles) (Strict TDD) [checkpoint: 9b194214]

- [x] Task: Write failing security regression tests for friends & profiles (TDD Red phase) [commit: 5e1e5149]
    - [x] Add integration test case in `lib/services/__tests__/supabase-rpc.integration.test.ts` asserting direct `INSERT` on `public.friends` with `status = 'accepted'` is rejected by RLS.
    - [x] Add integration test case asserting `public.friends` `UPDATE` cannot be executed by `user1_id` and requires `status = 'pending'`.
    - [x] Add integration test case asserting direct `UPDATE` of `profiles.email` and `profiles.id` is denied for authenticated role.
    - [x] Add integration test case asserting direct `SELECT` on `profiles.email` is denied for authenticated role.
    - [x] Add integration test case asserting `send_friend_request` rejects wildcard characters (`%`, `_`) and matches exact lower-case email.
    - [x] Execute containerized integration tests (`npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`) and confirm test failures (Red).
- [x] Task: Implement friends & profiles hardening migration & client adapter (TDD Green phase) [commit: 6fde7b58]
    - [x] Create `supabase/migrations/20261104100000_harden_friends_and_profiles.sql`.
    - [x] Harden `public.friends`: add `CHECK (user1_id <> user2_id)` constraint, unique pair index on `(LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id))`, restrict `INSERT` RLS to `auth.uid() = user1_id AND status = 'pending'`, and restrict `UPDATE` RLS to `auth.uid() = user2_id AND status = 'pending' WITH CHECK (status IN ('accepted', 'declined'))`.
    - [x] Harden `public.profiles`: revoke `UPDATE (id, email)` and `SELECT (email)` from `authenticated`, create unique index on `LOWER(email)` where email is not null.
    - [x] Update `send_friend_request` to match `LOWER(email) = LOWER(TRIM(p_target_email))`.
    - [x] Update `ProfileService.fetchProfile(userId)` in `lib/services/profileService.ts` to omit `email` from PostgREST `select()` and resolve email via `supabase.auth.getUser()`.
    - [x] Reset local database stack (`npm run db:reset`) and verify migration applies cleanly.
    - [x] Execute containerized integration tests (`npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`) and verify Phase 1 tests pass (Green).
- [x] Task: Conductor - User Manual Verification 'Phase 1: Identity & Social Consent Hardening (Friends & Profiles)' (Protocol in workflow.md) [commit: 9b194214]

## Phase 2: Trip Collaboration & Catalog Integrity Hardening (Trips & Wineries) (Strict TDD) [checkpoint: a2a65653]

- [x] Task: Write failing security regression tests for trip members & ensure_winery (TDD Red phase) [commit: ed0ab978]
    - [x] Add integration test case asserting arbitrary non-mutual friends cannot be inserted into `trip_members` via direct PostgREST `INSERT`.
    - [x] Add integration test case asserting `create_trip_with_winery` raises explicit exception when non-mutual-friend UUIDs are passed in `p_members`.
    - [x] Add integration test case asserting `add_trip_member_by_email` raises explicit exception when target user is not an accepted mutual friend or wildcard emails are provided.
    - [x] Add integration test case asserting non-owner trip members can `DELETE` their own row from `trip_members`.
    - [x] Add integration test case asserting `ensure_winery` rejects out-of-bound latitude/longitude, invalid ratings, and non-HTTP(S) URLs.
    - [x] Execute containerized integration tests (`npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`) and confirm test failures (Red).
- [x] Task: Implement trip collaboration & catalog integrity hardening migration (TDD Green phase) [commit: 1d2d7b40]
    - [x] Create `supabase/migrations/20261104110000_harden_trips_and_wineries.sql`.
    - [x] Harden `public.trip_members` RLS: `INSERT` requires trip owner + accepted mutual friend; `DELETE` permits trip owner or member themselves (`user_id = auth.uid()`).
    - [x] Update `create_trip_with_winery`: validate all `p_members` are owner or accepted mutual friends, raising `RAISE EXCEPTION 'Trip members must be accepted mutual friends';` on violation.
    - [x] Update `add_trip_member_by_email`: match `LOWER(email) = LOWER(TRIM(p_email))` and verify target user is an accepted mutual friend of `auth.uid()`, raising explicit exception on violation.
    - [x] Update existing integration test in `lib/services/__tests__/supabase-rpc.integration.test.ts` (lines 98–111) to establish mutual friendship before shared trip creation.
    - [x] Harden `ensure_winery`: add checks for latitude (-90..90), longitude (-180..180), ratings (0..5), and `^https?://` URLs, raising explicit exceptions on validation failure.
    - [x] Reset local database stack (`npm run db:reset`) and verify migration applies cleanly.
    - [x] Execute containerized integration tests (`npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`) and verify Phase 2 tests pass (Green).
- [x] Task: Conductor - User Manual Verification 'Phase 2: Trip Collaboration & Catalog Integrity Hardening (Trips & Wineries)' (Protocol in workflow.md) [commit: a2a65653]

## Phase 3: Private Storage, Ledger Privacy & Webhook Resilience (Storage & Triggers) (Strict TDD)

- [ ] Task: Write failing security regression tests for storage RLS & trigger privacy (TDD Red phase)
    - [ ] Add integration test case asserting `visit-photos` storage objects reject unauthenticated or non-viewer access to private visit photos.
    - [ ] Add integration test case asserting `handle_activity_ledger_entry` records `privacy_level = 'private'` when the user's profile is private (even if visit is not explicitly marked private).
    - [ ] Add integration test case asserting `TripService.getTrips` query succeeds for authenticated users without encountering 42501 column privilege denial on `profiles.email`.
    - [ ] Add integration test cases asserting authenticated callers can invoke `get_friend_activity_feed`, `get_friends_activity_for_winery`, and `get_friends_ratings_for_winery` without 42501 permission denied errors.
    - [ ] Execute containerized integration tests (`npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`) and confirm test failures (Red).
- [ ] Task: Implement private storage, ledger privacy & webhook hardening migration (TDD Green phase)
    - [ ] Create `supabase/migrations/20261104120000_harden_storage_and_webhooks.sql`.
    - [ ] Harden `visit-photos` storage bucket: update `storage.buckets` configuration (`public = false`, `file_size_limit = 10485760`, `allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']`).
    - [ ] Create GIN index on `public.visits (photos)`: `CREATE INDEX IF NOT EXISTS idx_visits_photos_gin ON public.visits USING GIN (photos);`.
    - [ ] Update `storage.objects` `SELECT` policy for `visit-photos`: permit owner access via folder check and viewer access via array containment on `public.visits (photos)` verified against `public.is_visible_to_viewer(v.user_id, v.is_private)`.
    - [ ] Fix `handle_activity_ledger_entry`: set `v_privacy_level := 'private'` if `NEW.is_private OR v_user_privacy = 'private'`.
    - [ ] Harden `handle_activity_ledger_notification`: prioritize `vault.decrypted_secrets` before `app.settings`, validate webhook URL domain against allowlist, and fail open with `RAISE WARNING` / `RETURN NEW;`.
    - [ ] Append `, pg_temp` to `SET search_path = public, auth, pg_temp` across all `SECURITY DEFINER` functions.
    - [ ] Decouple `profiles.email` from `SECURITY INVOKER` RPCs in `supabase/migrations/20261104120000_harden_storage_and_webhooks.sql`: project `NULL::text as user_email` in `get_friend_activity_feed`, project `p.id, p.name, NULL::text as email` in `get_friends_activity_for_winery`, and project `'hidden'::text as email` in `get_friends_ratings_for_winery`.
    - [ ] Update `TripService.getTrips` in `lib/services/tripService.ts` to omit `email` from PostgREST `profiles ( name )` join query and default `email: ''` in client mapper.
    - [ ] Reset local database stack (`npm run db:reset`) and verify migration applies cleanly.
    - [ ] Execute containerized integration tests (`npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`) and verify Phase 3 tests pass (Green).
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Private Storage, Ledger Privacy & Webhook Resilience (Storage & Triggers)' (Protocol in workflow.md)

## Phase 4: Security Advisor Linter Harness Expansion & Tooling (Verification & Tooling)

- [ ] Task: Implement Security Advisor Linter Assertions & TypeScript Sync
    - [ ] Expand catalog query in `scripts/db/verify-security-advisor.sql` to include checks for `0007_policy_exists_rls_disabled`, `0008_rls_enabled_no_policy`, and `0010_security_definer_view`.
    - [ ] Update `scripts/db/verify-security-advisor.ts` to assert zero violations for categories 0007, 0008, and 0010 in `SecurityAdvisorCategory`, scorecard results, and CLI linter assertions.
    - [ ] Regenerate database TypeScript definitions via `npm run db:gen-types`.
    - [ ] Verify TypeScript types compile cleanly with `npm run db:check-types:local`.
    - [ ] Run `npm run db:verify-advisor` and confirm 0 violations across categories 0007, 0008, 0010, 0026, 0027, 0028, and 0029.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Security Advisor Linter Harness Expansion & Tooling' (Protocol in workflow.md)

## Phase 5: Full Test Suite Verification & Quality Gates (Verification)

- [ ] Task: Execute Full Containerized Test Suite & Production Build
    - [ ] Run full unit test suite: `npm run test:container`.
    - [ ] Run full integration test suite: `npm run test:integration:container`.
    - [ ] Run production build: `npm run build`.
    - [ ] Verify clean git status and absence of temporary artifacts.
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Full Test Suite Verification & Quality Gates' (Protocol in workflow.md)
