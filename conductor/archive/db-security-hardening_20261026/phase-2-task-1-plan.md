# Implementation Plan: Phase 2 Task 1 — Write Failing Security Regression Tests (TDD Red phase)

**Track:** `db-security-hardening_20261026` (Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87))  
**Phase:** 2 (Database Hardening & Security Regression)  
**Task:** 1 (Write Failing Security Regression Tests — TDD Red phase)  
**ADR Reference:** [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/db-security-hardening_20261026/spec.md](./spec.md)  
**Track Plan Reference:** [conductor/tracks/db-security-hardening_20261026/plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Establish authoritative failing integration test cases in `lib/services/__tests__/supabase-rpc.integration.test.ts` to empirically validate the 5 core database security boundaries defined in Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87) and [ADR-0007](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md):

1. **Zero `anon` Read Access:** Unauthenticated (`anon`) requests to `public.profiles`, `public.wineries`, `public.visits`, and user collections (`public.favorites`, `public.wishlist`) must be denied by RLS or return zero records.
2. **Winery Catalog Write Hardening:** Direct table `INSERT`, `UPDATE`, and `DELETE` on `public.wineries` by regular authenticated non-service-role clients must be denied with PostgreSQL error code `42501` (`insufficient_privilege`).
3. **`ensure_winery` Immutability & Conflict Backfill:** `ensure_winery` must preserve existing canonical non-null attributes (`name`, `address`, `latitude`, `longitude`, `phone`, `website`, `google_rating`) on place ID conflict, only backfill missing (`NULL`) attributes, normalize positive ratings, support place ID aliasing (`google_place_id` and `id`), and reject unauthenticated execution.
4. **Composite `(user_id, idempotency_key)` Isolation:** Write operations (`log_visit`, `create_trip`) using `idempotency_key` must be scoped per user so that key reuse across different users does not collide, block execution, or leak records, and unauthenticated execution is rejected with `'Not authenticated'`.
5. **Profile Email Redaction:** `get_friend_profile_with_visits` must redact (`NULL`) the target user's email for non-friends and unauthenticated callers, returning email only when the viewer is the profile owner or an accepted friend.

### 1.2 Development Methodology: Strict TDD Red Phase
In compliance with `conductor/workflow.md` and the TDD Task Granularity Invariant (`AGENTS.md` Section 5):
- All 5 test cases will be authored and run against the **current unhardened database schema**.
- Each of the 5 test cases is designed to expose existing security vulnerabilities and fail on the baseline schema (Red phase).
- Implementation of database hardening migrations is strictly reserved for Phase 2 Task 2 (Green phase).

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety (`AGENTS.md` Critical Guardrail 1):**
   - Absolutely zero migrations, DDL, or DML mutations executed against the remote Supabase project (`jfsxclrdxmvftxacjuqf`).
   - All integration tests execute against the local containerized Supabase instance (`http://127.0.0.1:54321`).
2. **Containerized Test Execution (`AGENTS.md` Section 3):**
   - Host RHEL 8 glibc (2.28) is incompatible with native SWC. All Jest integration tests must execute via the Podman container runner:
     `npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`
   - Container execution requires `BypassSandbox: true`.
3. **TDD Red Phase Invariant (`conductor/workflow.md`):**
   - Tests must be executed and confirmed failing before committing.
   - Commit scope must be strictly `test(db): ...`. No application code or database migrations are authored in this task.
4. **Test Fixture Hygiene & Teardown Integrity:**
   - Any winery place IDs created during tests must be registered in the existing `createdWineryIds` array to ensure cleanup via `afterAll`.
   - Test users (`user1`, `user2`, `user3`) and their cascades must be preserved for existing suite runs and torn down cleanly in `afterAll`.
5. **Modal Approval Invariant (`conductor_antigravity.md`):**
   - The planning phase must halt and request explicit user confirmation via the `ask_question` modal before any test file is modified on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target Test Suite
- **Path:** `lib/services/__tests__/supabase-rpc.integration.test.ts`
- **Action:** Append 5 security regression integration test cases.
- **Semantic Insertion Anchor:** Inside `describe('Security & Privilege Hardening', () => { ... })` (starting at line 510), immediately following the existing test `should deny execution of bulk_upsert_wineries RPC to anonymous and non-service-role clients` (line 579), prior to closing `});` at line 580.

---

## 4. TypeScript Interfaces & Type Blueprints

