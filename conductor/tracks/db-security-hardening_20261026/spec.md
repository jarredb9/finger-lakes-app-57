# Specification: Database Security Hardening, RLS Lockdown, and SECURITY INVOKER Conversion

**Tracking:** Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87)  
**ADR Reference:** [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)  
**Domain Context:** [CONTEXT.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/CONTEXT.md)  
**Type:** Security & Hardening  

## 1. Overview
Supabase's database security linter and architectural audit identified 97 schema and RPC security warnings across categories `0026_pg_graphql_anon_table_exposed`, `0027_pg_graphql_authenticated_table_exposed`, `0028_anon_security_definer_function_executable`, and `0029_authenticated_security_definer_function_executable`. Unauthenticated requests (`anon`) can read sensitive user profile details (including names and emails), tamper with canonical winery attributes via legacy RPCs (`upsert_wineries_from_search`), or read unauthenticated public data. Furthermore, ~25 active RPCs execute as `SECURITY DEFINER` without necessity, write RPCs lack cross-user `idempotency_key` scoping, and the unused `pg_graphql` extension exposes 13 public tables.

This specification implements the architecture outlined in ADR-0007 and Issue #87: revoking all `anon` access to public tables and RPCs, dropping `pg_graphql`, enforcing catalog immutability in `ensure_winery` while revoking direct table `INSERT` and `UPDATE` on `public.wineries` from regular users, dropping 10 dead/deprecated RPCs, scoping write RPC idempotency keys by `(user_id, idempotency_key)` composite constraints, defaulting user RPCs to `SECURITY INVOKER`, locking down trigger function privileges, and updating TypeScript definitions and integration tests.

