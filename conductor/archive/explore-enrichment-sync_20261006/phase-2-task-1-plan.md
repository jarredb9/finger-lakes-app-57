# Implementation Plan: Phase 2 Task 1 - Expand `get_map_markers` RPC with Ratings, Review Count, and Vibe Tag Columns (TDD)

**Track:** `explore-enrichment-sync_20261006` (Issue [#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44))  
**Phase:** 2 (Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening)  
**Task:** 1 (Expand `get_map_markers` RPC with ratings, review count, and Vibe Tag columns (TDD))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Expand PostgreSQL database function `public.get_map_markers(p_user_id uuid)` to return:
1. `google_rating numeric`
2. `user_rating_count integer`
3. `allows_dogs boolean`
4. `good_for_children boolean`
5. `outdoor_seating boolean`
6. `has_ev_charging boolean`
7. `enrichment_tier text` (via `COALESCE(w.enrichment_tier, 'basic')::text`)

This ensures map marker payloads carry ratings and Vibe Tag indicators on initial map loading, resolving the data pipeline desynchronization between map pins and the Explore sidebar list.

### 1.2 Development Methodology: Strict TDD
- **Red Phase:** Update `lib/services/__tests__/db-optimization.integration.test.ts` to assert that `get_map_markers` returns ratings, review count, Vibe Tag columns, and enrichment tier for both enriched and un-enriched wineries. Run integration test in the container runner (`TEST_TYPE=integration`) and verify failure (`google_rating` is `undefined`).
- **Green Phase:** Author safe transaction migration `supabase/migrations/20261007090000_enrich_map_markers_rpc.sql` dropping and recreating `public.get_map_markers` with the expanded `RETURNS TABLE` signature. Apply migration to local Supabase stack (`npm run db:start`) and verify integration tests pass (100% green).
- **Refactor / Commit:** Commit implementation and migration, record git notes summary, and update track plan.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety (`AGENTS.md` Guardrail 1):**
   - Strictly zero mutations or migrations against the remote Supabase project (`jfsxclrdxmvftxacjuqf`).
   - All migrations and RPC executions are strictly developed and tested locally against `http://127.0.0.1:54321`.
2. **Container & Shell Execution Permissions (`AGENTS.md` Section 3):**
   - RHEL 8 glibc (2.28) is incompatible with Next.js 16.3+ native SWC. All Jest tests must run via the Podman container runner with `BypassSandbox: true`:
     - Command: `npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts`
   - Local DB stack operations (`npm run db:start`) require `BypassSandbox: true`.
   - Git mutation operations (`git add`, `git commit`, `git notes`) require `BypassSandbox: true`.
3. **Database Function Signature Invariant (`spec.md` Section 3):**
   - PostgreSQL requires dropping an existing function when modifying its `RETURNS TABLE` signature. The migration must execute `DROP FUNCTION IF EXISTS public.get_map_markers(uuid);` and `CREATE OR REPLACE FUNCTION public.get_map_markers(p_user_id uuid DEFAULT auth.uid())` inside a single migration transaction.
   - Column order and types must match the specification:
     - `id integer`
     - `google_place_id text`
     - `name text`
     - `latitude numeric`
     - `longitude numeric`
     - `is_favorite boolean`
     - `on_wishlist boolean`
     - `user_visited boolean`
     - `is_favorite_private boolean`
     - `on_wishlist_private boolean`
     - `google_rating numeric`
     - `user_rating_count integer`
     - `allows_dogs boolean`
     - `good_for_children boolean`
     - `outdoor_seating boolean`
     - `has_ev_charging boolean`
     - `enrichment_tier text`
4. **Security & RLS Enforcement:**
   - Function must retain `SECURITY DEFINER` and `SET search_path = public, pg_temp`.
   - Function must retain:
     ```sql
     IF p_user_id IS NULL OR p_user_id != auth.uid() THEN
         RAISE EXCEPTION 'Unauthorized: You can only view your own map markers.';
     END IF;
     ```
   - Retain permissions: `GRANT ALL ON FUNCTION public.get_map_markers(uuid) TO authenticated, service_role;` and `REVOKE ALL ON FUNCTION public.get_map_markers(uuid) FROM anon, public;`.
5. **Modal Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - Execution must halt for explicit affirmative user confirmation via `ask_question` before making changes.

---

## 3. Exact Code Blocks & Line Anchors

### 3.1 Target File 1: `lib/services/__tests__/db-optimization.integration.test.ts`

#### Edit 1: Add `testUnenrichedWineryId` variable declaration
- **Line Anchor:** Line 24
- **Original Content:**
```typescript
  let testWineryId: number;
  const testPlaceId = `test-db-opt-${Date.now()}`;
```
- **Replacement Content:**
```typescript
  let testWineryId: number;
  let testUnenrichedWineryId: number;
  const testPlaceId = `test-db-opt-${Date.now()}`;
```

#### Edit 2: Seed enriched and un-enriched test wineries in `beforeAll`
- **Line Anchor:** Lines 51–66
- **Original Content:**
```typescript
    // Create a temporary winery for tests
    const { data: winery, error: wineryError } = await adminClient
      .from('wineries')
      .insert({
        name: 'DB Optimization Test Winery',
        address: '123 Test St, Geneva, NY 14456',
        google_place_id: testPlaceId,
        latitude: 42.8864,
        longitude: -76.9897,
      })
      .select('id')
      .single();

    if (wineryError || !winery) throw wineryError;
    testWineryId = winery.id;
```
- **Replacement Content:**
```typescript
    // Create an enriched temporary winery for tests
    const { data: winery, error: wineryError } = await adminClient
      .from('wineries')
      .insert({
        name: 'DB Optimization Test Winery',
        address: '123 Test St, Geneva, NY 14456',
        google_place_id: testPlaceId,
        latitude: 42.8864,
        longitude: -76.9897,
        google_rating: 4.8,
        user_rating_count: 125,
        allows_dogs: true,
        good_for_children: false,
        outdoor_seating: true,
        has_ev_charging: true,
        enrichment_tier: 'enriched',
      })
      .select('id')
      .single();

    if (wineryError || !winery) throw wineryError;
    testWineryId = winery.id;

    // Create an un-enriched temporary winery for tests
    const { data: unenrichedWinery, error: unenrichedError } = await adminClient
      .from('wineries')
      .insert({
        name: 'DB Optimization Un-enriched Winery',
        address: '456 Test Ave, Geneva, NY 14456',
        google_place_id: `${testPlaceId}-unenriched`,
        latitude: 42.8870,
        longitude: -76.9900,
      })
      .select('id')
      .single();

    if (unenrichedError || !unenrichedWinery) throw unenrichedError;
    testUnenrichedWineryId = unenrichedWinery.id;
```

#### Edit 3: Clean up both temporary wineries in `afterAll`
- **Line Anchor:** Lines 71–74
- **Original Content:**
```typescript
    if (testWineryId) {
      await adminClient.from('wineries').delete().eq('id', testWineryId);
    }
  });
```
- **Replacement Content:**
```typescript
    if (testWineryId) {
      await adminClient.from('wineries').delete().eq('id', testWineryId);
    }
    if (testUnenrichedWineryId) {
      await adminClient.from('wineries').delete().eq('id', testUnenrichedWineryId);
    }
  });
```

#### Edit 4: Add test asserting ratings, review count, Vibe Tags, and enrichment tier
- **Line Anchor:** Lines 76–103
- **Original Content:**
```typescript
  describe('get_map_markers RPC Execution (BE-07)', () => {
    it('should execute get_map_markers accurately for an authenticated user', async () => {
      // Add favorite and visit for user1
      await adminClient.from('favorites').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        is_private: false,
      });
      await adminClient.from('visits').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        visit_date: '2026-09-02',
        is_private: false,
      });

      const { data, error } = await user1.client.rpc('get_map_markers', {
        p_user_id: user1.id,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      const testMarker = data.find((m: any) => m.id === testWineryId);
      expect(testMarker).toBeDefined();
      expect(testMarker.is_favorite).toBe(true);
      expect(testMarker.user_visited).toBe(true);
      expect(testMarker.on_wishlist).toBe(false);
    });
  });
```
- **Replacement Content:**
```typescript
  describe('get_map_markers RPC Execution (BE-07)', () => {
    it('should execute get_map_markers accurately for an authenticated user', async () => {
      // Add favorite and visit for user1
      await adminClient.from('favorites').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        is_private: false,
      });
      await adminClient.from('visits').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        visit_date: '2026-09-02',
        is_private: false,
      });

      const { data, error } = await user1.client.rpc('get_map_markers', {
        p_user_id: user1.id,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      const testMarker = data.find((m: any) => m.id === testWineryId);
      expect(testMarker).toBeDefined();
      expect(testMarker.is_favorite).toBe(true);
      expect(testMarker.user_visited).toBe(true);
      expect(testMarker.on_wishlist).toBe(false);
    });

    it('should return ratings, user_rating_count, vibe tags, and enrichment_tier in marker payload', async () => {
      const { data, error } = await user1.client.rpc('get_map_markers', {
        p_user_id: user1.id,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);

      const enrichedMarker = data.find((m: any) => m.id === testWineryId);
      expect(enrichedMarker).toBeDefined();
      expect(enrichedMarker.google_rating).toBe(4.8);
      expect(enrichedMarker.user_rating_count).toBe(125);
      expect(enrichedMarker.allows_dogs).toBe(true);
      expect(enrichedMarker.good_for_children).toBe(false);
      expect(enrichedMarker.outdoor_seating).toBe(true);
      expect(enrichedMarker.has_ev_charging).toBe(true);
      expect(enrichedMarker.enrichment_tier).toBe('enriched');

      const unenrichedMarker = data.find((m: any) => m.id === testUnenrichedWineryId);
      expect(unenrichedMarker).toBeDefined();
      expect(unenrichedMarker.google_rating).toBeNull();
      expect(unenrichedMarker.user_rating_count).toBeNull();
      expect(unenrichedMarker.allows_dogs).toBeNull();
      expect(unenrichedMarker.good_for_children).toBeNull();
      expect(unenrichedMarker.outdoor_seating).toBeNull();
      expect(unenrichedMarker.has_ev_charging).toBeNull();
      expect(unenrichedMarker.enrichment_tier).toBe('basic');
    });
  });
```

---

### 3.2 Target File 2: `supabase/migrations/20261007090000_enrich_map_markers_rpc.sql`

- **Action:** Create new migration file
- **Exact Code Content:**
```sql
-- Migration: 20261007090000_enrich_map_markers_rpc.sql
-- Description: Expand get_map_markers RPC with ratings, review count, Vibe Tag columns, and enrichment tier (Issue #44)

-- Safe transaction migration: Drop existing function and recreate with expanded RETURNS TABLE signature
DROP FUNCTION IF EXISTS public.get_map_markers(uuid);

CREATE OR REPLACE FUNCTION public.get_map_markers(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(
    id integer,
    google_place_id text,
    name text,
    latitude numeric,
    longitude numeric,
    is_favorite boolean,
    on_wishlist boolean,
    user_visited boolean,
    is_favorite_private boolean,
    on_wishlist_private boolean,
    google_rating numeric,
    user_rating_count integer,
    allows_dogs boolean,
    good_for_children boolean,
    outdoor_seating boolean,
    has_ev_charging boolean,
    enrichment_tier text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Security Enforcement: Only allow viewing own markers
    IF p_user_id IS NULL OR p_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only view your own map markers.';
    END IF;

    RETURN QUERY
    SELECT 
        w.id,
        w.google_place_id,
        w.name::text,
        w.latitude,
        w.longitude,
        (f.winery_id IS NOT NULL) AS is_favorite,
        (wi.winery_id IS NOT NULL) AS on_wishlist,
        (v.winery_id IS NOT NULL) AS user_visited,
        COALESCE(f.is_private, false) AS is_favorite_private,
        COALESCE(wi.is_private, false) AS on_wishlist_private,
        w.google_rating,
        w.user_rating_count,
        w.allows_dogs,
        w.good_for_children,
        w.outdoor_seating,
        w.has_ev_charging,
        COALESCE(w.enrichment_tier, 'basic')::text AS enrichment_tier
    FROM public.wineries w
    LEFT JOIN (
        SELECT winery_id, is_private 
        FROM public.favorites 
        WHERE user_id = p_user_id
    ) f ON f.winery_id = w.id
    LEFT JOIN (
        SELECT winery_id, is_private 
        FROM public.wishlist 
        WHERE user_id = p_user_id
    ) wi ON wi.winery_id = w.id
    LEFT JOIN (
        SELECT DISTINCT winery_id 
        FROM public.visits 
        WHERE user_id = p_user_id
    ) v ON v.winery_id = w.id;
END;
$$;

ALTER FUNCTION public.get_map_markers(uuid) OWNER TO postgres;
GRANT ALL ON FUNCTION public.get_map_markers(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_map_markers(uuid) FROM anon, public;
```

---

### 3.3 Target File 3: `conductor/tracks/explore-enrichment-sync_20261006/plan.md`

- **Line Anchor:** Line 12
- **Initial Status Edit:**
```markdown
- [~] Task: Expand `get_map_markers` RPC with ratings, review count, and Vibe Tag columns (TDD)
```
- **Completion Edit:**
```markdown
- [x] Task: Expand `get_map_markers` RPC with ratings, review count, and Vibe Tag columns (TDD) [commit: <commit_hash>]
    - [x] Write failing database RPC integration tests in `lib/services/__tests__/db-optimization.integration.test.ts` checking returned ratings, review counts, and Vibe Tag fields
    - [x] Author safe transaction migration `supabase/migrations/<timestamp>_enrich_map_markers_rpc.sql` executing `DROP FUNCTION IF EXISTS public.get_map_markers(uuid);` and `CREATE OR REPLACE FUNCTION public.get_map_markers` with expanded `RETURNS TABLE`
    - [x] Run migration on local Supabase stack (`npm run db:start`) and verify integration tests pass
```

---

## 4. Step-by-Step TDD Execution Protocol

### Step 1: Mark Task In Progress in `plan.md`
Update line 12 of `conductor/tracks/explore-enrichment-sync_20261006/plan.md`:
`- [ ]` -> `- [~]`

### Step 2: Red Phase (Failing Integration Test)
1. Apply the replacement edits to `lib/services/__tests__/db-optimization.integration.test.ts`.
2. Run the integration test in the container runner (`BypassSandbox: true`):
   ```bash
   npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts
   ```
3. Verify test failure: The test fails because `enrichedMarker.google_rating` is `undefined` on the existing unexpanded RPC return payload. Confirm the Red phase is documented.

### Step 3: Green Phase (Apply Migration & Pass Tests)
1. Create `supabase/migrations/20261007090000_enrich_map_markers_rpc.sql` with the exact SQL content provided in Section 3.2.
2. Apply the migration to the local Supabase stack (`BypassSandbox: true`):
   ```bash
   npm run db:start
   ```
3. Re-run the integration test in the container runner (`BypassSandbox: true`):
   ```bash
   npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts
   ```
4. Verify all tests in `lib/services/__tests__/db-optimization.integration.test.ts` pass cleanly (100% green).

### Step 4: Commit Implementation Changes
1. Stage modified test file and new migration (`BypassSandbox: true`):
   ```bash
   git add lib/services/__tests__/db-optimization.integration.test.ts supabase/migrations/20261007090000_enrich_map_markers_rpc.sql
   ```
2. Commit with standard message (`BypassSandbox: true`):
   ```bash
   git commit -m "feat(db): Expand get_map_markers RPC with ratings, review count, and Vibe Tag columns (TDD)"
   ```

### Step 5: Attach Task Summary using Git Notes
1. Retrieve commit SHA (`BypassSandbox: true`):
   ```bash
   TASK_COMMIT_SHA=$(git log -1 --format="%H")
   ```
2. Attach note (`BypassSandbox: true`):
   ```bash
   git notes add -m "Phase 2 Task 1 Summary: Expand get_map_markers RPC with ratings, review count, and Vibe Tag columns (TDD)

Task Objective:
Expand get_map_markers RPC to include ratings, user_rating_count, Vibe Tag columns, and enrichment_tier to eliminate data divergence between map markers and the Explore tab sidebar.

Changes Made:
1. lib/services/__tests__/db-optimization.integration.test.ts: Added integration test assertions for enriched and un-enriched map marker records verifying ratings, user_rating_count, vibe tags (allows_dogs, good_for_children, outdoor_seating, has_ev_charging), and enrichment_tier fallback.
2. supabase/migrations/20261007090000_enrich_map_markers_rpc.sql: Safe migration executing DROP FUNCTION IF EXISTS public.get_map_markers(uuid) and CREATE OR REPLACE FUNCTION public.get_map_markers(p_user_id uuid DEFAULT auth.uid()) returning expanded table columns.

Verification:
- Integration tests ran via container runner (npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts) demonstrating Red-Green TDD cycle.
- Local Supabase stack updated via npm run db:start." $TASK_COMMIT_SHA
   ```

### Step 6: Update Plan and Commit Plan Update
1. Retrieve short commit SHA (`git log -1 --format="%h"`).
2. Update `conductor/tracks/explore-enrichment-sync_20261006/plan.md` line 12 from `[~]` to `[x]` with `[commit: <short_sha>]` and mark subtasks checked.
3. Commit plan update (`BypassSandbox: true`):
   ```bash
   git add conductor/tracks/explore-enrichment-sync_20261006/plan.md
   git commit -m "conductor(plan): Mark task 'Expand get_map_markers RPC with ratings, review count, and Vibe Tag columns (TDD)' as complete"
   ```

---

## 5. Execution Verification Protocol

To empirically verify the implementation during execution, run:
1. **Red Test Run (Pre-Migration):**
   ```bash
   npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts
   ```
   *Expected:* Fails on `enrichedMarker.google_rating` undefined.
2. **Migration Application:**
   ```bash
   npm run db:start
   ```
   *Expected:* Local Supabase instance starts and applies `20261007090000_enrich_map_markers_rpc.sql`.
3. **Green Test Run (Post-Migration):**
   ```bash
   npm run test:integration:container -- lib/services/__tests__/db-optimization.integration.test.ts
   ```
   *Expected:* 2 passing tests in `get_map_markers RPC Execution (BE-07)`, 1 passing test in `is_visible_to_viewer RLS Contract (BE-09)`, 0 failures.
