# Implementation Plan: Phase 3 Task 2 — Implement Private Storage, Ledger Privacy & Webhook Hardening Migration (TDD Green phase)

**Track:** `postgrest-rls-storage-hardening_20261104` (Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93))  
**Phase:** 3 (Private Storage, Ledger Privacy & Webhook Resilience — Storage & Triggers)  
**Task:** 2 (Implement Private Storage, Ledger Privacy & Webhook Hardening Migration — TDD Green phase)  
**Preceding Context:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/phase-3-task-1-plan.md](./phase-3-task-1-plan.md)  
**ADR References:** [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md), [docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/spec.md](./spec.md)  
**Track Plan Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Transition all 4 failing security regression test cases established in Phase 3 Task 1 ([commit `82521989`](https://github.com/jarredb9/finger-lakes-app-57/commit/8252198930e324e9ac9189577bb8ee1ee2fc9e34)) to passing (Green phase) by implementing:
1. **Private Storage & RLS Hardening (`visit-photos`):**
   - Update `storage.buckets` configuration for `visit-photos` to be private (`public = false`), enforce a 10MB limit (`file_size_limit = 10485760`), and restrict MIME types to standard images (`ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']`).
   - Create a GIN index on `public.visits (photos)` (`idx_visits_photos_gin`) to accelerate object visibility queries.
   - Replace the legacy `storage.objects` `SELECT` policy with an authenticated policy granting read access to the photo owner via path prefix (`(storage.foldername(name))[1] = auth.uid()::text`) or to viewers if the photo belongs to a visit visible to the viewer via `public.is_visible_to_viewer(v.user_id, v.is_private)`.
2. **Activity Ledger Privacy Inheritance:**
   - Update trigger function `public.handle_activity_ledger_entry()` to set `v_privacy_level := 'private'` when the visit/item is private OR when the user profile's privacy setting is `'private'` (`COALESCE(NEW.is_private, false) OR v_user_privacy = 'private'`).
   - Set explicit search path `search_path = public, auth, pg_temp;`.
3. **Webhook Fault Tolerance & URL Allowlist Hardening:**
   - Harden trigger function `public.handle_activity_ledger_notification()` to prioritize Supabase Vault (`vault.decrypted_secrets`) over `app.settings` for `supabase_url` and `service_role_key`.
   - Validate base URL against strict domain allowlist pattern (`^(https?://(localhost|127\.0\.0\.1|kong)(:[0-9]+)?|https://[a-zA-Z0-9_\-\.]+\.supabase\.co)$`).
   - Fail open with `RAISE WARNING` and `RETURN NEW;` on unconfigured/invalid URLs or dispatch failures, preventing external webhook issues from rolling back core database writes.
   - Set explicit search path `search_path = public, vault, net, pg_temp;`.
4. **Security Definer Function `search_path` Audit:**
   - Ensure all `SECURITY DEFINER` functions in schema `public` (`handle_new_user`, `handle_activity_ledger_entry`, `handle_activity_ledger_notification`, and the 7 allowlist RPCs) have `pg_temp` appended to their `search_path`.
5. **PostgREST Query & `SECURITY INVOKER` Column Privilege Decoupling (`profiles.email`):**
   - In `supabase/migrations/20261104120000_harden_storage_and_webhooks.sql`, decouple `profiles.email` from `get_friend_activity_feed` (project `NULL::text as user_email`), `get_friends_activity_for_winery` (project `p.id, p.name, NULL::text as email`), and `get_friends_ratings_for_winery` (project `'hidden'::text as email`).
   - In `lib/services/tripService.ts`, update `TripService.getTrips` to omit `email` from PostgREST `profiles ( name )` join and safely default `email: ''` in client mapper.

### 1.2 Development Methodology: Strict TDD Green Phase
In compliance with `conductor/workflow.md` and the TDD Task Granularity Invariant ([AGENTS.md](../../../AGENTS.md) Section 5):
- Implement the exact database migration and client adapter changes required to turn the Red phase tests Green.
- Re-apply migrations cleanly using `npm run db:reset`.
- Execute containerized integration tests to verify all 4 Phase 3 tests pass without regressions across Phase 1 and Phase 2.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety ([AGENTS.md](../../../AGENTS.md) Critical Guardrail 1):**
   - Absolutely zero migrations, DDL, or DML mutations executed against the remote Supabase project (`jfsxclrdxmvftxacjuqf`).
   - All migrations, resets, and tests run exclusively against local containerized Supabase (`http://127.0.0.1:54321`).
2. **Containerized Test Execution ([AGENTS.md](../../../AGENTS.md) Section 3):**
   - Run tests and container operations via Podman with `BypassSandbox: true`:
     `npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`
   - Database reset operations: `npm run db:reset`.
3. **Expand-and-Contract & Catalog Immutability (ADR-0007 & ADR-0010):**
   - Do not alter function signatures or return types in ways that break TypeScript interfaces or downstream API consumers.
   - Retain `email` field in RPC JSON projections and `TripMember` mappings as safe decoupled placeholders (`NULL`, `'hidden'`, or `''`).
4. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Halt immediately for affirmative user approval via the `ask_question` modal before creating or modifying repository files.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Database Migration
- **Path:** `supabase/migrations/20261104120000_harden_storage_and_webhooks.sql`
- **Semantic Insertion Anchor:** Entirely new migration file executed sequentially after `20261104110000_harden_trips_and_wineries.sql`.

### 3.2 Client Service Adapter
- **Path:** `lib/services/tripService.ts`
- **Semantic Insertion Anchors:**
  1. Lines 48–51: Inside PostgREST `select()` query for `trips`:
     ```typescript
     // Current (lines 48-51):
               profiles (
                   name,
                   email
               )
     // Target:
               profiles (
                   name
               )
     ```
  2. Line 111: Inside `formattedTrips` member mapper:
     ```typescript
     // Current (line 111):
               email: m.profiles?.email || ''
     // Target:
               email: ''
     ```

---

## 4. TypeScript Interfaces & Type Blueprints

The following interfaces define the contracts maintained across the client adapter, storage interactions, and decoupled RPC returns:

```typescript
/**
 * Trip member shape defined in lib/types.ts line 319.
 * Preserved with empty string default for email.
 */
export interface TripMember {
  id: string;
  role: 'owner' | 'member';
  status: 'invited' | 'joined';
  name: string;
  email: string;
}

/**
 * TripService getTrips return type contract.
 */
export interface GetTripsResult {
  trips: Array<{
    id: number;
    user_id: string;
    name?: string;
    trip_date: string;
    updated_at?: string;
    wineries_count: number;
    wineries: any[];
    members: TripMember[];
  }>;
  count: number;
}

/**
 * Storage bucket update payload for visit-photos.
 */
export interface StorageBucketConfig {
  id: 'visit-photos';
  name: 'visit-photos';
  public: false;
  file_size_limit: 10485760; // 10MB
  allowed_mime_types: string[]; // ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
}

/**
 * Activity feed item contract projected by get_friend_activity_feed.
 */
export interface DecoupledFriendActivityFeedItem {
  activity_type: string;
  created_at: string;
  activity_user_id: string;
  user_name: string;
  user_email: null; // Decoupled from profiles.email
  winery_id: number;
  winery_name: string;
  visit_rating?: number;
  visit_review?: string;
  visit_photos?: string[];
}

/**
 * Winery social activity contract projected by get_friends_activity_for_winery.
 */
export interface DecoupledFriendsActivityForWineryResponse {
  favoritedBy: Array<{
    id: string;
    name: string;
    email: null; // Decoupled from profiles.email
  }>;
  wishlistedBy: Array<{
    id: string;
    name: string;
    email: null; // Decoupled from profiles.email
  }>;
}

/**
 * Winery rating row projected by get_friends_ratings_for_winery.
 */
export interface DecoupledFriendRatingForWineryRow {
  user_id: string;
  name: string;
  email: string; // Projected as literal 'hidden'
  rating: number;
  user_review: string;
  photos: string[];
}
```

---

## 5. Precise Behavioral Logic & Migration Specifications

### 5.1 Storage Hardening (`visit-photos` & `storage.objects`)
1. **Bucket Configuration:**
   - Update `storage.buckets`:
     ```sql
     UPDATE storage.buckets
     SET public = false,
         file_size_limit = 10485760,
         allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
     WHERE id = 'visit-photos';
     ```
2. **Visits Photo GIN Index:**
   - Accelerate array containment lookup (`photos @> ARRAY[storage.objects.name]`):
     ```sql
     CREATE INDEX IF NOT EXISTS idx_visits_photos_gin ON public.visits USING GIN (photos);
     ```
3. **Storage Objects Policy Replacement:**
   - Drop existing policy `"Users can view their own and friends photos"` on `storage.objects`.
   - Create new policy:
     ```sql
     CREATE POLICY "Users can view their own and friends photos" ON storage.objects
     FOR SELECT TO authenticated
     USING (
       bucket_id = 'visit-photos' AND (
         (storage.foldername(name))[1] = auth.uid()::text
         OR EXISTS (
           SELECT 1 FROM public.visits v
           WHERE v.photos @> ARRAY[storage.objects.name]
             AND public.is_visible_to_viewer(v.user_id, v.is_private)
         )
       )
     );
     ```
   - **Behavioral Guarantees:**
     - Unauthenticated (`anon`): denied (no policy grants access).
     - Owner: permitted for all photos in their user directory (`foldername(name)[1] = auth.uid()`).
     - Non-owner friends: permitted ONLY if photo belongs to a visit visible to them under `is_visible_to_viewer(v.user_id, v.is_private)`. If `v.is_private = true`, friend access is denied.
     - Non-owner non-friends: denied by `is_visible_to_viewer`.

### 5.2 Activity Ledger Privacy Inheritance (`handle_activity_ledger_entry`)
1. **Trigger Logic Update:**
   - In `public.handle_activity_ledger_entry()`:
     ```sql
     -- Determine privacy level
     IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
         SELECT privacy_level::text INTO v_user_privacy FROM public.profiles WHERE id = NEW.user_id;
         
         IF COALESCE(NEW.is_private, false) OR v_user_privacy = 'private' THEN
             v_privacy_level := 'private';
         ELSIF v_user_privacy = 'friends_only' THEN
             v_privacy_level := 'friends_only';
         ELSE
             v_privacy_level := 'public';
         END IF;
     ...
     ```
2. **Search Path & Permissions:**
   - Set `SET search_path TO 'public', 'auth', 'pg_temp'`.
   - Maintain `OWNER TO postgres`, revoke from `PUBLIC, anon`, grant to `authenticated, service_role`.

### 5.3 Webhook Notification Hardening (`handle_activity_ledger_notification`)
1. **Secret & Base URL Priority:**
   - Check `vault.decrypted_secrets` first:
     ```sql
     BEGIN
       SELECT decrypted_secret INTO v_base_url 
       FROM vault.decrypted_secrets 
       WHERE name = 'supabase_url' 
       LIMIT 1;
     EXCEPTION WHEN OTHERS THEN
       v_base_url := NULL;
     END;
     ```
   - Fall back to `NULLIF(current_setting('app.settings.supabase_url', true), '')`.
   - Fall back to local Kong container `http://kong:8000`.
   - Perform identical Vault-first lookup for `service_role_key`.
2. **Domain Pattern Validation:**
   - Validate `v_base_url` against allowlist:
     ```sql
     IF v_base_url !~* '^(https?://(localhost|127\.0\.0\.1|kong)(:[0-9]+)?|https://[a-zA-Z0-9_\-\.]+\.supabase\.co)$' THEN
       RAISE WARNING 'handle_activity_ledger_notification: Invalid or unallowable webhook base URL: %', v_base_url;
       RETURN NEW;
     END IF;
     ```
3. **Fail-Open Error Handling:**
   - Wrap `net.http_post` in an exception block:
     ```sql
     BEGIN
       PERFORM net.http_post(...);
     EXCEPTION WHEN OTHERS THEN
       RAISE WARNING 'handle_activity_ledger_notification: Failed to dispatch webhook: %', SQLERRM;
     END;
     RETURN NEW;
     ```
4. **Search Path & Permissions:**
   - `SET search_path = public, vault, net, pg_temp;`.
   - Maintain `OWNER TO postgres`, revoke from `PUBLIC, anon, authenticated`, grant execute to `service_role`.

### 5.4 SECURITY DEFINER Function `search_path` Audit
- Explicitly enforce `SET search_path = public, auth, pg_temp` across `handle_new_user()` and verify all 7 boundary allowlist functions have `pg_temp`.
  ```sql
  ALTER FUNCTION public.handle_new_user() SET search_path = public, auth, pg_temp;
  ```

### 5.5 SECURITY INVOKER RPCs Column Privilege Decoupling
1. **`get_friend_activity_feed(integer)`:**
   - Replace `COALESCE(p.email, 'unknown')::text as user_email` with `NULL::text as user_email`.
   - Preserves `SECURITY INVOKER` and existing parameter/return signatures.
2. **`get_friends_activity_for_winery(integer)`:**
   - Replace `SELECT p.id, p.name, p.email` with `SELECT p.id, p.name, NULL::text as email` in both `v_favorited_by` and `v_wishlisted_by` subqueries.
   - Preserves `SECURITY INVOKER` and JSON return structure.
3. **`get_friends_ratings_for_winery(integer)`:**
   - Replace `COALESCE(p.email, 'hidden')::text as email` with `'hidden'::text as email`.
   - Preserves `SECURITY INVOKER` and `RETURNS TABLE(...)` column type `email text`.

### 5.6 TripService PostgREST Query Update (`lib/services/tripService.ts`)
1. In `TripService.getTrips`, change `profiles ( name, email )` to `profiles ( name )`.
2. In the `formattedTrips` member mapping, change `email: m.profiles?.email || ''` to `email: ''`.

---

## 6. Execution Verification Protocol

### 6.1 Database Reset & Migration Application
Run the local database reset to apply all migrations including `20261104120000_harden_storage_and_webhooks.sql`:

```bash
npm run db:reset
```
*(Requires `BypassSandbox: true` per [AGENTS.md](../../../AGENTS.md) Section 3).*

### 6.2 Test Execution Command
Run the containerized integration tests against the target test suite:

```bash
npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts
```
*(Requires `BypassSandbox: true` per [AGENTS.md](../../../AGENTS.md) Section 3).*

### 6.3 Expected Green Phase Test Results
- All existing Phase 1 and Phase 2 test assertions pass.
- All 4 Phase 3 security regression assertions pass:
  1. `PASS`: `visit-photos` bucket privacy (`public = false`) and private visit photo RLS rejection for friend/non-friend callers.
  2. `PASS`: `handle_activity_ledger_entry` privacy inheritance (`privacy_level = 'private'`) for private profile owners.
  3. `PASS`: `TripService.getTrips` execution without 42501 column privilege errors on `profiles.email`.
  4. `PASS`: Authenticated execution of `get_friend_activity_feed`, `get_friends_activity_for_winery`, and `get_friends_ratings_for_winery` without 42501 errors.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming all tests pass cleanly:

### 7.1 Stage & Commit
```bash
git add supabase/migrations/20261104120000_harden_storage_and_webhooks.sql lib/services/tripService.ts
git commit -m "feat(db): implement private storage, ledger privacy, webhook hardening, and profiles.email decoupling (TDD Green phase)"
```

### 7.2 Attach Git Note
Obtain the commit SHA (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Implement private storage, ledger privacy & webhook hardening migration (TDD Green phase)
Summary: Implemented migration 20261104120000_harden_storage_and_webhooks.sql to configure visit-photos as a private bucket with GIN-indexed object RLS, inherit privacy_level = 'private' in handle_activity_ledger_entry for private profile owners, harden handle_activity_ledger_notification with Vault priority and fail-open domain validation, append pg_temp across SECURITY DEFINER search paths, and decouple profiles.email from SECURITY INVOKER activity RPCs and TripService.getTrips client queries. All 4 Phase 3 security regression tests pass cleanly.
Files: supabase/migrations/20261104120000_harden_storage_and_webhooks.sql, lib/services/tripService.ts
Rationale: Fulfills Issue #93 Phase 3 (Storage, Triggers & Webhook Resilience) following ADR-0007 and ADR-0010, transitioning all failing Phase 3 regression tests to Green." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`:
- Mark `[ ] Task: Implement private storage, ledger privacy & webhook hardening migration (TDD Green phase)` as `[x]` with commit hash.
- Stage `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`.
- Commit with: `conductor(plan): Mark task 'Implement private storage, ledger privacy & webhook hardening migration (TDD Green phase)' as complete`.

---

## 8. Confirmation Gate

Halt immediately. Do NOT create or modify `supabase/migrations/20261104120000_harden_storage_and_webhooks.sql`, `lib/services/tripService.ts`, or any other repository files until explicit affirmative user approval is received via the `ask_question` modal.