The following interfaces describe the data shapes, RPC parameters, and return signatures used across the 5 test assertions:

```typescript
// 1. Winery Canonical & Conflict Payloads
export interface WineryConflictPayload {
  id?: string;
  google_place_id?: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
}

export interface EnsureWineryRpcResponse {
  data: number | null;
  error: {
    message: string;
    code?: string;
    details?: string;
  } | null;
}

// 2. Visit Logging & Idempotency Payloads
export interface VisitRpcPayload {
  visit_date: string;
  rating: number;
  user_review: string;
  photos?: string[];
  is_private?: boolean;
}

export interface LogVisitRpcResponse {
  visit_id: number;
  winery_id: number;
}

// 3. Friend Profile & Email Redaction Response
export interface FriendProfileResponse {
  profile: {
    id: string;
    name: string | null;
    email: string | null;
    privacy_level: 'public' | 'friends_only' | 'private';
  };
  visits: Array<{
    id: number;
    visit_date: string;
    rating: number;
    user_review: string;
  }>;
  stats: {
    visit_count: number;
    wishlist_count: number;
    favorite_count: number;
  };
}

// 4. PostgreSQL PostgREST Error Shape
export interface PostgrestSecurityError {
  code: string; // e.g. '42501' for insufficient privilege
  message: string;
  details: string | null;
  hint: string | null;
}
```

---

## 5. Precise Behavioral Logic & Test Scenarios

### Test Case 1: Unauthenticated (`anon`) Access Denial Across Core Collections
- **Objective:** Verify that clients without a signed-in session (`anonClient`) cannot read user profiles, wineries, visits, or collections (`favorites`, `wishlist`).
- **Setup:** Use `anonClient` (initialized with `anonKey` and `auth.persistSession: false`). Ensure `user1` has a profile, visit, favorite, and wishlist entry in the local database.
- **Execution & Invariant Assertions:**
  1. `anonClient.from('profiles').select('id, name, email')`:
     - Assert either `error` has `code === '42501'` OR `data` is empty array `[]`.
     - Invariant: Zero profiles or user emails returned.
  2. `anonClient.from('wineries').select('id, name')`:
     - Assert either `error` has `code === '42501'` OR `data` is empty array `[]`.
     - Invariant: Zero wineries returned to unauthenticated visitors.
  3. `anonClient.from('visits').select('id, user_review')`:
     - Assert either `error` has `code === '42501'` OR `data` is empty array `[]`.
  4. `anonClient.from('favorites').select('*')`:
     - Assert either `error` has `code === '42501'` OR `data` is empty array `[]`.
  5. `anonClient.from('wishlist').select('*')`:
     - Assert either `error` has `code === '42501'` OR `data` is empty array `[]`.
- **Expected Failure on Baseline Schema (Red):**
  - Baseline policy `"Anyone can view wineries"` and default `SELECT` grant on `public.wineries` allow `anonClient` to read all wineries (`data.length > 0`).
  - Baseline `is_visible_to_viewer` allows `anonClient` to read public profiles and their visits/favorites/wishlist.

### Test Case 2: Direct Table `INSERT` Denial on `public.wineries` for Authenticated Users
- **Objective:** Verify that regular signed-in users cannot bypass `ensure_winery` to directly insert records into `public.wineries`.
- **Setup:** Generate unique `testPlaceId = "test-direct-insert-" + crypto.randomUUID()`.
- **Execution & Invariant Assertions:**
  1. Authenticated `user1.client.from('wineries').insert({ google_place_id: testPlaceId, name: 'Direct Malicious Winery', address: '123 Fake Rd', latitude: 42.5, longitude: -77.0 })`.
  2. Assert `error` is NOT null.
  3. Assert `error.code === '42501'` (insufficient_privilege).
  4. Query `adminClient.from('wineries').select('id').eq('google_place_id', testPlaceId).maybeSingle()`:
     - Assert `data` is null (no record inserted).
- **Expected Failure on Baseline Schema (Red):**
  - Baseline policy `"Authenticated users can insert wineries"` exists and `authenticated` role possesses table `INSERT` privilege, so the insert succeeds without error (`error === null`).

