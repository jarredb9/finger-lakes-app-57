# Implementation Plan: Phase 3 Task 1 — Write Failing Security Regression Tests for Storage RLS & Trigger Privacy (TDD Red phase)

**Track:** `postgrest-rls-storage-hardening_20261104` (Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93))  
**Phase:** 3 (Private Storage, Ledger Privacy & Webhook Resilience — Storage & Triggers)  
**Task:** 1 (Write Failing Security Regression Tests for Storage RLS & Trigger Privacy — TDD Red phase)  
**ADR References:** [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md), [docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/spec.md](./spec.md)  
**Track Plan Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Establish authoritative failing integration test cases in [supabase-rpc.integration.test.ts](../../../lib/services/__tests__/supabase-rpc.integration.test.ts) to empirically validate the 4 core storage, trigger privacy, and column privilege decoupling boundaries defined in Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93), [ADR-0007](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md), and [ADR-0010](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md):

1. **Storage Bucket & Object RLS Hardening (`visit-photos`):**
   - Assert `storage.buckets` configuration for `visit-photos` is private (`public = false`).
   - Assert unauthenticated callers (`anonClient`) and unauthorized viewers cannot download private visit photos via `storage.from('visit-photos').download(photoPath)`.
   - Assert that for a visit marked `is_private = true`, accepted mutual friends cannot view or download the photo (`storage.objects` RLS enforces `is_visible_to_viewer(v.user_id, v.is_private)`).
   - Assert that for a visit marked `is_private = false`, accepted mutual friends can download the photo, while non-friends are rejected.
2. **Activity Ledger Trigger Privacy Inheritance (`handle_activity_ledger_entry`):**
   - Assert that when a user whose profile has `privacy_level = 'private'` logs a visit or collection item where `is_private` is `false` (or unset), `handle_activity_ledger_entry` records `privacy_level = 'private'` in `public.activity_ledger` rather than defaulting to `'public'`.
3. **PostgREST Query Column Privilege Decoupling (`TripService.getTrips`):**
   - Assert `TripService.getTrips` executes successfully for authenticated callers without throwing PostgreSQL error `42501` (`permission denied for column "email" of table "profiles"`), returning trip members with safe email defaults (`email: ''`).
4. **`SECURITY INVOKER` Activity RPCs Column Privilege Decoupling:**
   - Assert authenticated callers can invoke `get_friend_activity_feed`, `get_friends_activity_for_winery`, and `get_friends_ratings_for_winery` without triggering PostgreSQL error `42501` column privilege denials, projecting safe decoupled fields (`user_email: null` / `'hidden'`).

### 1.2 Development Methodology: Strict TDD Red Phase
In compliance with `conductor/workflow.md` and the TDD Task Granularity Invariant ([AGENTS.md](../../../AGENTS.md) Section 5):
- All 4 test cases are authored and run against the **current unhardened database schema and client code**.
- Each test case is designed to expose existing security vulnerabilities and fail on the baseline schema (Red phase).
- Authoring of the database migration `20261104120000_harden_storage_and_webhooks.sql` and the client adapter update in `lib/services/tripService.ts` is strictly reserved for Phase 3 Task 2 (Green phase).

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety ([AGENTS.md](../../../AGENTS.md) Critical Guardrail 1):**
   - Absolutely zero migrations, DDL, or DML mutations executed against the remote Supabase project (`jfsxclrdxmvftxacjuqf`).
   - All integration tests execute against the local containerized Supabase instance (`http://127.0.0.1:54321`).
2. **Containerized Test Execution ([AGENTS.md](../../../AGENTS.md) Section 3):**
   - Host RHEL 8 glibc (2.28) is incompatible with native SWC. All Jest integration tests must execute via the Podman container runner:
     `npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`
   - Container execution requires `BypassSandbox: true`.
3. **TDD Red Phase Invariant (`conductor/workflow.md`):**
   - Tests must be executed and confirmed failing before committing.
   - Commit scope must be strictly `test(db): ...`. No application code or database migrations are authored in this task.
4. **Test Fixture Hygiene & Teardown Integrity:**
   - Any winery place IDs created during tests must be registered in the existing `createdWineryIds` array to ensure cleanup via `afterAll`.
   - Clean up created trips, friend relationships, visits, activity ledger entries, and storage objects during test teardown.
5. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Halt immediately for affirmative user approval via the `ask_question` modal before making any file modifications on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target Test Suite
- **Path:** `lib/services/__tests__/supabase-rpc.integration.test.ts`
- **Semantic Insertion Anchor:** Inside `describe('Supabase RPC Integration Tests', () => { ... })`, immediately after the final Phase 2 test `should reject invalid coordinates, ratings, and URLs in ensure_winery` (around line 1350), prior to the closing `});` of the outer describe block (line 1352).

