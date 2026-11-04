# Specification: PostgREST Direct Table RLS, Storage Policies, Trip/Friend Membership Validation, and Webhook Hardening

**Tracking:** Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93)  
**ADR Reference:** [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)  
**Domain Context:** [CONTEXT.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/CONTEXT.md)  
**Type:** Security & Hardening  

## 1. Overview
A comprehensive security audit of database tables, RLS policies, RPCs, Storage, and webhooks revealed critical access control gaps that remain unaddressed following Issue #87:
1. **Unilateral Friendship Acceptance via Direct PostgREST `INSERT` on `public.friends` (Critical / P0):** signed-in users can directly POST `{"user1_id": auth.uid(), "user2_id": victim, "status": "accepted"}` to bypass bilateral consent.
2. **Public `visit-photos` Storage Bucket & Private Photo Exposure (High / P0):** `visit-photos` bucket is currently public (`public = true`), direct URLs bypass RLS, `storage.objects` SELECT does not check visit privacy, and no MIME type or file size constraints are enforced.
3. **Direct `profiles.email` Exposure, Mutation & Wildcard Hijacking (High / P1):** authenticated users can update their own email to squat addresses, direct SELECT exposes emails, and ILIKE wildcard matching enables blind enumeration.
4. **Non-Consensual `trip_members` Injection & Permanent Trip Spam (High / P1):** trip owners can insert arbitrary non-friend users, and non-owner members cannot leave trips.
5. **Direct `INSERT` on `public.wineries` & Cache Poisoning (High / P1):** table write grants remain active, and `ensure_winery` lacks coordinate, rating, and URL protocol validation.
6. **Webhook GUC Priority & Trigger Privacy Hardening (High / P1):** webhook notification prioritizes `app.settings` over `vault.decrypted_secrets`, activity ledger entries default to public if user profile is private, and SECURITY DEFINER functions omit `pg_temp` in `search_path`.
7. **Security Advisor Linter Expansion:** linter harness only checks categories 0026–0029, leaving 0007 (RLS disabled with policy), 0008 (RLS enabled no policy), and 0010 (SECURITY DEFINER view) unasserted.

This specification defines the comprehensive hardening migration, trigger and RPC updates, Security Advisor test suite expansion, and integration test verifications to resolve Issue #93.

## 2. Domain & Architectural Invariants
- **Visibility Level (CONTEXT.md):** Direct table queries via PostgREST cannot bypass intended visibility. Unauthenticated users (`anon`) have zero access to database tables or storage objects.
- **Bilateral Friendship Consent:** Friend relationships require explicit consent. A user cannot unilaterally force `status = 'accepted'` via direct `INSERT` on `public.friends`.
- **Private Storage Bucket Invariant:** `visit-photos` must be private (`public = false`) and only accessible via authenticated signed URLs verified against visit ownership/visibility.
- **Profile Email Privacy & Immutability:** Users cannot mutate `email` directly on `profiles` (must be managed by Supabase auth triggers). Direct SELECT of `email` by other users is denied. Email lookups in RPCs must match exact normalized lower-case email, preventing wildcard enumeration.
- **Trip Membership Consent & Autonomous Exit:** Trip owners cannot inject arbitrary non-friend users into trips. Added trip members must be accepted mutual friends. Trip members can voluntarily delete their own membership record.
- **Catalog Integrity & Input Validation:** `wineries` catalog table is read-only for client roles. `ensure_winery` validates latitude (-90 to 90), longitude (-180 to 180), rating (0 to 5), and HTTP(S) URLs.
- **Safe Search Path:** All SECURITY DEFINER functions must include `pg_temp` at the end of `SET search_path = public, auth, pg_temp` to prevent search-path injection.
- **Expand-and-Contract & Production Safety (AGENTS.md):** Never drop or mutate production data unsafely. Local DB verification only (`npm run db:reset`).

## 3. Functional Requirements

### 3.1 `public.friends` Access Control Hardening
- Enforce self-friendship prohibition: `CHECK (user1_id <> user2_id)`.
- Enforce bidirectional uniqueness: unique pair index on `(LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id))`.
- Restrict `INSERT` RLS to: `auth.uid() = user1_id AND status = 'pending'`.
- Restrict `UPDATE` RLS to: `auth.uid() = user2_id AND status = 'pending' WITH CHECK (status IN ('accepted', 'declined'))`.