### Test Case 3: `ensure_winery` Immutability & Conflict Backfill
- **Objective:** Verify that `ensure_winery` protects existing catalog data from being tampered with or overwritten by users, only backfilling missing fields, normalizing ratings, handling place ID aliasing, and rejecting unauthenticated callers.
- **Setup:**
  - Seed canonical winery via `adminClient`:
    - `google_place_id`: unique place ID.
    - `name`: `'Canonical Finger Lakes Winery'`.
    - `address`: `'100 Classic Trail'`.
    - `latitude`: `42.5000`.
    - `longitude`: `-76.8000`.
    - `phone`: `'607-555-0199'`.
    - `website`: `null` (explicitly null to verify backfilling).
    - `google_rating`: `4.9`.
  - Push place ID to `createdWineryIds` for cleanup.
- **Execution & Invariant Assertions:**
  1. **Tampering Attempt via Authenticated User:**
     - `user1.client.rpc('ensure_winery', { p_winery_data: { google_place_id: placeId, name: 'Hacked Winery Name', address: '999 Overwrite St', latitude: 0.0, longitude: 0.0, phone: '000-000-0000', website: 'https://canonical-flx.example.com', rating: 1.0 } })`.
     - Inspect record via `adminClient`:
       - `name` remains `'Canonical Finger Lakes Winery'` (NOT overwritten).
       - `address` remains `'100 Classic Trail'` (NOT overwritten).
       - `latitude` remains `42.5000` and `longitude` remains `-76.8000`.
       - `phone` remains `'607-555-0199'`.
       - `website` is updated to `'https://canonical-flx.example.com'` (null successfully backfilled!).
       - `google_rating` remains `4.9` (positive rating preserved).
  2. **Place ID Aliasing (`id` vs `google_place_id`):**
     - Verify `p_winery_data` with `id: placeId` resolves to the existing record without inserting a duplicate.
  3. **Unauthenticated Access Denial:**
     - `anonClient.rpc('ensure_winery', { p_winery_data: ... })`.
     - Assert `error` is NOT null (rejection with `'Not authenticated'` or `42501`).
- **Expected Failure on Baseline Schema (Red):**
  - Baseline `ensure_winery` in `20260901000000_fix_winery_ratings_and_staleness.sql` executes:
    `DO UPDATE SET name = EXCLUDED.name, google_rating = ...`
    which unconditionally overwrites `name` with `'Hacked Winery Name'`.
  - Baseline `ensure_winery` does not backfill `website`, lacks caller authentication checks, and does not accept `google_place_id` in the insert clause.

### Test Case 4: Composite `(user_id, idempotency_key)` Isolation & Auth Check
- **Objective:** Verify that write idempotency keys are isolated per user account, allowing two distinct users to use identical keys without collision or data leakage, and requiring caller authentication.
- **Setup:**
  - Distinct authenticated users `user1` and `user2`.
  - Generate shared idempotency key: `const sharedKey = crypto.randomUUID()`.
  - Winery A (`placeIdA`) and Winery B (`placeIdB`), registered in `createdWineryIds`.