```typescript
// Semantic Insertion Anchor: lib/services/__tests__/supabase-rpc.integration.test.ts ~line 1350
        // Cleanup
        await adminClient.from('wineries').delete().in('google_place_id', [id1, id2, id3, id4, id5]);
      });
      // <<< INSERT PHASE 3 SECURITY REGRESSION TESTS HERE >>>
    });
});
```

---

## 4. TypeScript Interfaces & Type Blueprints

The following interfaces describe the data shapes, storage records, RPC parameters, and return types used across the 4 test assertions:

```typescript
/**
 * Shape of bucket record in storage.buckets.
 */
export interface StorageBucketRecord {
  id: string;
  name: string;
  public: boolean;
  file_size_limit?: number | null;
  allowed_mime_types?: string[] | null;
}

/**
 * Result shape returned by supabase.storage.from(...).download(...)
 */
export interface StorageDownloadResult {
  data: Blob | null;
  error: {
    message: string;
    statusCode?: string | number;
    error?: string;
  } | null;
}

/**
 * Shape of row in public.activity_ledger table.
 */
export interface ActivityLedgerRow {
  id: number;
  user_id: string;
  activity_type: 'visit' | 'favorite' | 'wishlist';
  object_id: string;
  privacy_level: 'public' | 'friends_only' | 'private';
  metadata: Record<string, any>;
  created_at: string;
}

/**
 * Feed item returned by get_friend_activity_feed RPC.
 */
export interface FriendActivityFeedItem {
  activity_type: string;
  created_at: string;
  activity_user_id: string;
  user_name: string;
  user_email: string | null;
  winery_id: number;
  winery_name: string;
  visit_rating?: number;
  visit_review?: string;
  visit_photos?: string[];
}

/**
 * Composite activity structure returned by get_friends_activity_for_winery RPC.
 */
export interface FriendsActivityForWineryResponse {
  favoritedBy: Array<{
    id: string;
    name: string;
    email: string | null;
  }>;
  wishlistedBy: Array<{
    id: string;
    name: string;
    email: string | null;
  }>;
}

/**
 * Rating row structure returned by get_friends_ratings_for_winery RPC.
 */
export interface FriendRatingForWineryRow {
  user_id: string;
  name: string;
  email: string;
  rating: number;
  user_review: string;
  photos: string[];
}
```

---

## 5. Precise Behavioral Logic & Test Scenarios

### Test Case 1: `visit-photos` Storage RLS and Private Visit Isolation
- **Objective:** Verify that `visit-photos` storage objects reject unauthenticated download requests and prevent friends/non-viewers from accessing photos associated with private visits (`is_private = true`), while permitting access to visible visits (`is_private = false`).
- **Setup:**
  1. Inspect bucket configuration via `adminClient.from('storage.buckets').select('*').eq('id', 'visit-photos').single()`.
  2. Upload test photo fixture via `user1.client.storage.from('visit-photos').upload(`${user1.id}/private-test-${uuid}.jpg`, Buffer.from('fake-photo-data'), { contentType: 'image/jpeg' })`.
  3. Ensure `user1` and `user2` are accepted mutual friends; ensure `user1` and `user3` are NOT friends.
  4. Create a visit for `user1` with `is_private = true` and `photos = [`${user1.id}/private-test-${uuid}.jpg`]`.
- **Execution & Invariant Assertions:**
  1. **Bucket Privacy Enforcement:** Assert `bucketRecord.public === false`.
  2. **Unauthenticated Access Denial:**
     - `anonClient.storage.from('visit-photos').download(photoPath)`
     - Assert `error` is NOT null (rejection).
  3. **Friend Access to Private Visit Photo Denial:**
     - Authenticated mutual friend `user2` attempts: `user2.client.storage.from('visit-photos').download(photoPath)`.
     - Assert `error` is NOT null (storage RLS denies access because visit is private).
  4. **Non-Friend Access Denial:**
     - Authenticated non-friend `user3` attempts: `user3.client.storage.from('visit-photos').download(photoPath)`.
     - Assert `error` is NOT null.
  5. **Owner Access Permitted:**
     - Authenticated owner `user1` attempts: `user1.client.storage.from('visit-photos').download(photoPath)`.
     - Assert `error` is null, `data` is returned.
  6. **Friend Access to Public Visit Photo Permitted:**
     - Create public visit (`is_private = false`) with uploaded photo path.
     - `user2.client.storage.from('visit-photos').download(publicPhotoPath)`.
     - Assert `error` is null.