### 3.2 `visit-photos` Storage Hardening
- Update `storage.buckets` configuration for `visit-photos`: `public = false`, `file_size_limit = 10485760` (10MB), and `allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']`.
- Update `storage.objects` `SELECT` policy for `visit-photos`:
  - Permit access if `auth.uid()::text = (storage.foldername(name))[1]`.
  - Permit access for friends/viewers only when the photo belongs to a visit visible to the viewer via `public.is_visible_to_viewer(v.user_id, v.is_private)`.

### 3.3 `public.profiles` Direct Access & Email Protection
- Revoke `UPDATE (id, email) ON public.profiles FROM authenticated`.
- Restrict direct `SELECT` on `public.profiles` to `auth.uid() = id` (or revoke `SELECT (email)` from `authenticated`) so non-self profiles must be retrieved through established secure RPCs.
- Replace `WHERE email ILIKE TRIM(p_email)` with `WHERE LOWER(email) = LOWER(TRIM(p_email))` in `add_trip_member_by_email` and `send_friend_request`.
- Enforce a unique index on `LOWER(email)`: `CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_lower_email ON public.profiles (LOWER(email));`.

### 3.4 `public.trip_members` Consent & Autonomous Exit
- Restrict `trip_members` `INSERT` policy: require added member to be either `auth.uid()` (trip owner) OR an accepted mutual friend (`status = 'accepted'`).
- Restrict `trip_members` `DELETE` policy: allow the trip owner OR the member themselves (`user_id = auth.uid()`) to delete the membership row.
- Update `create_trip_with_winery` and `add_trip_member_by_email` to reject adding non-mutual-friend users.

### 3.5 `public.wineries` Immutability & Validation in `ensure_winery`
- Drop permissive `Authenticated users can insert wineries` RLS policy if still present, and revoke `INSERT, UPDATE, DELETE, TRUNCATE` on `public.wineries` from `anon, authenticated`.
- In `ensure_winery(p_winery_data jsonb)`:
  - Validate latitude is between -90 and 90, longitude is between -180 and 180.
  - Validate rating is between 0 and 5.
  - Validate website matches `^https?://` if provided.

### 3.6 Webhook GUC Priority & Trigger Privacy Hardening
- In `handle_activity_ledger_notification()`:
  - Read `vault.decrypted_secrets` before falling back to `current_setting('app.settings.supabase_url', true)`.
  - Validate webhook URL domain matches allowable endpoints.
- In `handle_activity_ledger_entry()`:
  - Set `v_privacy_level := 'private'` if `NEW.is_private OR v_user_privacy = 'private'`.
- Audit and append `, pg_temp` to `SET search_path = public, auth, pg_temp` across all `SECURITY DEFINER` functions.

### 3.7 Security Advisor Linter Harness Expansion
- Expand `scripts/db/verify-security-advisor.sql` and `scripts/db/verify-security-advisor.ts` (`npm run db:verify-advisor`) to assert zero violations on:
  - `0007_policy_exists_rls_disabled`: Assert all public tables have RLS enabled (`relrowsecurity = true`).
  - `0008_rls_enabled_no_policy`: Assert all tables with RLS enabled have explicit access policies.
  - `0010_security_definer_view`: Assert zero database views bypass caller RLS via `SECURITY DEFINER` semantics.
- Verify zero warnings pass alongside categories 0026–0029 within `npm run db:audit`.

### 3.8 Client & Integration Test Synchronization
- Regenerate database types via `npm run db:gen-types`.
- Add integration test assertions in `lib/services/__tests__/supabase-rpc.integration.test.ts` covering:
  1. Unilateral friendship acceptance blocked via PostgREST.
  2. Storage policy blocks unauthorized/private visit photo access.
  3. Profile email update blocked for authenticated role.
  4. Exact lower-case email lookup required (wildcard injection fails).
  5. Arbitrary non-friend trip member addition blocked; self-removal permitted.
  6. `ensure_winery` input validation (coordinates, rating, website URL).
  7. Activity ledger privacy inheritance for private profile owners.

## 4. Acceptance Criteria
1. Migration applies cleanly on local stack via `npm run db:reset`.
2. `npm run db:verify-advisor` passes with 0 violations across categories 0007, 0008, 0010, 0026, 0027, 0028, and 0029.
3. `npm run db:check-types:local` passes without errors.
4. Containerized unit and integration test suites (`npm run test:container`, `npm run test:integration:container`) pass completely.
5. Direct PostgREST attacks (unilateral friendship accept, profile email overwrite, non-friend trip injection, private photo enumeration) are proven blocked by tests.

## 5. Out of Scope
- Performance advisor categories 0001 (unindexed foreign keys) and 0003 (auth RLS initplan), cataloged separately as Tier 4 tech debt.
- HaveIBeenPwned k-anonymity validation during signup (Issue #88).
