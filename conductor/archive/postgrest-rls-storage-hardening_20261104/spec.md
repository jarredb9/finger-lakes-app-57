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
8. **Supabase Client Type Safety & Module Seams (High / P0 - Phase 6):** All 4 Supabase client factories (`client.ts`, `server.ts`, `admin.ts`, `auth-helper.ts`) omit the `<Database>` generic, causing every `.from()` and `.rpc()` query across stores and services to resolve to untyped `any`. In addition, `lib/shims.d.ts` shadows `react-map-gl/mapbox` with untyped `any` exports, and `lib/utils/pointer-capture-patch.ts` lacks `"use client"`, rendering the browser touch-emulation patch inoperative in Next.js Server Component boundaries (`app/layout.tsx`).
9. **CI/CD Verification Gaps & Docker Pull Reliability (High / P0 - Phase 7):** `.github/workflows/ci.yml` runs only `npm run test` (which excludes integration tests), silently omitting `npm run lint`, `npm run type-check`, `npm run test:integration`, `npm run test:functions`, and `npm run db:verify-advisor`. Furthermore, `send-social-notification` is omitted from production Edge Function deployments despite an active database trigger referencing it, and container runners lack retry backoff on network drops during `docker pull` / `podman pull`.
10. **Edge Function Authentication & Privacy Lockdown (Critical / P0 - Phase 8):** `search-wineries` and `get-winery-details` have `verify_jwt = false` in `supabase/config.toml` and lack authorization checks in their handlers, allowing unauthenticated callers to exhaust Google Places and Gemini API quotas and mutate catalog data. `get-winery-details` queries private `visits.user_review` using `service_role` without filtering `is_private = false` or `profiles.ai_enabled = true`, leaking private notes to Gemini and copying snippets verbatim into `public.wineries.generative_summary` via fallback logic. `send-social-notification` lacks bearer token/secret validation, acting as an unauthenticated friend-graph oracle.

This specification defines the comprehensive hardening migrations (split into 3 cohesive domain slices: Friends & Profiles, Trips & Wineries, and Storage & Webhooks), trigger and RPC updates, Security Advisor test suite expansion, client adapter updates, integration test verifications, client type-safety wiring, CI/CD verification circuits, and Edge Function authentication/privacy lockdowns to resolve Issue #93 adhering to ADR-0004, ADR-0007, and ADR-0010.