- **Teardown:** Remove uploaded files via `adminClient.storage.from('visit-photos').remove([photoPath, publicPhotoPath])`; delete created visits.
- **Expected Failure on Baseline Schema (Red):**
  - Baseline `storage.buckets` has `public = true`.
  - Baseline `storage.objects` SELECT policy `"Users can view their own and friends photos"` only checks `(storage.foldername(name))[1] IN (SELECT friend_id FROM get_friends_ids())`. Because `user1` and `user2` are friends, `user2` is granted access even when `is_private = true`.
  - In Red phase, `expect(bucket.public).toBe(false)` and `expect(user2DownloadError).not.toBeNull()` fail.

### Test Case 2: `handle_activity_ledger_entry` Privacy Inheritance from Profile
- **Objective:** Verify that `handle_activity_ledger_entry` records `privacy_level = 'private'` in `public.activity_ledger` when the user's profile is private, even if the visit/action is not explicitly flagged as private.
- **Setup:**
  1. Set `user1` profile to `privacy_level = 'private'` via `adminClient.from('profiles').update({ privacy_level: 'private' }).eq('id', user1.id)`.
  2. Place ID: generate unique winery place ID and create winery via `ensure_winery`.
- **Execution & Invariant Assertions:**
  1. Insert a visit for `user1` with `is_private = false` (or omit `is_private`).
  2. Query `adminClient.from('activity_ledger').select('id, privacy_level, object_id').eq('object_id', visit.id.toString()).single()`.
  3. Assert `error` is null.
  4. Invariant: `expect(ledgerRow.privacy_level).toBe('private')`.
- **Teardown:** Delete created visit and ledger row; restore `user1` profile privacy to `'public'`.
- **Expected Failure on Baseline Schema (Red):**
  - Baseline trigger logic in `20260528000000_v2.11.0-stable.sql` (lines 1833–1839):
    ```sql
    IF NEW.is_private THEN
        v_privacy_level := 'private';
    ELSIF v_user_privacy = 'friends_only' THEN
        v_privacy_level := 'friends_only';
    ELSE
        v_privacy_level := 'public';
    END IF;
    ```
  - When `v_user_privacy = 'private'` and `NEW.is_private = false`, the logic falls into `ELSE` and sets `v_privacy_level := 'public'`.
  - In Red phase, `expect(ledgerRow.privacy_level).toBe('private')` fails because it receives `'public'`.

### Test Case 3: `TripService.getTrips` Query Execution without 42501 Column Privilege Denial
- **Objective:** Verify that `TripService.getTrips` executes successfully for authenticated callers against PostgREST without throwing PostgreSQL error `42501` (`permission denied for column "email" of table "profiles"`).
- **Setup:**
  1. Create a trip owned by `user1` and add `user1` as a member in `trip_members`.
  2. Ensure `user1` and `user2` are accepted mutual friends, and add `user2` to `trip_members`.
  3. Spy/mock `createClient` from `@/utils/supabase/client` to return `user1.client` (authenticated client).
- **Execution & Invariant Assertions:**
  1. Call `await TripService.getTrips(1, 'upcoming')`.
  2. Assert the call resolves successfully without throwing `42501`.
  3. Assert `result.trips` contains the seeded trip.
  4. Assert member details have `profiles.name` populated and `email` safely defaulted to empty string `''`.
- **Teardown:** Restore `createClient` spy; delete created trip and member records.
- **Expected Failure on Baseline Schema (Red):**
  - In `lib/services/tripService.ts` (lines 48–51), the query selects `trip_members!inner ( ..., profiles ( name, email ) )`.
  - In Phase 1, `REVOKE SELECT (email) ON public.profiles FROM authenticated` was applied.
  - When `user1.client` executes `TripService.getTrips`, PostgREST rejects the query with `code: '42501'`, `message: 'permission denied for column "email" of table "profiles"'`.
  - In Red phase, `await expect(TripService.getTrips(1, 'upcoming')).resolves.not.toThrow()` fails.

### Test Case 4: `SECURITY INVOKER` Activity RPCs Column Privilege Decoupling
- **Objective:** Verify that authenticated callers can invoke `get_friend_activity_feed`, `get_friends_activity_for_winery`, and `get_friends_ratings_for_winery` without triggering PostgreSQL error `42501` column privilege denials on `profiles.email`.
- **Setup:**
  1. Ensure `user1` and `user2` are accepted mutual friends.
  2. Seed a winery and insert an `activity_ledger` entry for `user2` (visit activity with rating and review, visible to friends).
