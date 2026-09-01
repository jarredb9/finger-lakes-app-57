# Track Proposal: Database Performance Optimization, RPC Hardening & Schema Integrity

## Track Metadata
- **Proposed Track ID**: `db-optimization-rpc-hardening_20260901`
- **Track Name**: Database Performance Optimization, RPC Hardening & Schema Integrity
- **Track Type**: `refactor`
- **Target Milestone**: [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1)
- **Parent Epic**: [#39 (Sprint 2: Database Performance, Indexing & Storage Resilience)](https://github.com/jarredb9/finger-lakes-app-57/issues/39)
- **Referenced Issues**: [#35 (Supabase, Postgres RPCs, RLS & Edge Functions Architecture)](https://github.com/jarredb9/finger-lakes-app-57/issues/35)

---

## 1. Overview & Context
The technical debt audit identified severe performance bottlenecks, N+1 query patterns, and architectural rot in the Postgres schema and Supabase Edge Functions:
1. Critical foreign key relationships lack covering indexes, triggering sequential table scans during join resolution.
2. `get_map_markers` evaluates correlated subqueries per row, creating high CPU overhead and query latency under load.
3. Row Level Security policies evaluate procedural PL/pgSQL functions (`is_visible_to_viewer`) per row that cannot be inlined by the Postgres query optimizer.
4. Client toggles for favorites and wishlists execute redundant dual-write roundtrips (`toggle_favorite` followed by `ensureInDb`).
5. SQL migrations contain hardcoded production URLs/secrets, non-idempotent DDL, and orphaned Edge Functions (`update-gemini-summary`).

This track resolves **Sprint 2** of Milestone v3.6.0, ensuring high-throughput query execution, clean migration patterns, and hardened Edge Functions before frontend state unification.

---

## 2. Guardrails & Operational Constraints (AGENTS.md)
- **Production Database Safety**: Never execute migrations against remote Supabase (`jfsxclrdxmvftxacjuqf`). All migrations must be applied locally via `npm run db:start` and verified with `npm run db:populate` and `npm run test:functions`.
- **Expand-and-Contract Migrations**: Schema alterations must use `IF NOT EXISTS` / `IF EXISTS` and remain backwards compatible.
- **Lazy Enrichment Policy**: Verify `last_enriched_at` (< 30 days freshness) before invoking external Google Places / Gemini APIs.
- **Type Generation**: Run `npm run db:gen-types` after every migration to maintain parity in `lib/database.types.ts`.

---

## 3. Detailed Technical Requirements

### 3.1 Relational Indexes & Query Performance
- **[BE-06] Covering Foreign Key & Lookup Indexes**:
  - *Location*: [`supabase/migrations/`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/migrations/)
  - *Problem*: Foreign keys on `visits(user_id, winery_id)`, `trip_wineries(trip_id, winery_id)`, and `trip_members(trip_id, user_id)` lack explicit btree indexes, forcing table scans on cascading deletions and joined queries.
  - *Remediation*: Add covering indexes with `IF NOT EXISTS`.
- **[BE-08] Composite Index on `activity_ledger`**:
  - *Location*: [`supabase/migrations/20260609161719_configure_social_notification_webhook.sql`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/migrations/20260609161719_configure_social_notification_webhook.sql)
  - *Problem*: Trigger queries `activity_ledger` by `(activity_type, object_id)` without an index, resulting in table scans on every logged visit or social interaction.
  - *Remediation*: Create composite index `idx_activity_ledger_type_object ON activity_ledger (activity_type, object_id)`.
- **[BE-07] Refactor `get_map_markers` Correlated Subqueries**:
  - *Location*: [`supabase/migrations/20260528000000_v2.11.0-stable.sql#L1820-L1910`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/migrations/20260528000000_v2.11.0-stable.sql#L1820-L1910)
  - *Problem*: Evaluates correlated subqueries for visit counts, user visit status, and favorites for every winery row.
  - *Remediation*: Rewrite `get_map_markers` RPC to use hash joins (`LEFT JOIN LATERAL` or aggregated subqueries) with `SET search_path = public, pg_temp`.
- **[BE-09] Inline RLS Policy Logic on `visits`**:
  - *Location*: [`supabase/migrations/20260528000000_v2.11.0-stable.sql#L2019-L2075`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/migrations/20260528000000_v2.11.0-stable.sql#L2019-L2075)
  - *Problem*: `is_visible_to_viewer` is PL/pgSQL, which Postgres cannot inline into query plans, causing row-by-row function overhead.
  - *Remediation*: Refactor function to `LANGUAGE sql STABLE` or inline the boolean predicates directly into the RLS `USING` clause.

### 3.2 RPC Contracts & Service Cleanups
- **[BE-10] Single RPC Roundtrip on Favorite/Wishlist Toggles**:
  - *Location*: [`lib/services/wineryService.ts#L87-L95`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/wineryService.ts#L87-L95), [`supabase/migrations/`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/migrations/)
  - *Problem*: `toggle_favorite` returns only a boolean, requiring the client to execute a secondary `ensureInDb` upsert.
  - *Remediation*: Update RPC to return `jsonb_build_object('is_favorite', v_is_favorite, 'winery_id', v_winery_id)` and update `wineryService.ts` to perform a single call.
- **[BE-14] Places API V1 Migration & Promise Await in `/api/wineries`**:
  - *Location*: [`app/api/wineries/route.ts#L23-L24`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/api/wineries/route.ts#L23-L24), [`app/api/wineries/route.ts#L46-L72`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/api/wineries/route.ts#L46-L72)
  - *Problem*: Uses legacy Google Places text search endpoint and executes an unawaited floating promise IIFE for DB upsert.
  - *Remediation*: Migrate route to Places API (New) V1 and await DB operations or utilize Next.js `after()`.
- **[BE-15] Strict Parameter Validation & Idempotent DDL**:
  - *Location*: Across all SQL migrations.
  - *Problem*: Migrations contain non-idempotent `ALTER TABLE ADD COLUMN` statements without `IF NOT EXISTS`.
  - *Remediation*: Add safety checks and UUID format validation across RPC functions.

### 3.3 Security Configuration & Function Cleanup
- **[BE-12] Eliminate Hardcoded Supabase URLs & Secrets in SQL**:
  - *Location*: [`supabase/migrations/20260609161719_configure_social_notification_webhook.sql#L21-L27`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/migrations/20260609161719_configure_social_notification_webhook.sql#L21-L27)
  - *Problem*: Hardcodes `https://jfsxclrdxmvftxacjuqf.supabase.co` and fallback secret `'your-service-role-key'`.
  - *Remediation*: Parameterize webhook URL using `current_setting('app.settings.supabase_url', true)` or Supabase Vault secret retrieval.
- **[BE-13] Prune Orphaned Edge Function (`update-gemini-summary`)**:
  - *Location*: [`supabase/functions/update-gemini-summary/`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/functions/update-gemini-summary/)
  - *Problem*: Directory is orphaned after its database trigger was removed in migration `20260730000000`, diverging from `_shared/gemini.ts`.
  - *Remediation*: Delete orphaned directory and ensure all enrichment flows use the unified `enrich-winery` architecture.

---

## 4. Acceptance Criteria
- [ ] Covering indexes exist on `visits`, `trip_wineries`, `trip_members`, and `activity_ledger`.
- [ ] `EXPLAIN ANALYZE` on `get_map_markers` demonstrates hash joins and zero correlated per-row subqueries.
- [ ] `visits` RLS policy inlines cleanly into query plans without per-row PL/pgSQL overhead.
- [ ] Toggling favorite/wishlist in `wineryService.ts` executes exactly 1 network request.
- [ ] `/api/wineries` reliably awaits upserts and conforms to Places API (New).
- [ ] Zero hardcoded production URLs or service keys exist in `supabase/migrations/`.
- [ ] Orphaned `update-gemini-summary` Edge Function directory is removed.
- [ ] `npm run db:check-types:local` passes with freshly generated `lib/database.types.ts`.
- [ ] `npm run test:functions` passes all Deno test suites.

---

## 5. Proposed Phased Implementation Plan

### Phase 1: Database Migration for Indexes & Query Inlining
- [ ] Task: Write integration test validating query planner execution for `get_map_markers` and `visits` RLS
- [ ] Task: Create migration `20260902100000_indexes_and_query_optimization.sql` adding indexes and rewriting `get_map_markers` and `is_visible_to_viewer`
- [ ] Task: Apply migration locally, run `npm run db:gen-types`, and verify with `npm run db:check-types:local`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Indexes & Query Inlining' (Protocol in workflow.md)

### Phase 2: RPC Consolidation & Client Service Updates
- [ ] Task: Write unit tests in `lib/services/__tests__/wineryService.test.ts` verifying single-roundtrip toggle behavior
- [ ] Task: Update `toggle_favorite` RPC in migration and refactor `wineryService.ts` to consume single response
- [ ] Task: Update `/api/wineries/route.ts` to use Places API (New) with proper promise completion
- [ ] Task: Conductor - User Manual Verification 'Phase 2: RPC Consolidation & Service Updates' (Protocol in workflow.md)

### Phase 3: Edge Function Cleanup & Secret Parameterization
- [ ] Task: Remove hardcoded project URLs in notification webhook migration, replacing with dynamic setting lookup
- [ ] Task: Remove orphaned `supabase/functions/update-gemini-summary/` directory
- [ ] Task: Run `npm run test:functions` to verify Edge Function test suite
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Edge Function Cleanup & Secret Parameterization' (Protocol in workflow.md)
