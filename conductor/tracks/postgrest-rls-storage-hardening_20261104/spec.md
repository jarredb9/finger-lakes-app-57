# Specification: PostgREST Direct Table RLS, Storage Policies, Trip/Friend Membership Validation, and Webhook Hardening

**Tracking:** Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93)  
**ADR References:** [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md), [docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md)  
**Domain Context:** [CONTEXT.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/CONTEXT.md)  
**Type:** Security & Hardening  

## 1. Overview
A comprehensive security audit of database tables, RLS policies, RPCs, Storage, and webhooks revealed critical access control gaps that remain unaddressed following Issue #87:
1. **Unilateral Friendship Acceptance via Direct PostgREST `INSERT` on `public.friends` (Critical / P0):** signed-in users can directly POST `{"user1_id": auth.uid(), "user2_id": victim, "status": "accepted"}` to bypass bilateral consent.
2. **Public `visit-photos` Storage Bucket & Private Photo Exposure (High / P0):** `visit-photos` bucket is currently public (`public = true`), direct URLs bypass RLS, `storage.objects` SELECT does not check visit privacy, and no MIME type or file size constraints are enforced.
3. **Direct `profiles.email` Exposure, Mutation & Wildcard Hijacking (High / P1):** authenticated users can update their own email to squat addresses, direct PostgREST SELECT exposes emails for public profiles, and ILIKE wildcard matching enables blind enumeration.
4. **Non-Consensual `trip_members` Injection & Permanent Trip Spam (High / P1):** trip owners can insert arbitrary non-friend users into trips, and non-owner members cannot leave trips.
5. **Direct `INSERT` on `public.wineries` & Cache Poisoning (High / P1):** `ensure_winery` lacks coordinate, rating, and URL protocol validation, allowing attackers to inject corrupted records into the catalog.
6. **Webhook GUC Priority & Trigger Privacy Hardening (High / P1):** webhook notification prioritizes `app.settings` over `vault.decrypted_secrets`, activity ledger entries default to public if user profile is private, and SECURITY DEFINER functions omit `pg_temp` in `search_path`.
7. **Security Advisor Linter Expansion:** linter harness only checks categories 0026–0029, leaving 0007 (RLS disabled with policy), 0008 (RLS enabled no policy), and 0010 (SECURITY DEFINER view) unasserted.

This specification defines the comprehensive hardening migrations (split into 3 cohesive domain slices: Friends & Profiles, Trips & Wineries, and Storage & Webhooks), trigger and RPC updates, Security Advisor test suite expansion, client adapter updates, and integration test verifications to resolve Issue #93 adhering to ADR-0007 and ADR-0010.

## 2. Domain & Architectural Invariants
- **Visibility Level (CONTEXT.md):** Direct table queries via PostgREST cannot bypass intended visibility. Unauthenticated users (`anon`) have zero access to database tables or storage objects.
- **Bilateral Friendship Consent (CONTEXT.md, ADR-0010):** Friend relationships require explicit bilateral consent. A user cannot unilaterally force `status = 'accepted'` via direct `INSERT` on `public.friends`.
- **Private Storage Bucket Invariant (CONTEXT.md, ADR-0010):** `visit-photos` must be private (`public = false`) and only accessible via authenticated signed URLs verified against visit ownership/visibility. Queries are accelerated by a GIN index on `public.visits (photos)`.
- **Profile Email Privacy & Immutability (ADR-0010):** Users cannot mutate `email` directly on `profiles` (must be managed by Supabase auth triggers). Direct SELECT of `email` by authenticated users is revoked (`REVOKE SELECT (email) ON public.profiles FROM authenticated`), preserving `is_visible_to_viewer` RLS for general profile attributes (name, avatar, privacy level) and avoiding elevating `get_friend_profile_with_visits` to `SECURITY DEFINER`. `ProfileService.fetchProfile` in client code resolves email via `supabase.auth.getUser()`. Email lookups in RPCs must match exact normalized lower-case email (`LOWER(email) = LOWER(TRIM(p_email))`), preventing wildcard enumeration.
- **Trip Membership Consent & Autonomous Exit (CONTEXT.md, ADR-0010):** Trip owners cannot inject arbitrary non-friend users into trips. Added trip members must be accepted mutual friends; violating this in `create_trip_with_winery` or `add_trip_member_by_email` raises an explicit exception. Non-owner trip members can voluntarily delete their own membership record from `public.trip_members`.
- **Catalog Integrity & Input Validation:** `ensure_winery` validates latitude (-90 to 90), longitude (-180 to 180), rating (0 to 5), and HTTP(S) URLs, raising exceptions on invalid payloads.
- **Webhook Resilience & Safe Search Path:** `handle_activity_ledger_notification` prioritizes `vault.decrypted_secrets` before `app.settings`, validates webhook URL domains against an allowlist, and fails open with a logged warning (`RAISE WARNING ...; RETURN NEW;`) to prevent webhook faults from aborting core visit/wishlist writes. All SECURITY DEFINER functions include `pg_temp` at the end of `SET search_path = public, auth, pg_temp`.
- **Expand-and-Contract & Production Safety (AGENTS.md):** Never drop or mutate production data unsafely. Local DB verification only (`npm run db:reset`).

