# Specification: Database Performance Optimization, RPC Hardening & Schema Integrity

## 1. Overview & Context
The technical debt audit and GitHub Issue #35 ("Backend & Database Track") identified critical performance bottlenecks, N+1 query patterns, and architectural rot in the Postgres schema, client services, and Supabase Edge Functions:
1. Critical foreign key and lookup relationships lack covering indexes, triggering sequential table scans during joins and cascades.
2. `get_map_markers` evaluates correlated subqueries per row, creating high CPU overhead and query latency under load.
3. Row Level Security policies evaluate procedural PL/pgSQL functions (`is_visible_to_viewer`) per row that cannot be inlined by the Postgres query optimizer.
4. Client toggles for favorites and wishlists execute redundant dual-write roundtrips (`toggle_favorite` followed by `ensureInDb`).
5. Next.js API route `/api/wineries` uses deprecated Google Places endpoints and unawaited floating promise IIFEs.
6. SQL migrations contain hardcoded production URLs/secrets, non-idempotent DDL, and orphaned Edge Functions (`update-gemini-summary`).

This track resolves all 9 remaining items in Issue #35 (`BE-06`, `BE-07`, `BE-08`, `BE-09`, `BE-10`, `BE-12`, `BE-13`, `BE-14`, `BE-15`), closing out Sprint 2 of Milestone v3.6.0.

---

## 2. Technical & Functional Requirements

### 2.1 Relational Indexes & Query Performance
- **[BE-06] Covering Foreign Key & Lookup Indexes**:
  - Add explicit btree indexes with `IF NOT EXISTS` in a new migration:
    - `idx_visits_user_id ON public.visits (user_id)`
    - `idx_visits_winery_id ON public.visits (winery_id)`
    - `idx_visits_winery_user ON public.visits (winery_id, user_id)`
    - `idx_trip_wineries_winery_id ON public.trip_wineries (winery_id)`
    - `idx_trip_members_user_id ON public.trip_members (user_id)`
    - `idx_follows_following_id ON public.follows (following_id)`
    - `idx_wineries_name ON public.wineries (name)`
- **[BE-08] Composite Index on `activity_ledger`**:
  - Create composite index `idx_activity_ledger_type_object ON public.activity_ledger (activity_type, object_id)` to eliminate table scans on visit logging and social notifications.
- **[BE-07] Refactor `get_map_markers` Correlated Subqueries**:
  - Rewrite `get_map_markers` RPC to use set-based hash joins (`LEFT JOIN` with pre-filtered subqueries) with `SET search_path = public, pg_temp`, removing all per-row scalar subqueries.
- **[BE-09] Inline RLS Policy Logic on `visits`**:
  - Refactor `is_visible_to_viewer` function to `LANGUAGE sql STABLE` or inline the visibility predicates directly into the `visits` RLS `USING` clause to enable query planner inlining.

### 2.2 RPC Contracts & Service Cleanups
- **[BE-10] Single RPC Roundtrip on Favorite/Wishlist Toggles**:
  - Update `toggle_favorite` RPC to return `jsonb_build_object('is_favorite', v_is_favorite, 'winery_id', v_winery_id)`.
  - Refactor `lib/services/wineryService.ts` to consume the composite JSON return value in a single call, eliminating the secondary `ensureInDb` upsert roundtrip.
- **[BE-14] Places API V1 Migration & Promise Await in `/api/wineries`**:
  - Migrate `app/api/wineries/route.ts` to Places API (New) V1 endpoint.
  - Await database upsert operations properly or use Next.js `after()` to ensure reliable execution in serverless runtimes.
- **[BE-15] Strict Parameter Validation & Idempotent DDL**:
  - Ensure all schema changes adhere to expand-and-contract standards using `IF NOT EXISTS` / `IF EXISTS`.
  - Add input and UUID format validation on RPC functions.

### 2.3 Security Configuration & Function Cleanup
- **[BE-12] Eliminate Hardcoded Supabase URLs & Secrets in SQL**:
  - Parameterize webhook URL and secrets in notification webhook triggers via `current_setting('app.settings.supabase_url', true)` / Vault settings instead of hardcoded project URLs (`https://jfsxclrdxmvftxacjuqf.supabase.co`).
- **[BE-13] Prune Orphaned Edge Function (`update-gemini-summary`)**:
  - Delete orphaned directory `supabase/functions/update-gemini-summary/` and verify all AI enrichment routes exclusively through the unified `enrich-winery` function (`_shared/gemini.ts`).

---

## 3. Non-Functional & Guardrail Requirements
- **Production Database Safety (AGENTS.md)**: Zero mutations/DDL against remote Supabase (`jfsxclrdxmvftxacjuqf`). All migrations must be applied locally via `npm run db:start` and verified with `npm run db:populate`.
- **Expand-and-Contract Migrations**: Schema alterations must remain backwards-compatible for live running instances.
- **Lazy Enrichment Policy**: Verify `last_enriched_at` (< 30 days freshness) before invoking external Places / Gemini APIs.
- **Type Generation**: Run `npm run db:gen-types` after migrations and verify types with `npm run db:check-types:local`.
- **Test Isolation**: All unit tests must continue running offline without database container dependencies.

---

## 4. Acceptance Criteria
- [ ] Explicit covering indexes created and verified for `visits`, `trip_wineries`, `trip_members`, `follows`, `wineries`, and `activity_ledger`.
- [ ] `EXPLAIN ANALYZE` on `get_map_markers` demonstrates hash joins and zero correlated per-row subqueries.
- [ ] `visits` RLS policy inlines cleanly into query plans without per-row PL/pgSQL overhead.
- [ ] Toggling favorite/wishlist in `wineryService.ts` executes exactly 1 network request.
- [ ] `/api/wineries` reliably awaits upserts and conforms to Places API (New).
- [ ] Zero hardcoded production URLs or service keys exist in `supabase/migrations/`.
- [ ] Orphaned `update-gemini-summary` Edge Function directory is removed.
- [ ] `npm run db:check-types:local` passes with freshly generated `lib/database.types.ts`.
- [ ] `npm run test:functions` passes all Deno test suites.
- [ ] `CI=true npm test` passes with zero regressions.