## 2. Domain & Architectural Invariants
- **Visibility Level (CONTEXT.md):** Direct table queries via PostgREST cannot bypass intended visibility. Unauthenticated users (`anon`) have zero access to database tables or storage objects.
- **Bilateral Friendship Consent (CONTEXT.md, ADR-0010):** Friend relationships require explicit bilateral consent. A user cannot unilaterally force `status = 'accepted'` via direct `INSERT` on `public.friends`.
- **Private Storage Bucket Invariant (CONTEXT.md, ADR-0010):** `visit-photos` must be private (`public = false`) and only accessible via authenticated signed URLs verified against visit ownership/visibility. Queries are accelerated by a GIN index on `public.visits (photos)`.
- **Profile Email Privacy & Immutability (ADR-0010):** Users cannot mutate `email` directly on `profiles` (must be managed by Supabase auth triggers). Direct SELECT of `email` by authenticated users is revoked (`REVOKE SELECT (email) ON public.profiles FROM authenticated`), preserving `is_visible_to_viewer` RLS for general profile attributes (name, avatar, privacy level) and avoiding elevating `get_friend_profile_with_visits` to `SECURITY DEFINER`. `ProfileService.fetchProfile` in client code resolves email via `supabase.auth.getUser()`. All `SECURITY INVOKER` functions (`get_friend_profile_with_visits`, `get_friend_activity_feed`, `get_friends_activity_for_winery`, `get_friends_ratings_for_winery`) and PostgREST client queries (`TripService.getTrips`) must not query or join `profiles.email` as `authenticated`, avoiding 42501 permission denied errors while projecting safe defaults (`NULL` or `'hidden'`). Email lookups in RPCs must match exact normalized lower-case email (`LOWER(email) = LOWER(TRIM(p_email))`), preventing wildcard enumeration.
- **Trip Membership Consent & Autonomous Exit (CONTEXT.md, ADR-0010):** Trip owners cannot inject arbitrary non-friend users into trips. Added trip members must be accepted mutual friends; violating this in `create_trip_with_winery` or `add_trip_member_by_email` raises an explicit exception. Non-owner trip members can voluntarily delete their own membership record from `public.trip_members`.
- **Catalog Integrity & Input Validation:** `ensure_winery` validates latitude (-90 to 90), longitude (-180 to 180), rating (0 to 5), and HTTP(S) URLs, raising exceptions on invalid payloads.
- **Webhook Resilience & Safe Search Path:** `handle_activity_ledger_notification` prioritizes `vault.decrypted_secrets` before `app.settings`, validates webhook URL domains against an allowlist, and fails open with a logged warning (`RAISE WARNING ...; RETURN NEW;`) to prevent webhook faults from aborting core visit/wishlist writes. All SECURITY DEFINER functions include `pg_temp` at the end of `SET search_path = public, auth, pg_temp`.
- **Strongly-Typed Database Seam:** All Supabase client factories (`client.ts`, `server.ts`, `admin.ts`, `auth-helper.ts`) must supply `<Database>` generic from `@/lib/database.types`. No `.from()` or `.rpc()` query in the application may resolve to untyped `any`.
- **Module Seam Integrity:** Official library type definitions must not be shadowed with `any` declarations in `lib/shims.d.ts`. Browser-only patches interacting with DOM APIs must be guarded with `"use client"` directives so they execute on the client rather than dead-code evaluating in Server Component boundaries.
- **CI/CD Gate Completeness & Failure Circuit:** Pull requests and automated workflows must enforce all static checks (`lint`, `type-check`), security verifications (`db:verify-advisor`), and functional test suites (Jest unit, Supabase RLS integration, and Deno edge functions) before build/deploy stages. All production Edge Functions must be tracked and deployed in CI.
- **Zero-Trust Edge Function Authentication:** Edge Functions servicing client requests must enforce caller authentication (`verify_jwt = true` in `config.toml` and explicit `supabase.auth.getUser()` token verification). Functions triggered by database webhooks must validate internal shared bearer secrets (`INTERNAL_WEBHOOK_SECRET`).
- **User Privacy & AI Opt-In Isolation (CONTEXT.md, ADR-0004):** Private visit reviews (`is_private = true`) and reviews from users who have not opted into AI (`profiles.ai_enabled = false`) must never be queried by service-role functions or passed to external AI models (Gemini). AI fallback summaries must never copy raw review snippets verbatim, must not hardcode regional assumptions ("Finger Lakes") on global winery records, and must avoid false freshness stamps on `last_enriched_at`.
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

### 3.6.1 SECURITY INVOKER & PostgREST profiles.email Decoupling
- In `supabase/migrations/20261104120000_harden_storage_and_webhooks.sql`:
  - Update `get_friend_activity_feed`: project `NULL::text as user_email` without querying `p.email`.
  - Update `get_friends_activity_for_winery`: project `p.id, p.name, NULL::text as email` without querying `p.email`.
  - Update `get_friends_ratings_for_winery`: project `'hidden'::text as email` without querying `p.email`, preserving the `RETURNS TABLE(user_id uuid, name text, email text, rating integer, user_review text, photos text[])` signature.
- In `lib/services/tripService.ts`:
  - Update `TripService.getTrips()` query to request `trip_members!inner ( user_id, role, status, profiles ( name ) )` instead of `profiles ( name, email )`.
  - In member transformation, default `email: ''` to preserve the return type contract.

### 3.7 Security Advisor Linter Harness Expansion
- Expand `scripts/db/verify-security-advisor.sql` to assert zero violations on:
  - `0007_policy_exists_rls_disabled`: Assert all public tables have RLS enabled (`relrowsecurity = true`).
  - `0008_rls_enabled_no_policy`: Assert all tables with RLS enabled have explicit access policies.
  - `0010_security_definer_view`: Assert zero database views bypass caller RLS via `SECURITY DEFINER` semantics.
- Update `scripts/db/verify-security-advisor.ts` to include categories 0007, 0008, and 0010 in `SecurityAdvisorCategory`, scorecard results, and CLI linter assertions.
- Verify clean zero-warning pass alongside categories 0026–0029 within `npm run db:audit` / `npm run db:verify-advisor`.