## 3. Functional Requirements

### 3.1 `public.friends` Access Control Hardening
- Enforce self-friendship prohibition: `CHECK (user1_id <> user2_id)`.
- Enforce bidirectional uniqueness: unique pair index on `(LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id))`.
- Restrict `INSERT` RLS to: `auth.uid() = user1_id AND status = 'pending'`.
- Restrict `UPDATE` RLS to: `auth.uid() = user2_id AND status = 'pending' WITH CHECK (status IN ('accepted', 'declined'))`.

### 3.2 `visit-photos` Storage Hardening
- Update `storage.buckets` configuration for `visit-photos`: `public = false`, `file_size_limit = 10485760` (10MB), and `allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']`.
- Create GIN index on `public.visits (photos)`: `CREATE INDEX IF NOT EXISTS idx_visits_photos_gin ON public.visits USING GIN (photos);`.
- Update `storage.objects` `SELECT` policy for `visit-photos`:
  - Permit access if `(storage.foldername(name))[1] = auth.uid()::text`.
  - Permit access for viewers only when the photo belongs to a visit visible to the viewer:
    ```sql
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.photos @> ARRAY[storage.objects.name]
        AND public.is_visible_to_viewer(v.user_id, v.is_private)
    )
    ```

### 3.3 `public.profiles` Direct Access & Email Protection
- Revoke `UPDATE (id, email) ON public.profiles FROM authenticated`.
- Revoke `SELECT (email) ON public.profiles FROM authenticated`, ensuring direct PostgREST queries cannot harvest user email addresses while retaining `is_visible_to_viewer` RLS for general profile fields.
- Update `ProfileService.fetchProfile(userId)` in `lib/services/profileService.ts` to omit `email` from the PostgREST `select()` query and populate email from `supabase.auth.getUser()`.
- Replace `WHERE email ILIKE TRIM(p_email)` with `WHERE LOWER(email) = LOWER(TRIM(p_email))` in `add_trip_member_by_email` and `send_friend_request`.
- Enforce a unique index on `LOWER(email)`: `CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_lower_email ON public.profiles (LOWER(email)) WHERE email IS NOT NULL;`.

### 3.4 `public.trip_members` Consent & Autonomous Exit
- In `create_trip_with_winery`: check every UUID in `p_members`; if `u_id <> auth.uid()`, verify `EXISTS (SELECT 1 FROM public.friends WHERE status = 'accepted' AND ((user1_id = auth.uid() AND user2_id = u_id) OR (user2_id = auth.uid() AND user1_id = u_id)))`. If any member is not an accepted friend, `RAISE EXCEPTION 'Trip members must be accepted mutual friends';`.
- In `add_trip_member_by_email`: verify found target user is an accepted mutual friend of `auth.uid()`; raise explicit exception if not.
- Restrict `trip_members` `INSERT` policy: require added member to be either `auth.uid()` (trip owner) OR an accepted mutual friend (`status = 'accepted'`).
- Restrict `trip_members` `DELETE` policy: allow the trip owner OR the member themselves (`user_id = auth.uid()`) to delete the membership row.
- Update existing integration test in `lib/services/__tests__/supabase-rpc.integration.test.ts` to establish mutual friendship between `user1` and `user2` before creating the shared trip.

