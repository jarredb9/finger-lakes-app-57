# Implementation Plan: Phase 2 Task 2 — Implement Database Hardening Migration & Verify Green (TDD Green phase)

**Track:** `db-security-hardening_20261026` (Issue [#87](https://github.com/jarredb9/finger-lakes-app-57/issues/87))  
**Phase:** 2 (Database Hardening & Security Regression)  
**Task:** 2 (Implement Database Hardening Migration & Verify Green — TDD Green phase)  
**ADR Reference:** [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/db-security-hardening_20261026/spec.md](./spec.md)  
**Track Plan Reference:** [conductor/tracks/db-security-hardening_20261026/plan.md](./plan.md)  
**Immediate Preceding Context:** [conductor/tracks/db-security-hardening_20261026/phase-2-task-1-plan.md](./phase-2-task-1-plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Author and execute the comprehensive database hardening migration `supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql` to transition all 5 failing security regression tests authored in Phase 2 Task 1 from **Red** to **Green**:

1. **Zero `anon` Read & Routine Privileges:** Revoke all table, sequence, and routine privileges in `schema public` from `anon` and update default privileges for role `postgres`.
2. **`pg_graphql` Removal:** Drop the unused `pg_graphql` extension (`CASCADE`), eliminating Supabase Security Advisor warnings across categories `0026` and `0027`.
3. **Winery Catalog Write Hardening:** Drop policy `"Authenticated users can insert wineries"` and revoke `INSERT`, `UPDATE`, and `DELETE` on `public.wineries` from `authenticated`.
4. **Winery Catalog Immutability & Conflict Backfill in `ensure_winery`:** Enforce top-level authentication guard, normalize positive ratings, support place ID aliasing (`google_place_id` / `id`), and resolve conflicts via `COALESCE(wineries.<col>, EXCLUDED.<col>)` across all canonical columns (`name`, `address`, `latitude`, `longitude`, `phone`, `website`, `google_rating`).
5. **Per-User Composite Idempotency Keys:** Drop global unique constraints and add composite `UNIQUE (user_id, idempotency_key)` constraints on `public.visits` and `public.trips`. Update write RPCs (`log_visit`, `create_trip`, `create_trip_with_winery`, `update_visit`) to enforce caller auth guards and scope idempotency lookups and insertions strictly to `(user_id, idempotency_key)`.
6. **Winery Delegation:** Refactor `log_visit`, `create_trip_with_winery`, and `add_winery_to_trip` to delegate winery upsert exclusively to `ensure_winery`.
7. **Profile Email Redaction:** Redact (`NULL`) email address in `get_friend_profile_with_visits` for non-friends and unauthenticated callers.
8. **Security Invoker Conversion & Boundary Allowlist:** Default 8 read RPCs and 18 write RPCs to `SECURITY INVOKER`. Retain strictly 7 boundary RPCs as `SECURITY DEFINER` with explicit `authenticated` and `service_role` execute grants. Lock down trigger functions against direct execution.
9. **RLS Policy Lockdown & Deprecated Tables:** Enforce `TO authenticated` across all user policies, add missing `FOR UPDATE` policies on `favorites` and `wishlist`, update `is_visible_to_viewer` to return `FALSE` for unauthenticated callers, prune legacy `follows` table checks, and revoke access on deprecated tables (`follows`, `follow_requests`, `visit_participants`).
10. **Prune 10 Dead/Deprecated RPCs:** Drop obsolete search, dashboard, aggregation, and follow RPCs.

### 1.2 Development Methodology: Strict TDD Green Phase
In compliance with `conductor/workflow.md` and `AGENTS.md` Section 5:
- All 5 failing security tests from Phase 2 Task 1 must pass cleanly following migration application.
- All preexisting integration tests in `lib/services/__tests__/supabase-rpc.integration.test.ts` must remain green.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety (`AGENTS.md` Critical Guardrail 1):**
   - Strictly zero migrations, DDL, or DML mutations executed against remote Supabase (`jfsxclrdxmvftxacjuqf`).
   - All migrations apply locally via `npm run db:reset` (`http://127.0.0.1:54321`).
2. **BypassSandbox Mandates (`AGENTS.md` Section 3):**
   - `npm run db:reset` communicates with the host Podman `/run` socket and requires `BypassSandbox: true`.
   - `npm run test:integration:container` executes inside the container runner and requires `BypassSandbox: true`.
3. **Expand-and-Contract Safety (`AGENTS.md` Critical Guardrail 3):**
   - Retain tables `public.follows`, `public.follow_requests`, and `public.visit_participants` in the schema; revoke privileges from `anon` and `authenticated` instead of executing destructive `DROP TABLE`.
4. **Coordinate & Visit Invariants (`AGENTS.md` Section 4):**
   - Winery coordinate handling preserves `latitude` and `longitude` numeric fields.
   - Wishlist auto-clear invariant on visit logging (`ADR-0001` / Issue [#54](https://github.com/jarredb9/finger-lakes-app-57/issues/54)) remains intact.
5. **Modal Approval Invariant (`conductor_antigravity.md` & `AGENTS.md`):**
   - Halt immediately for explicit user approval via modal before applying migration or altering database state.

---

## 3. Target Files & Semantic Insertion Anchors

- **Path:** `supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql`
  - **Action:** Create new atomic migration script containing all DDL, DML, privilege grants/revocations, and function definitions.
  - **Semantic Order:**
    1. Extension teardown (`pg_graphql`).
    2. Global `anon` privilege revocation and default privilege reconfiguration.
    3. Deprecated table privilege revokes (`follows`, `follow_requests`, `visit_participants`).
    4. Table constraint updates: replace global idempotency constraints with composite `UNIQUE (user_id, idempotency_key)` on `visits` and `trips`.
    5. Table privilege lockdown on `public.wineries`: revoke `INSERT, UPDATE, DELETE` from `authenticated`.
    6. Drop 10 dead/deprecated RPCs.
    7. Core helper functions: `is_visible_to_viewer` (STABLE SQL, return false on null auth, drop `follows` checks).
    8. Boundary `SECURITY DEFINER` allowlist functions: `ensure_winery`, `is_trip_member`, `add_trip_member_by_email`, `send_friend_request`, `get_friends_and_requests`, `get_trip_details`.
    9. `SECURITY INVOKER` read RPCs: `get_map_markers`, `get_paginated_wineries`, `get_winery_details_by_id`, `get_trips_for_date`, `get_friend_activity_feed`, `get_friend_profile_with_visits` (with email redaction), `get_friends_activity_for_winery`, `get_friends_ratings_for_winery`.
    10. `SECURITY INVOKER` write RPCs: `log_visit` (delegating to `ensure_winery`, scoped idempotency), `create_trip`, `create_trip_with_winery` (delegating to `ensure_winery`, scoped idempotency), `update_visit` (scoped idempotency), `delete_trip`, `delete_visit`, `add_winery_to_trip` (both overloads), `remove_winery_from_trip`, `reorder_trip_wineries`, `update_trip_winery_notes`, `toggle_favorite`, `toggle_wishlist`, `toggle_favorite_privacy`, `toggle_wishlist_privacy`, `update_profile_privacy`, `remove_friend`, `respond_to_friend_request`.
    11. Trigger function privilege lockdown: `handle_new_user`, `handle_activity_ledger_notification`, `handle_activity_ledger_entry`.
    12. RLS policy updates across `profiles`, `wineries`, `visits`, `favorites`, `wishlist`, `trips`, `trip_members`, `trip_wineries`, `friends`, and `activity_ledger` with explicit `TO authenticated` and missing `FOR UPDATE` policies.

---

## 4. PostgreSQL Function Signatures & Type Blueprints

### 4.1 Boundary `SECURITY DEFINER` Functions (Strict Allowlist of 7)

```sql
-- 1. Winery Canonical Upsert & Immutability Boundary
CREATE OR REPLACE FUNCTION public.ensure_winery(
  p_winery_data jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp';

-- 2. Row Visibility Helper (Inline STABLE SQL)
CREATE OR REPLACE FUNCTION public.is_visible_to_viewer(
  p_target_user_id uuid,
  p_is_item_private boolean DEFAULT false
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp';

-- 3. Trip Membership Guard
CREATE OR REPLACE FUNCTION public.is_trip_member(
  p_trip_id integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp';

-- 4. Trip Member Invitation
CREATE OR REPLACE FUNCTION public.add_trip_member_by_email(
  p_trip_id integer,
  p_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp';

-- 5. Friend Request Dispatch
CREATE OR REPLACE FUNCTION public.send_friend_request(
  p_target_email text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp';

-- 6. Social Graph & Incoming Requests Lookup
CREATE OR REPLACE FUNCTION public.get_friends_and_requests()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp';

-- 7. Trip Details Composite Query
CREATE OR REPLACE FUNCTION public.get_trip_details(
  p_trip_id integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_temp';
```

### 4.2 User-Facing `SECURITY INVOKER` Functions (8 Read + 18 Write)

#### Read RPCs (8)
```sql
-- 1. Map Markers Discovery
CREATE OR REPLACE FUNCTION public.get_map_markers(
  p_user_id uuid DEFAULT auth.uid()
) RETURNS TABLE(
  id integer, google_place_id text, name text, latitude numeric, longitude numeric,
  is_favorite boolean, on_wishlist boolean, user_visited boolean,
  is_favorite_private boolean, on_wishlist_private boolean,
  google_rating numeric, user_rating_count integer, allows_dogs boolean,
  good_for_children boolean, outdoor_seating boolean, has_ev_charging boolean,
  enrichment_tier text
) LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'pg_temp';

-- 2. Paginated Wineries Discovery
CREATE OR REPLACE FUNCTION public.get_paginated_wineries(
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 20
) RETURNS TABLE(
  id integer, google_place_id text, name text, address text, latitude numeric,
  longitude numeric, phone text, website text, google_rating numeric,
  is_favorite boolean, on_wishlist boolean, user_visited boolean, total_count bigint
) LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'pg_temp';

-- 3. Winery Details by ID
CREATE OR REPLACE FUNCTION public.get_winery_details_by_id(
  p_winery_id integer
) RETURNS TABLE(
  id integer, google_place_id text, name text, address text, latitude numeric,
  longitude numeric, phone text, website text, google_rating numeric,
  user_rating_count integer, opening_hours jsonb, reviews jsonb, reservable boolean,
  is_favorite boolean, on_wishlist boolean, user_visited boolean,
  is_favorite_private boolean, on_wishlist_private boolean, visits jsonb, trip_info jsonb,
  enrichment_tier text, last_enriched_at timestamp with time zone,
  generative_summary jsonb, neighborhood_summary jsonb, editorial_summary jsonb,
  primary_photo_reference text, photo_references jsonb, allows_dogs boolean,
  good_for_children boolean, outdoor_seating boolean, has_ev_charging boolean,
  serves_wine boolean, parking_options jsonb, accessibility_flags jsonb,
  varietals jsonb, vibe_tags text[]
) LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'pg_temp';

-- 4. Trips for Target Date
CREATE OR REPLACE FUNCTION public.get_trips_for_date(
  p_target_date date
) RETURNS TABLE(
  id integer, user_id uuid, trip_date date, name text,
  updated_at timestamp with time zone, wineries jsonb
) LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'pg_temp';

-- 5. Friend Activity Feed
CREATE OR REPLACE FUNCTION public.get_friend_activity_feed(
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 6. Friend Profile with Visits & Email Redaction
CREATE OR REPLACE FUNCTION public.get_friend_profile_with_visits(
  p_friend_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 7. Friends Activity for Winery
CREATE OR REPLACE FUNCTION public.get_friends_activity_for_winery(
  p_winery_id integer
) RETURNS json
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 8. Friends Ratings for Winery
CREATE OR REPLACE FUNCTION public.get_friends_ratings_for_winery(
  p_winery_id integer
) RETURNS json
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';
```

#### Write RPCs (18)
```sql
-- 1. Create Trip (Scoped Idempotency)
CREATE OR REPLACE FUNCTION public.create_trip(
  p_name text, p_trip_date date, p_idempotency_key uuid DEFAULT NULL::uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 2. Create Trip with Winery (Delegates to ensure_winery, Scoped Idempotency)
CREATE OR REPLACE FUNCTION public.create_trip_with_winery(
  p_trip_name character varying, p_trip_date date, p_winery_data jsonb,
  p_notes text DEFAULT NULL::text, p_members uuid[] DEFAULT NULL::uuid[],
  p_idempotency_key uuid DEFAULT NULL::uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 3. Delete Trip
CREATE OR REPLACE FUNCTION public.delete_trip(
  p_trip_id integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 4. Add Winery to Trip (ID Overload)
CREATE OR REPLACE FUNCTION public.add_winery_to_trip(
  p_trip_id integer, p_winery_id integer, p_notes text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 5. Add Winery to Trip (JSONB Overload, Delegates to ensure_winery)
CREATE OR REPLACE FUNCTION public.add_winery_to_trip(
  p_trip_id integer, p_winery_data jsonb, p_notes text DEFAULT NULL::text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 6. Remove Winery from Trip
CREATE OR REPLACE FUNCTION public.remove_winery_from_trip(
  p_trip_id integer, p_winery_id integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 7. Reorder Trip Wineries
CREATE OR REPLACE FUNCTION public.reorder_trip_wineries(
  p_trip_id integer, p_winery_ids integer[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 8. Update Trip Winery Notes
CREATE OR REPLACE FUNCTION public.update_trip_winery_notes(
  p_trip_id integer, p_winery_id integer, p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 9. Log Visit (Delegates to ensure_winery, Scoped Idempotency)
CREATE OR REPLACE FUNCTION public.log_visit(
  p_winery_data jsonb, p_visit_data jsonb, p_idempotency_key uuid DEFAULT NULL::uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 10. Update Visit (Scoped Idempotency)
CREATE OR REPLACE FUNCTION public.update_visit(
  p_visit_id integer, p_visit_data jsonb, p_idempotency_key uuid DEFAULT NULL::uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 11. Delete Visit
CREATE OR REPLACE FUNCTION public.delete_visit(
  p_visit_id integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 12. Toggle Favorite
CREATE OR REPLACE FUNCTION public.toggle_favorite(
  p_winery_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 13. Toggle Wishlist
CREATE OR REPLACE FUNCTION public.toggle_wishlist(
  p_winery_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 14. Toggle Favorite Privacy
CREATE OR REPLACE FUNCTION public.toggle_favorite_privacy(
  p_winery_id integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 15. Toggle Wishlist Privacy
CREATE OR REPLACE FUNCTION public.toggle_wishlist_privacy(
  p_winery_id integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 16. Update Profile Privacy
CREATE OR REPLACE FUNCTION public.update_profile_privacy(
  p_privacy_level public.privacy_level
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 17. Remove Friend
CREATE OR REPLACE FUNCTION public.remove_friend(
  p_target_friend_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';

-- 18. Respond to Friend Request
CREATE OR REPLACE FUNCTION public.respond_to_friend_request(
  p_requester_id uuid, p_accept boolean
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public', 'auth', 'pg_temp';
```

---

## 5. Precise Behavioral Logic & Architectural Implementation

### 5.1 Extension Teardown & Global Privilege Hardening
1. Drop `pg_graphql` extension:
   ```sql
   DROP EXTENSION IF EXISTS pg_graphql CASCADE;
   ```
2. Revoke all privileges in `schema public` from `anon`:
   ```sql
   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
   REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
   REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;
   REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
   ```
3. Update default privileges for future objects:
   ```sql
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, PUBLIC;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, PUBLIC;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, PUBLIC;
   ```
4. Revoke access on deprecated tables (`follows`, `follow_requests`, `visit_participants`):
   ```sql
   REVOKE ALL ON TABLE public.follows FROM anon, authenticated, PUBLIC;
   REVOKE ALL ON TABLE public.follow_requests FROM anon, authenticated, PUBLIC;
   REVOKE ALL ON TABLE public.visit_participants FROM anon, authenticated, PUBLIC;
   GRANT ALL ON TABLE public.follows, public.follow_requests, public.visit_participants TO service_role;
   ```

### 5.2 Table Constraints & Winery Catalog Direct Mutation Lockdown
1. Replace global unique constraints with composite per-user constraints on `public.visits` and `public.trips`:
   ```sql
   ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_idempotency_key_key;
   ALTER TABLE public.visits ADD CONSTRAINT visits_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);

   ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_idempotency_key_key;
   ALTER TABLE public.trips ADD CONSTRAINT trips_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);
   ```
2. Revoke direct write privileges on `public.wineries`:
   ```sql
   DROP POLICY IF EXISTS "Authenticated users can insert wineries" ON public.wineries;
   DROP POLICY IF EXISTS "Anyone can view wineries" ON public.wineries;
   REVOKE INSERT, UPDATE, DELETE ON TABLE public.wineries FROM authenticated, anon, PUBLIC;
   GRANT SELECT ON TABLE public.wineries TO authenticated;
   GRANT ALL ON TABLE public.wineries TO service_role;

   CREATE POLICY "Authenticated users can view wineries" 
   ON public.wineries FOR SELECT TO authenticated USING (true);
   ```

### 5.3 Dead RPC Teardown (10 Pruned Functions)
Execute `DROP FUNCTION IF EXISTS ... CASCADE;` on:
1. `public.upsert_wineries_from_search(jsonb[])`
2. `public.get_all_user_visits_list()`
3. `public.get_user_dashboard()`
4. `public.get_user_winery_data_aggregated()`
5. `public.get_winery_details(integer)`
6. `public.get_wineries_in_bounds(double precision, double precision, double precision, double precision)` and `public.get_wineries_in_bounds(double precision, double precision, double precision, double precision, boolean, boolean, boolean, boolean, boolean)`
7. `public.add_winery_to_trips(integer, integer[])`
8. `public.add_to_wishlist(jsonb)`
9. `public.send_follow_request(uuid)`
10. `public.respond_to_follow_request(uuid, boolean)`

### 5.4 Immutability & Conflict Backfill in `ensure_winery`
1. **Authentication Check:**
   `IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN RAISE EXCEPTION 'Not authenticated'; END IF;`
2. **Place ID Resolution:**
   `v_place_id := COALESCE(p_winery_data->>'google_place_id', p_winery_data->>'id');`
   Validate `v_place_id IS NOT NULL AND length(trim(v_place_id)) > 0`.
3. **Rating Normalization:**
   `v_rating := CASE WHEN (p_winery_data->>'rating')::numeric > 0 THEN (p_winery_data->>'rating')::numeric ELSE NULL END;`
4. **Conflict Resolution Strategy:**
   ```sql
   ON CONFLICT (google_place_id) DO UPDATE SET
     name = COALESCE(wineries.name, EXCLUDED.name),
     address = COALESCE(wineries.address, EXCLUDED.address),
     latitude = COALESCE(wineries.latitude, EXCLUDED.latitude),
     longitude = COALESCE(wineries.longitude, EXCLUDED.longitude),
     phone = COALESCE(wineries.phone, EXCLUDED.phone),
     website = COALESCE(wineries.website, EXCLUDED.website),
     google_rating = COALESCE(wineries.google_rating, EXCLUDED.google_rating)
   RETURNING id INTO v_winery_id;
   ```
5. **Privilege Grants:**
   `REVOKE ALL ON FUNCTION public.ensure_winery(jsonb) FROM PUBLIC, anon;`
   `GRANT EXECUTE ON FUNCTION public.ensure_winery(jsonb) TO authenticated, service_role;`

### 5.5 Per-User Idempotency Key Scoping & Write Delegation
In `log_visit`, `create_trip`, `create_trip_with_winery`, and `update_visit`:
1. Check `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;`.
2. Idempotency check queries must explicitly include `WHERE user_id = auth.uid() AND idempotency_key = p_idempotency_key`.
3. In `log_visit` and `create_trip_with_winery`, replace direct table winery upserts with `v_winery_id := public.ensure_winery(p_winery_data);`.
4. Replace `ON CONFLICT (idempotency_key)` with `ON CONFLICT (user_id, idempotency_key) DO NOTHING`.
5. In `log_visit`, retain wishlist auto-cleanup: `DELETE FROM public.wishlist WHERE user_id = auth.uid() AND winery_id = v_winery_id;`.

### 5.6 Profile Email Redaction in `get_friend_profile_with_visits`
1. Ensure caller is authenticated: `IF auth.uid() IS NULL THEN RETURN NULL; END IF;`.
2. Evaluate `v_is_friend_or_self`:
   ```sql
   v_is_friend_or_self := (auth.uid() = p_friend_id) OR EXISTS (
     SELECT 1 FROM public.friends
     WHERE status = 'accepted'
       AND ((user1_id = auth.uid() AND user2_id = p_friend_id)
         OR (user2_id = auth.uid() AND user1_id = p_friend_id))
   );
   ```
3. Return `CASE WHEN v_is_friend_or_self THEN p.email ELSE NULL END AS email` in the jsonb profile structure.

### 5.7 Privacy Engine & RLS Modernization
1. Update `public.is_visible_to_viewer(uuid, boolean)`:
   - Return `FALSE` immediately when `auth.uid() IS NULL`.
   - Remove legacy `EXISTS (SELECT 1 FROM public.follows ...)` clauses.
2. Re-create all client-facing policies with explicit `TO authenticated`:
   - `profiles`: SELECT, INSERT, UPDATE.
   - `wineries`: SELECT.
   - `visits`: SELECT, INSERT, UPDATE, DELETE.
   - `favorites`: SELECT, INSERT, DELETE, and new `FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.
   - `wishlist`: SELECT, INSERT, DELETE, and new `FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.
   - `trips`: SELECT, INSERT, UPDATE, DELETE.
   - `trip_members`: SELECT, INSERT, UPDATE, DELETE.
   - `trip_wineries`: SELECT, INSERT, UPDATE, DELETE.
   - `friends`: SELECT, INSERT, UPDATE, DELETE.
   - `activity_ledger`: SELECT `TO authenticated`, ALL `TO service_role`.
3. Trigger function execution privilege lockdown:
   - `handle_new_user()`: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role;`.
   - `handle_activity_ledger_notification()`: `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role;`.
   - `handle_activity_ledger_entry()`: `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, service_role;`.

---

## 6. Execution Verification Protocol

### 6.1 Database Migration Application
Execute local database reset to apply the entire migration sequence from scratch (including the new hardening migration):

```bash
npm run db:reset
```
*Note on execution:* Requires `BypassSandbox: true` due to host Podman socket interaction.

### 6.2 Containerized Integration Test Verification
Run the target integration test suite against the local hardened database stack:

```bash
npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts
```
*Note on execution:* Requires `BypassSandbox: true` for the Podman container runner.

### 6.3 Expected Green Phase Test Results
- All preexisting integration tests in `supabase-rpc.integration.test.ts` pass cleanly.
- All 5 security regression tests authored in Phase 2 Task 1 pass (Green):
  1. `PASS`: Unauthenticated (`anon`) read access denial across profiles, wineries, visits, and collections.
  2. `PASS`: Direct table `INSERT` denial on `public.wineries` for authenticated users (`code === '42501'`).
  3. `PASS`: `ensure_winery` immutability, place ID aliasing, rating normalization, and missing attribute backfilling.
  4. `PASS`: Composite `(user_id, idempotency_key)` isolation, multi-user replay safety, and top-level auth checks.
  5. `PASS`: Profile email redaction for non-friends and unauthenticated callers.

---

## 7. Post-Execution Protocol & Git Notes

Upon confirming 100% green test execution in the container runner:

### 7.1 Stage & Commit
```bash
git add supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql
git commit -m "feat(db): implement database security hardening migration and RLS lockdown (TDD Green phase)"
```

### 7.2 Attach Git Note
Obtain the commit SHA (`COMMIT_HASH=$(git log -1 --format="%H")`) and attach the standard metadata note:

```bash
git notes add -m "Task: Implement Database Hardening Migration & Verify Green (TDD Green phase)
Summary: Implemented supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql revoking anon privileges, dropping pg_graphql, hardening ensure_winery with catalog immutability, establishing composite (user_id, idempotency_key) constraints, converting 26 RPCs to SECURITY INVOKER, redacting emails for non-friends, and locking down RLS policies and trigger functions. Verified all 5 security regression tests pass green.
Files: supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql
Rationale: Resolves Issue #87 and implements ADR-0007, completing the Green phase of database security hardening." $COMMIT_HASH
```

### 7.3 Update Conductor Plan
Update `conductor/tracks/db-security-hardening_20261026/plan.md`:
- Mark `[ ] Task: Implement Database Hardening Migration & Verify Green (TDD Green phase)` as `[x] Task: Implement Database Hardening Migration & Verify Green (TDD Green phase) [commit: <short_sha>]`.
- Stage `conductor/tracks/db-security-hardening_20261026/plan.md`.
- Commit with: `conductor(plan): Mark task 'Implement Database Hardening Migration & Verify Green (TDD Green phase)' as complete`.

---

## 8. Confirmation Gate

Halt immediately. Do NOT create `supabase/migrations/20261026000000_harden_rls_and_security_invoker_rpcs.sql`, apply any migrations, or execute commands until explicit affirmative user approval is received via the `ask_question` modal.