### 3.8 Client & Integration Test Synchronization
- Update `lib/services/profileService.ts` to omit `email` from direct PostgREST `select()`.
- Update `lib/services/tripService.ts` to omit `email` from `profiles` join query.
- Regenerate database types via `npm run db:gen-types`.
- Add integration test assertions in `lib/services/__tests__/supabase-rpc.integration.test.ts` covering:
  1. Unilateral friendship acceptance blocked via PostgREST INSERT.
  2. Storage policy blocks unauthorized/private visit photo access.
  3. Profile email update and select blocked for authenticated role via PostgREST.
  4. Exact lower-case email lookup required (wildcard injection fails).
  5. Arbitrary non-friend trip member addition blocked; self-removal permitted.
  6. `ensure_winery` input validation (coordinates, rating, website URL).
  7. Activity ledger privacy inheritance for private profile owners.
  8. `TripService.getTrips` query executes successfully for authenticated users without encountering 42501 column privilege denial.
  9. `get_friend_activity_feed`, `get_friends_activity_for_winery`, and `get_friends_ratings_for_winery` execute successfully for authenticated clients without encountering 42501 permission denied errors.

### 3.9 Phase 6: Supabase `<Database>` Typing & Module Seam Rigor
- **Supabase Client Generic Typing:**
  - Update `utils/supabase/client.ts` to import `Database` from `@/lib/database.types` and supply `<Database>` generic to `createBrowserClient<Database>(...)`.
  - Update `utils/supabase/server.ts` to import `Database` and supply `<Database>` generic to `createServerClient<Database>(...)`.
  - Update `utils/supabase/admin.ts` to import `Database` and supply `<Database>` generic to `createServerClient<Database>(...)`.
  - Update `utils/supabase/auth-helper.ts` to import `Database` and supply `<Database>` generic to `createServerClient<Database>(...)`.
  - Ensure all database queries through `.from()` and `.rpc()` yield strongly-typed records and compilation failures for missing or mismatched columns/tables.
- **Mapbox Type Declaration Cleanup (`lib/shims.d.ts`):**
  - Delete `declare module "react-map-gl/mapbox"` `any` block (lines 3-12) in `lib/shims.d.ts`.
  - Allow TypeScript to resolve native definitions and interfaces (`MapRef`, `Source`, `Layer`, `Marker`, `MapProvider`, `useMap`) directly from `react-map-gl/mapbox`.
- **Pointer-Capture Patch Client Boundary (`lib/utils/pointer-capture-patch.ts`):**
  - Add `"use client"` directive to `lib/utils/pointer-capture-patch.ts` so Next.js App Router packages and executes the defensive monkey-patch for `releasePointerCapture` and `setPointerCapture` inside browser runtime rather than dead-code evaluating in Server Component boundaries (`app/layout.tsx`).
- **Static Type Gate & Schema Discrepancy Remediation:**
  - Execute `npm run type-check`.
  - Resolve true parameter/column discrepancies uncovered across stores (`lib/stores/`), services (`lib/services/`), and tests once `<Database>` is bound.

### 3.10 Phase 7: Wire CI/CD Verification Gates & Docker Reliability
- **Complete CI Verification Matrix (`.github/workflows/ci.yml`):**
  - In `build` job:
    - Add `npm run lint` step to enforce ESLint rules (including `playwright/no-wait-for-timeout`).
    - Add `npm run type-check` step to enforce full TypeScript compile check across all app, test, and e2e files.
    - Add `denoland/setup-deno@v2` step (with `deno-version: v2.x`) and run `npm run test:functions` to verify Edge Functions in CI.
    - Add `npm run test:integration` step (executing RLS and RPC integration tests against booted local Supabase stack).
    - Add `npm run db:verify-advisor` step to prevent security advisor regressions in CI.
- **Edge Function Production Deployment Completeness:**
  - In `deploy` job: add deployment step for `send-social-notification`:
    ```yaml
    supabase functions deploy send-social-notification --remote=jfsxclrdxmvftxacjuqf --yes
    ```
    alongside `get-winery-details` and `search-wineries`.
- **Container Runner Exponential Backoff Retry (`scripts/containers/container-common.sh`):**
  - Update `ensure_container_image()` in `scripts/containers/container-common.sh` to wrap `podman pull` and `docker pull` commands in a 3-attempt loop with exponential backoff (2s, 4s, 8s) to prevent transient network errors from failing container runs.