- **Execution & Invariant Assertions:**
  1. **Unauthenticated Auth Guard:**
     - `anonClient.rpc('log_visit', { p_winery_data: wineryA, p_visit_data: visitData, p_idempotency_key: sharedKey })`.
     - Assert `error` is NOT null (`'Not authenticated'`).
  2. **User 1 First Write with `sharedKey`:**
     - `user1.client.rpc('log_visit', { p_winery_data: wineryA, p_visit_data: visitData, p_idempotency_key: sharedKey })`.
     - Assert `user1` succeeds with `visit_id_1`.
  3. **User 2 Cross-User Write with Same `sharedKey`:**
     - `user2.client.rpc('log_visit', { p_winery_data: wineryB, p_visit_data: visitData, p_idempotency_key: sharedKey })`.
     - Assert `user2` succeeds with `visit_id_2`.
     - Invariant: `visit_id_2 !== visit_id_1` (User 2 is NOT returned User 1's visit record).
  4. **Database State Verification via `adminClient`:**
     - Verify two distinct records exist in `public.visits` with `idempotency_key = sharedKey`, one owned by `user1.id` and one owned by `user2.id`.
  5. **Intra-User Replay (True Idempotency):**
     - `user2.client.rpc('log_visit', { p_winery_data: wineryB, p_visit_data: visitData, p_idempotency_key: sharedKey })`.
     - Assert returns `visit_id_2` (exact replay for identical user).
- **Expected Failure on Baseline Schema (Red):**
  - Baseline schema enforces a global `UNIQUE (idempotency_key)` on `public.visits`.
  - Baseline `log_visit` does NOT scope `WHERE idempotency_key = p_idempotency_key` by `user_id = auth.uid()`.
  - Consequently, User 2 calling `log_visit` with `sharedKey` receives User 1's `visit_id_1` and User 1's winery ID (data leakage), or fails with a uniqueness collision.

### Test Case 5: Profile Email Redaction for Non-Friends & Unauthenticated Callers
- **Objective:** Verify that `get_friend_profile_with_visits` redacts (`NULL`) the user's email address when queried by a non-friend or unauthenticated caller, while returning the email to friends and the profile owner.
- **Setup:**
  - `user1` has a profile with `email = user1.email`.
  - `user3` is an authenticated user who is NOT a friend of `user1` (verified via delete in `public.friends`).
  - Set `user1` profile to `privacy_level = 'public'` so the profile object itself is accessible.
- **Execution & Invariant Assertions:**
  1. **Non-Friend Query:**
     - `user3.client.rpc('get_friend_profile_with_visits', { p_friend_id: user1.id })`.
     - Assert call succeeds without database error.
     - Assert `data.profile.id === user1.id`.
     - Invariant: `data.profile.email === null` (email redacted!).
  2. **Unauthenticated Query:**
     - `anonClient.rpc('get_friend_profile_with_visits', { p_friend_id: user1.id })`.
     - Assert call returns error or access denied.
  3. **Self Query (Owner Visibility):**
     - `user1.client.rpc('get_friend_profile_with_visits', { p_friend_id: user1.id })`.
     - Assert `data.profile.email === user1.email` (owner sees own email).
- **Expected Failure on Baseline Schema (Red):**
  - Baseline `get_friend_profile_with_visits` in `20260528000000_v2.11.0-stable.sql` constructs:
    ```sql
    SELECT jsonb_build_object(
      'profile', jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'email', p.email,
        'privacy_level', p.privacy_level
      ), ...
    ```
  - `p.email` is returned unconditionally to any caller who passes `is_visible_to_viewer`. Non-friend `user3` receives `user1.email`, failing the redaction assertion.

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

*Note on execution:* This command runs with `BypassSandbox: true` to permit the Podman container runner to access the host container socket and network.

### 6.3 Expected Red Phase Test Results
- Existing baseline tests in `supabase-rpc.integration.test.ts` pass.
- Exactly 5 new security regression tests FAIL:
  1. `FAIL`: Unauthenticated access denial (Anon client reads wineries/profiles).
  2. `FAIL`: Direct INSERT on `public.wineries` (Authenticated insert succeeds instead of receiving `42501`).
  3. `FAIL`: `ensure_winery` catalog immutability (Winery name is overwritten with tampered name).
  4. `FAIL`: Composite `(user_id, idempotency_key)` isolation (Cross-user key collision or leaked visit record).
  5. `FAIL`: Profile email redaction (Non-friend receives raw email address).
- Document and capture the exact failure output in the task log.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming the clean 5-test failure in the container runner:

### 7.1 Stage & Commit
```bash
git add lib/services/__tests__/supabase-rpc.integration.test.ts
git commit -m "test(db): add failing security regression tests for RLS, catalog immutability, and idempotency (TDD Red phase)"
```

### 7.2 Attach Git Note
Obtain the commit SHA (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Write Failing Security Regression Tests (TDD Red phase)
Summary: Added 5 comprehensive security regression integration tests asserting zero anon access, winery direct insert denial (42501), ensure_winery catalog immutability and null backfilling, composite (user_id, idempotency_key) isolation, and non-friend profile email redaction. Confirmed all 5 tests fail on the unhardened schema.
Files: lib/services/__tests__/supabase-rpc.integration.test.ts
Rationale: TDD Red phase for Issue #87 and ADR-0007 establishing strict empirical regression baselines before introducing the database hardening migration." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/db-security-hardening_20261026/plan.md`:
- Change `[ ] Task: Write Failing Security Regression Tests (TDD Red phase)` to `[x] Task: Write Failing Security Regression Tests (TDD Red phase) [commit: <short_sha>]`.
- Stage `conductor/tracks/db-security-hardening_20261026/plan.md`.
- Commit with: `conductor(plan): Mark task 'Write Failing Security Regression Tests (TDD Red phase)' as complete`.

---

## 8. Confirmation Gate

Halt immediately. Do NOT modify `lib/services/__tests__/supabase-rpc.integration.test.ts` or any other repository files until explicit affirmative user approval is received via the `ask_question` modal.
