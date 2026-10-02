# Implementation Plan: Phase 1 Task 2 - Create & Apply Supabase Migration for `add_winery_to_trip` (Green Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 1 (PostgreSQL RPC Coordinate Standardization (`add_winery_to_trip`))  
**Task:** 2 (Create & Apply Supabase Migration for `add_winery_to_trip` (Green Phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Implement and apply the PostgreSQL migration to transition the `public.add_winery_to_trip` RPC from the failing Red Phase established in Task 1 to the passing Green Phase. This standardizes coordinate extraction to parse `COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat')::numeric` and `COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng')::numeric`, ensuring numeric coordinates are persisted into `public.wineries` when callers provide standardized coordinate keys while preserving 100% backward compatibility for legacy callers.

### 1.2 Seam Boundary Analysis
1. **Target Migration File:**
   - [supabase/migrations/20261002120000_standardize_add_winery_to_trip_coordinates.sql](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/migrations/20261002120000_standardize_add_winery_to_trip_coordinates.sql)
   - Sequenced immediately following `20260929111500_autoclear_wishlist_on_visit.sql`.
2. **Impacted Schema Function:**
   - `public.add_winery_to_trip(p_trip_id integer, p_winery_data jsonb, p_notes text DEFAULT NULL::text)`
   - Defined originally in `supabase/migrations/20260528000000_v2.11.0-stable.sql` (lines 365–413).
   - Does NOT affect the alternate overload `add_winery_to_trip(p_trip_id integer, p_winery_id integer, p_notes text)`.
3. **Database Types & Client Signatures:**
   - Function signature and return type (`RETURNS jsonb`) remain identical.
   - Generated TypeScript definitions in `lib/database.types.ts` remain unchanged and verified via `npm run db:check-types:local`.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety (`AGENTS.md` Guardrail 1):**
   - Strictly apply this migration to the local Supabase stack (`npm run db:start` / `npx supabase migration up`).
   - Zero remote database DDL or DML mutations against `jfsxclrdxmvftxacjuqf`.
2. **Expand-and-Contract Backward Compatibility (`AGENTS.md` Guardrail 3):**
   - The coalesce expression `COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat')` guarantees that legacy payloads emitting `lat`/`lng` continue to succeed without schema breakage.
3. **Security Definer Search Path & Privilege Invariant:**
   - Function must preserve `SECURITY DEFINER`.
   - Explicit `SET "search_path" TO 'public', 'auth'` must be specified to mitigate search path hijacking.
   - Ownership (`postgres`) and grants (`REVOKE ALL FROM PUBLIC`, `GRANT ALL TO service_role, authenticated`) must remain identical to baseline.
4. **Local Migration Hygiene:**
   - Run `npm run db:lint` to ensure PostgreSQL syntax validation passes with zero errors.

---

## 3. Target File & Exact Drop-in Specifications

### 3.1 Target File: `supabase/migrations/20261002120000_standardize_add_winery_to_trip_coordinates.sql`

- **Action:** Create new migration file.
- **Path:** `supabase/migrations/20261002120000_standardize_add_winery_to_trip_coordinates.sql`

#### Exact Migration Code Content:
```sql
-- Migration: 20261002120000_standardize_add_winery_to_trip_coordinates.sql
-- Description: Standardize coordinate extraction in add_winery_to_trip to accept latitude/longitude and lat/lng (Issue #57)

CREATE OR REPLACE FUNCTION "public"."add_winery_to_trip"(
  "p_trip_id" integer,
  "p_winery_data" "jsonb",
  "p_notes" "text" DEFAULT NULL::"text"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_winery_id integer;
  v_max_order integer;
BEGIN
  -- Check permission
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Not authorized to modify this trip';
  END IF;

  -- Upsert Winery
  INSERT INTO public.wineries (
    google_place_id, name, address, latitude, longitude, 
    phone, website, google_rating
  )
  VALUES (
    p_winery_data->>'id',
    p_winery_data->>'name',
    p_winery_data->>'address',
    (COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat'))::numeric,
    (COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng'))::numeric,
    p_winery_data->>'phone',
    p_winery_data->>'website',
    (p_winery_data->>'rating')::numeric
  )
  ON CONFLICT (google_place_id) 
  DO UPDATE SET
    name = EXCLUDED.name
  RETURNING id INTO v_winery_id;

  -- Get max order
  SELECT COALESCE(MAX(visit_order), -1) INTO v_max_order
  FROM public.trip_wineries
  WHERE trip_id = p_trip_id;

  -- Insert into Trip Wineries
  INSERT INTO public.trip_wineries (trip_id, winery_id, visit_order, notes)
  VALUES (p_trip_id, v_winery_id, v_max_order + 1, p_notes)
  ON CONFLICT (trip_id, winery_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'winery_id', v_winery_id);
END;
$$;

ALTER FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."add_winery_to_trip"("p_trip_id" integer, "p_winery_data" "jsonb", "p_notes" "text") TO "authenticated";
```

---

### 3.2 Target File: `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`

- **Action:** Update task status to in-progress `[~]` during execution, and `[x]` upon completion.
- **Path:** `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`

#### Line Anchor Context:
Lines 11–14 of `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`:
```markdown
- [ ] Task: Create & Apply Supabase Migration for `add_winery_to_trip` (Green Phase)
    - [ ] Create `supabase/migrations/20261002120000_standardize_add_winery_to_trip_coordinates.sql` updating `add_winery_to_trip` to use `COALESCE(p_winery_data->>'latitude', p_winery_data->>'lat')::numeric` and `COALESCE(p_winery_data->>'longitude', p_winery_data->>'lng')::numeric`.
    - [ ] Apply migration locally via `npm run db:start` / verify schema.
    - [ ] Run containerized Jest suite and verify test passes.
```

---

## 4. Execution Verification Protocol

### 4.1 Step 1: Apply Migration to Local Database Stack
Execute local database start / migration application with `BypassSandbox: true` (required for Podman socket access):

```bash
npm run db:start
```
*(If the local database container is already running, run: `export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase migration up --local`)*

### 4.2 Step 2: Database Schema Linting
Validate SQL syntax and schema constraints:

```bash
npm run db:lint
```
- **Expected Outcome:** Exits with code 0 and zero lint errors.

### 4.3 Step 3: Run Containerized Integration Test Suite (Green Phase Verification)
Per `AGENTS.md` and Conductor instructions, run the containerized Jest test runner targeting the integration test written in Task 1:

```bash
TEST_TYPE=integration ./scripts/run-jest-container.sh lib/services/__tests__/supabase-rpc.integration.test.ts
```
*(Equivalent command: `npm run test:integration:container -- lib/services/__tests__/supabase-rpc.integration.test.ts`)*

> [!IMPORTANT]
> - Executing `./scripts/run-jest-container.sh` requires `BypassSandbox: true`.
> - **Expected Result:** All tests in `lib/services/__tests__/supabase-rpc.integration.test.ts` pass, specifically:
>   - `should persist numeric coordinates when add_winery_to_trip is called with latitude and longitude keys (without lat/lng)`: **PASS** (resolves previous `Expected: 42.7485, Received: null`).
>   - `should maintain backward compatibility and persist numeric coordinates when add_winery_to_trip is called with legacy lat and lng keys`: **PASS**.
>   - All social, trip management, and visit logging integration tests: **PASS**.

---

## 5. Post-Execution Hygiene & Conductor Commit Protocol

Upon successful verification of Step 3:
1. **Commit Code:**
   - Stage `supabase/migrations/20261002120000_standardize_add_winery_to_trip_coordinates.sql`.
   - Commit: `feat(db): standardize add_winery_to_trip coordinates (Issue #57)`.
2. **Attach Git Note:**
   - Attach detailed task summary with `git notes add -m "..." <commit_sha>`.
3. **Update & Commit Track Plan:**
   - Mark Task 2 as `[x]` in `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md` with commit SHA.
   - Commit: `conductor(plan): Mark task 'Create & Apply Supabase Migration for add_winery_to_trip (Green Phase)' as complete`.

---

## 6. Gating & Approval Invariant

No project code, database migrations, or configuration files have been modified.
In accordance with Conductor rules and `AGENTS.md` section 2, this implementation plan is submitted for affirmative user approval via native modal dialog prior to execution.