- **Execution & Invariant Assertions:**
  1. **Friend Activity Feed:**
     - `const { data: feed, error: feedError } = await user1.client.rpc('get_friend_activity_feed', { p_limit: 10 });`
     - Assert `feedError` is null.
     - Assert `feed` contains the activity item and `user_email` is `null` (decoupled from `p.email`).
  2. **Friends Activity for Winery:**
     - `const { data: activity, error: activityError } = await user1.client.rpc('get_friends_activity_for_winery', { p_winery_id: wineryId });`
     - Assert `activityError` is null.
     - Assert `activity.favoritedBy` or `activity.wishlistedBy` does not throw 42501 and projects safe email (`null`).
  3. **Friends Ratings for Winery:**
     - `const { data: ratings, error: ratingsError } = await user1.client.rpc('get_friends_ratings_for_winery', { p_winery_id: wineryId });`
     - Assert `ratingsError` is null.
     - Assert `ratings` array items project `email = 'hidden'` without querying `p.email`.
- **Teardown:** Clean up seeded `activity_ledger` entries, visits, and friend rows.
- **Expected Failure on Baseline Schema (Red):**
  - In `20261026000000_harden_rls_and_security_invoker_rpcs.sql`:
    - `get_friend_activity_feed` queries `COALESCE(p.email, 'unknown')::text as user_email`.
    - `get_friends_activity_for_winery` queries `SELECT p.id, p.name, p.email`.
    - `get_friends_ratings_for_winery` queries `COALESCE(p.email, 'hidden')::text as email`.
  - Because these RPCs are `SECURITY INVOKER` and `SELECT (email)` was revoked from `authenticated` in Phase 1, PostgreSQL raises error `42501`.
  - In Red phase, `expect(feedError).toBeNull()`, `expect(activityError).toBeNull()`, and `expect(ratingsError).toBeNull()` all fail with code `42501`.

---

## 6. Execution Verification Protocol

### 6.1 Pre-Execution State
- Do not apply any database migrations or schema modifications during this task.
- Ensure the local Supabase stack is running on `http://127.0.0.1:54321`.

### 6.2 Test Command
Run the containerized integration test suite against the target test file:

```bash
npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts
```

*Execution Note:* Run via `./scripts/containers/run-jest-container.sh` with `BypassSandbox: true` as required by [AGENTS.md](../../../AGENTS.md) Section 3 for Podman container execution.

### 6.3 Expected Red Phase Test Results
- All existing Phase 1 and Phase 2 tests continue passing.
- Exactly 4 new Phase 3 security regression tests FAIL:
  1. `FAIL`: `visit-photos` storage objects reject unauthenticated or non-viewer access to private visit photos (`bucket.public === false` fails and/or friend download of private visit photo succeeds instead of failing).
  2. `FAIL`: `handle_activity_ledger_entry` records `privacy_level = 'private'` when the user's profile is private (`received 'public'`).
  3. `FAIL`: `TripService.getTrips` query succeeds for authenticated users without encountering 42501 column privilege denial on `profiles.email` (throws `42501 permission denied for column "email" of table "profiles"`).
  4. `FAIL`: Authenticated callers can invoke `get_friend_activity_feed`, `get_friends_activity_for_winery`, and `get_friends_ratings_for_winery` without 42501 permission denied errors (fails with `42501`).
- Document and capture the exact Red failure output in the task log.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming the clean 4-test failure in the container runner:

### 7.1 Stage & Commit
```bash
git add lib/services/__tests__/supabase-rpc.integration.test.ts
git commit -m "test(db): add failing security regression tests for storage RLS, trigger privacy, and profiles.email decoupling (TDD Red phase)"
```

### 7.2 Attach Git Note
Obtain the commit SHA (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Write failing security regression tests for storage RLS & trigger privacy (TDD Red phase)
Summary: Added 4 security regression integration tests asserting visit-photos bucket privacy and private visit photo RLS enforcement, handle_activity_ledger_entry privacy inheritance from private user profiles, TripService.getTrips PostgREST execution without 42501 profiles.email privilege denial, and SECURITY INVOKER activity RPC execution (get_friend_activity_feed, get_friends_activity_for_winery, get_friends_ratings_for_winery) without 42501 errors. Confirmed all 4 tests fail on the baseline unhardened schema.
Files: lib/services/__tests__/supabase-rpc.integration.test.ts
Rationale: Strict TDD Red phase for Issue #93, Phase 3 establishing empirical regression baselines for private storage policies, activity ledger privacy triggers, and PostgREST profiles.email column privilege decoupling before authoring migration 20261104120000_harden_storage_and_webhooks.sql." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`:
- Change `[ ] Task: Write failing security regression tests for storage RLS & trigger privacy (TDD Red phase)` to `[x] Task: Write failing security regression tests for storage RLS & trigger privacy (TDD Red phase) [commit: <short_sha>]`.
- Stage `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`.
- Commit with: `conductor(plan): Mark task 'Write failing security regression tests for storage RLS & trigger privacy (TDD Red phase)' as complete`.

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `lib/services/__tests__/supabase-rpc.integration.test.ts` or any other repository files until explicit affirmative user approval is received via the `ask_question` modal.