*Note on `auth_leaked_password_protection`:* Supabase Free-tier projects gate the native HaveIBeenPwned Auth dashboard check behind the paid Pro plan. Application-layer HaveIBeenPwned k-anonymity validation during sign-up and password reset is tracked independently under Issue [#88](https://github.com/jarredb9/finger-lakes-app-57/issues/88) and is explicitly out of scope for this database schema track.

## 2. Domain & Architectural Invariants
- **Visibility Level (CONTEXT.md):** Unauthenticated visitors have zero visibility into any user or catalog data. All reads/writes require signed-in authentication (`auth.uid() IS NOT NULL`).
- **SECURITY INVOKER RPC Boundary (ADR-0007):** All user-callable RPCs in `public` execute as `SECURITY INVOKER` by default, deferring authorization directly to caller RLS policies.
- **Catalog Immutability (ADR-0007):** Regular users cannot insert into or overwrite canonical Winery catalog fields (`name`, `address`, `latitude`, `longitude`, `phone`, `website`, `google_rating`). Writes must route through `ensure_winery` using insert-if-missing / backfill-null semantics (`COALESCE(wineries.<col>, EXCLUDED.<col>)`), and direct table `INSERT` / `UPDATE` on `public.wineries` is revoked from `authenticated`.
- **Per-User Idempotency Keyspace:** Idempotency keys in `public.visits` and `public.trips` must be unique per user via composite `UNIQUE (user_id, idempotency_key)` constraints, preventing cross-tenant key exhaustion, silent insert failures, and unauthorized record snooping.
- **Expand-and-Contract & Production Safety (AGENTS.md):** Do not drop deprecated tables (`follows`, `follow_requests`, `visit_participants`); revoke `anon` and `authenticated` access instead. Do not execute migrations against remote production without explicit approval.

## 3. Functional Requirements

### 3.1 Zero `anon` Access, RLS Lockdown, and `pg_graphql` Removal
- **Atomic Migration:** Create `supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql`.
- **Privilege Revocation:**
  - Revoke all table, sequence, and function privileges in `schema public` from `anon`.
  - Execute `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, PUBLIC;` and identical default privilege revokes for sequences and functions.
- **Catalog Write Hardening on `public.wineries`:**
  - Drop the permissive `Authenticated users can insert wineries` RLS policy on `public.wineries`.
  - Revoke `INSERT`, `UPDATE`, and `DELETE` on `public.wineries` from `authenticated`.
  - Ensure `public.wineries` has a `FOR SELECT TO authenticated USING (true)` policy so signed-in users retain read-only discovery.
- **Disable pg_graphql:**
  - Execute `DROP EXTENSION IF EXISTS pg_graphql CASCADE;`.
  - Remove `"graphql_public"` from `db.schemas` in both `supabase/config.toml` and `supabase/config.ci.toml`.
- **RLS Policy Adjustments:**
  - Update `public.is_visible_to_viewer(p_target_user_id, p_is_item_private)`: return `FALSE` immediately when `auth.uid() IS NULL`.
  - Ensure all client-facing RLS policies explicitly declare `TO authenticated` (and system policies specify `TO service_role`).
  - Add missing `FOR UPDATE` RLS policies to `public.favorites` and `public.wishlist`: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.
  - Revoke table privileges from `anon` and `authenticated` on unused/deprecated tables: `public.follows`, `public.follow_requests`, and `public.visit_participants`.

### 3.2 Prune 10 Dead/Deprecated RPCs & Follow Fallbacks
- Drop 8 obsolete RPCs:
  - `public.upsert_wineries_from_search(jsonb[])`
  - `public.get_all_user_visits_list()`
  - `public.get_user_dashboard()`
  - `public.get_user_winery_data_aggregated()`
  - `public.get_winery_details(integer)`
  - `public.get_wineries_in_bounds(double precision, double precision, double precision, double precision, boolean, boolean, boolean, boolean, boolean)`
  - `public.add_winery_to_trips(integer, integer[])`
  - `public.add_to_wishlist(jsonb)`
- Drop 2 deprecated follow RPCs:
  - `public.send_follow_request(uuid)`
  - `public.respond_to_follow_request(uuid, boolean)`
- Remove legacy `OR EXISTS (SELECT 1 FROM public.follows ...)` clauses from `is_visible_to_viewer`, `get_friend_activity_feed`, `get_friends_activity_for_winery`, and `get_friends_ratings_for_winery`.

### 3.3 Winery Catalog Immutability & Per-User Idempotency Key Scoping
- **`ensure_winery(p_winery_data jsonb)` Hardening (`SECURITY DEFINER`):**
  - Require caller authentication: `IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN RAISE EXCEPTION 'Not authenticated'; END IF;`.
  - Validate payload object and resolve place ID via `COALESCE(p_winery_data->>'google_place_id', p_winery_data->>'id')`.
  - Normalize positive ratings: `CASE WHEN (p_winery_data->>'rating')::numeric > 0 THEN (p_winery_data->>'rating')::numeric ELSE NULL END`.
  - Update conflict resolution:
    ```sql
    ON CONFLICT (google_place_id) DO UPDATE SET
      name = COALESCE(wineries.name, EXCLUDED.name),
      address = COALESCE(wineries.address, EXCLUDED.address),
      latitude = COALESCE(wineries.latitude, EXCLUDED.latitude),
      longitude = COALESCE(wineries.longitude, EXCLUDED.longitude),
      phone = COALESCE(wineries.phone, EXCLUDED.phone),
      website = COALESCE(wineries.website, EXCLUDED.website),
      google_rating = COALESCE(wineries.google_rating, EXCLUDED.google_rating)
    ```
- **Refactor Write RPCs to Delegate to `ensure_winery`:**
  - In `log_visit`, `create_trip_with_winery`, and `add_winery_to_trip(integer, jsonb, text)`, replace direct `INSERT INTO public.wineries ... ON CONFLICT DO UPDATE` with `SELECT public.ensure_winery(p_winery_data) INTO v_winery_id;`.
- **Composite Idempotency Key Table Constraints & Scoping:**
  - Drop global `UNIQUE` constraints on `public.visits (idempotency_key)` and `public.trips (idempotency_key)`.
  - Add composite `UNIQUE (user_id, idempotency_key)` constraints to `public.visits` and `public.trips`.
  - Enforce top-level auth check (`IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;`) in `create_trip`, `create_trip_with_winery`, `log_visit`, and `update_visit`.
  - Scope idempotency checks in `create_trip`, `create_trip_with_winery`, `log_visit`, and `update_visit` to `AND user_id = auth.uid()`.
  - Update write RPC insert statements to `ON CONFLICT (user_id, idempotency_key) DO NOTHING`.
- **Profile Email Redaction:**
  - In `get_friend_profile_with_visits(p_friend_id uuid)`: require `auth.uid() IS NOT NULL` and return `NULL` for `email` unless `auth.uid() = p_friend_id` or the viewer is an accepted friend.

### 3.4 Convert User RPCs to `SECURITY INVOKER` & Secure Triggers
- **Convert User-Facing RPCs to `SECURITY INVOKER`:**
  - 8 Read RPCs: `get_map_markers(uuid)`, `get_paginated_wineries(integer, integer)`, `get_winery_details_by_id(integer)`, `get_trips_for_date(date)`, `get_friend_activity_feed(integer)`, `get_friend_profile_with_visits(uuid)`, `get_friends_activity_for_winery(integer)`, `get_friends_ratings_for_winery(integer)`.
  - 18 Write RPCs: `create_trip(text, date, uuid)`, `create_trip_with_winery(varchar, date, jsonb, text, uuid[], uuid)`, `delete_trip(integer)`, `add_winery_to_trip(integer, integer, text)`, `add_winery_to_trip(integer, jsonb, text)`, `remove_winery_from_trip(integer, integer)`, `reorder_trip_wineries(integer, integer[])`, `update_trip_winery_notes(integer, integer, text)`, `log_visit(jsonb, jsonb, uuid)`, `update_visit(integer, jsonb, uuid)`, `delete_visit(integer)`, `toggle_favorite(jsonb)`, `toggle_wishlist(jsonb)`, `toggle_favorite_privacy(integer)`, `toggle_wishlist_privacy(integer)`, `update_profile_privacy(public.privacy_level)`, `remove_friend(uuid)`, `respond_to_friend_request(uuid, boolean)`.
- **Strict Boundary `SECURITY DEFINER` Allowlist:**
  - Restrict `SECURITY DEFINER` strictly to: `ensure_winery`, `is_visible_to_viewer`, `is_trip_member`, `add_trip_member_by_email`, `send_friend_request`, `get_friends_and_requests`, and `get_trip_details`.
  - Explicitly revoke execute from `PUBLIC` and `anon`; grant execute only to `authenticated` and `service_role`.
- **Trigger Function Privileges:**
  - `handle_new_user()` and `handle_activity_ledger_notification()`: revoke execute from `PUBLIC, anon, authenticated`; grant execute to `service_role`.
  - `handle_activity_ledger_entry()`: revoke execute from `PUBLIC, anon`; grant execute to `authenticated, service_role`.

### 3.5 Client Code & Test Suite Synchronization
- Remove `addWineryToTripByApi` from `lib/services/tripService.ts`.
- Remove unit test suite for `addWineryToTripByApi` in `lib/services/__tests__/tripService.mutations.test.ts`.
- Regenerate database TypeScript types via `npm run db:gen-types` to reflect removed RPCs.
- Modernize and expand `lib/services/__tests__/supabase-rpc.integration.test.ts`:
  - Replace legacy `add_to_wishlist` calls with `toggle_wishlist`.
  - Remove deprecated `send_follow_request` and `respond_to_follow_request` tests.
  - Add test asserting unauthenticated (`anon`) access denial across `profiles`, `wineries`, `visits`, and user collections.
  - Add test asserting direct `INSERT` on `public.wineries` is denied with error `42501` to regular authenticated users.
  - Add test asserting catalog immutability on conflict in `ensure_winery` (existing non-null values preserved, nulls backfilled).
  - Add test asserting composite `(user_id, idempotency_key)` isolation (User B passing User A's key does not leak User A's data and completes independently).
  - Add test asserting non-friend email redaction in `get_friend_profile_with_visits`.

## 4. Acceptance Criteria
1. Single migration `supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql` successfully applies on local stack via `npm run db:reset`.
2. Supabase security advisor linter warnings for categories 0026, 0027, 0028, and 0029 are resolved.
3. Unauthenticated (`anon`) queries against `profiles`, `wineries`, `visits`, and user collections return empty or are rejected by RLS.
4. Direct `INSERT`, `UPDATE`, and `DELETE` on `public.wineries` by authenticated non-service-role clients are rejected with code `42501`.
5. Attempting to overwrite existing winery catalog fields via `ensure_winery` or write RPCs leaves existing data intact (null fields backfilled only).
6. Attempting to query or use an existing `idempotency_key` from a different user does not match or leak the other user's visit/trip record, and composite constraints allow independent key usage.
7. The 10 deprecated/dead RPCs are completely dropped and no longer present in `lib/database.types.ts`.
8. `npm run db:check-types:local` passes without errors.
9. Containerized unit and integration test suites (`npm run test:container`, `npm run test:integration:container`) pass completely.

## 5. Out of Scope
- Dropping deprecated tables `follows`, `follow_requests`, `visit_participants` (retained for expand-and-contract safety; privileges revoked only).
- Remote database migrations (forbidden per AGENTS.md Guardrail #1).
- Free-tier application-layer HaveIBeenPwned k-anonymity validation (tracked separately in Issue [#88](https://github.com/jarredb9/finger-lakes-app-57/issues/88)).