### 3.5 `public.wineries` Immutability & Validation in `ensure_winery`
- Validate `v_lat`: `IF v_lat IS NOT NULL AND (v_lat < -90 OR v_lat > 90) THEN RAISE EXCEPTION 'Latitude must be between -90 and 90'; END IF;`.
- Validate `v_lng`: `IF v_lng IS NOT NULL AND (v_lng < -180 OR v_lng > 180) THEN RAISE EXCEPTION 'Longitude must be between -180 and 180'; END IF;`.
- Validate `v_rating`: `IF v_rating IS NOT NULL AND (v_rating < 0 OR v_rating > 5) THEN RAISE EXCEPTION 'Rating must be between 0 and 5'; END IF;`.
- Validate `website`: `IF p_winery_data->>'website' IS NOT NULL AND trim(p_winery_data->>'website') <> '' AND p_winery_data->>'website' !~* '^https?://' THEN RAISE EXCEPTION 'Website must be a valid HTTP or HTTPS URL'; END IF;`.

### 3.6 Webhook GUC Priority & Trigger Privacy Hardening
- In `handle_activity_ledger_notification()`:
  - Read `vault.decrypted_secrets` before falling back to `current_setting('app.settings.supabase_url', true)` and local Kong fallback (`http://kong:8000`).
  - Validate webhook URL domain matches allowable patterns (`^(https?://(localhost|127\.0\.0\.1|kong)(:[0-9]+)?|https://[a-zA-Z0-9_\-\.]+\.supabase\.co)$`).
  - If URL is unconfigured or domain is invalid, log warning (`RAISE WARNING ...; RETURN NEW;`) rather than aborting transaction (fail open).
  - Read `vault.decrypted_secrets` for `service_role_key` before checking `app.settings.service_role_key`.
  - Set `search_path = public, vault, net, pg_temp;`.
- In `handle_activity_ledger_entry()`:
  - Set `v_privacy_level := 'private'` if `NEW.is_private OR v_user_privacy = 'private'`.
  - Set `search_path = public, auth, pg_temp;`.
- Audit and append `, pg_temp` to `SET search_path = public, auth, pg_temp` across all `SECURITY DEFINER` functions.

### 3.7 Security Advisor Linter Harness Expansion
- Expand `scripts/db/verify-security-advisor.sql` to assert zero violations on:
  - `0007_policy_exists_rls_disabled`: Assert all public tables have RLS enabled (`relrowsecurity = true`).
  - `0008_rls_enabled_no_policy`: Assert all tables with RLS enabled have explicit access policies.
  - `0010_security_definer_view`: Assert zero database views bypass caller RLS via `SECURITY DEFINER` semantics.
- Update `scripts/db/verify-security-advisor.ts` to include categories 0007, 0008, and 0010 in `SecurityAdvisorCategory`, scorecard results, and CLI linter assertions.
- Verify clean zero-warning pass alongside categories 0026–0029 within `npm run db:audit` / `npm run db:verify-advisor`.

### 3.8 Client & Integration Test Synchronization
- Update `lib/services/profileService.ts` to omit `email` from direct PostgREST `select()`.
- Regenerate database types via `npm run db:gen-types`.
- Add integration test assertions in `lib/services/__tests__/supabase-rpc.integration.test.ts` covering:
  1. Unilateral friendship acceptance blocked via PostgREST INSERT.
  2. Storage policy blocks unauthorized/private visit photo access.
  3. Profile email update and select blocked for authenticated role via PostgREST.
  4. Exact lower-case email lookup required (wildcard injection fails).
  5. Arbitrary non-friend trip member addition blocked; self-removal permitted.
  6. `ensure_winery` input validation (coordinates, rating, website URL).
  7. Activity ledger privacy inheritance for private profile owners.

## 4. Acceptance Criteria
1. Migration applies cleanly on local stack via `npm run db:reset`.
2. `npm run db:verify-advisor` passes with 0 violations across categories 0007, 0008, 0010, 0026, 0027, 0028, and 0029.
3. `npm run db:check-types:local` passes without errors.
4. Containerized unit and integration test suites (`npm run test:container`, `npm run test:integration:container`) pass completely.
5. Direct PostgREST attacks (unilateral friendship accept, profile email overwrite/select, non-friend trip injection, private photo enumeration) are proven blocked by tests.

## 5. Out of Scope
- Performance advisor categories 0001 (unindexed foreign keys) and 0003 (auth RLS initplan), cataloged separately as Tier 4 tech debt.
- HaveIBeenPwned k-anonymity validation during signup (Issue #88).