### 3.11 Phase 8: Edge Function Authentication & Privacy Lockdown
- **Gateway JWT Verification & Handler Authorization:**
  - In `supabase/config.toml`: set `verify_jwt = true` for `[functions.search-wineries]` and `[functions.get-winery-details]`.
  - In `supabase/functions/search-wineries/index.ts`: extract `Authorization` header, verify caller identity via `supabaseClient.auth.getUser()`, and return HTTP 401 Unauthorized for missing or invalid tokens.
  - In `supabase/functions/get-winery-details/index.ts`: extract `Authorization` header, verify caller identity via `supabaseClient.auth.getUser()`, and return HTTP 401 Unauthorized for missing or invalid tokens.
- **Private Visit Review Isolation & AI Consent Guard:**
  - In `supabase/functions/get-winery-details/index.ts`: update in-app review queries on `visits`. Only select reviews where `visits.is_private = false` and where the reviewing user has `profiles.ai_enabled = true`. Never expose private visit reviews to external LLM services.
- **Generative Fallback Sanitization, Global Scope Alignment & Enrichment Freshness:**
  - In `supabase/functions/_shared/gemini.ts`:
    - Remove snippet copying of raw user reviews into `generative_summary` (`Guests frequently note: "${shortSnippet}"`).
    - Remove hardcoded "Finger Lakes" copy for wineries outside the Finger Lakes region (conforming to ADR-0004 global scope).
    - Ensure `generateSmartFallback` returns an error status / property so `get-winery-details` does not stamp `last_enriched_at` on fallbacks, preventing wineries from being locked in an un-enriched state for 30 days.
- **Webhook Authorization on Social Notifications:**
  - In `supabase/functions/send-social-notification/index.ts`: enforce authorization checking that requests provide a valid bearer token matching `INTERNAL_WEBHOOK_SECRET` or service authorization. Return HTTP 401 Unauthorized on invalid or missing credentials.

## 4. Acceptance Criteria
1. Migration applies cleanly on local stack via `npm run db:reset`.
2. `npm run db:verify-advisor` passes with 0 violations across categories 0007, 0008, 0010, 0026, 0027, 0028, and 0029.
3. `npm run db:check-types:local` passes without errors.
4. Containerized unit and integration test suites (`npm run test:container`, `npm run test:integration:container`) pass completely.
5. Direct PostgREST attacks (unilateral friendship accept, profile email overwrite/select, non-friend trip injection, private photo enumeration) are proven blocked by tests.
6. Authenticated callers to `TripService.getTrips`, `get_friend_activity_feed`, `get_friends_activity_for_winery`, and `get_friends_ratings_for_winery` execute cleanly without 42501 permission denied errors.
7. `npm run type-check` passes with `<Database>` generic active across all 4 Supabase client factories (`client.ts`, `server.ts`, `admin.ts`, `auth-helper.ts`).
8. `lib/shims.d.ts` no longer contains the `react-map-gl/mapbox` `any` module declaration, and Mapbox components type-check against official `react-map-gl` types.
9. `lib/utils/pointer-capture-patch.ts` includes `"use client"` and executes correctly in browser runtime.
10. `.github/workflows/ci.yml` includes active steps for `lint`, `type-check`, `test:integration`, `test:functions`, `db:verify-advisor`, and deploys `send-social-notification`.
11. `scripts/containers/container-common.sh` implements 3-attempt exponential backoff retry for image pulls.
12. `search-wineries` and `get-winery-details` enforce `verify_jwt = true` and return 401 for unauthenticated calls.
13. `get-winery-details` isolates private reviews and non-AI-opted users, fallback enrichment does not leak user review text or hardcode "Finger Lakes" globally, and `send-social-notification` enforces secret authentication.

## 5. Out of Scope
- Performance advisor categories 0001 (unindexed foreign keys) and 0003 (auth RLS initplan), cataloged separately as Tier 4 tech debt.
- HaveIBeenPwned k-anonymity validation during signup (Issue #88).
- Refactoring Zustand stores into normalized ID records (Horizon 2/3).
- Full RSC route group refactor around `(authenticated)/layout.tsx` (Horizon 3).
