# Specification: Winery Operational Hours Resilience & PWA Hydration (Issue #56)

## Overview
Resolves Issue [#56](https://github.com/jarredb9/finger-lakes-app-57/issues/56) based on architectural proposal `conductor/proposals/winery-hours-resilience-and-root-cause.md`.

Eliminates the false-closed defect across all winery presentational surfaces, hardens on-demand Places API enrichment for numeric database ID lookups, and introduces cache invalidation / store re-hydration during PWA updates.

In accordance with [CONTEXT.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/CONTEXT.md):
- **Operational Hours**: The structured weekly schedule of open and close periods and weekday descriptions associated with a Winery.
- **Operational Status**: The real-time determination (`Open`, `Closed`, or `Hours Unavailable`) of whether a Winery is currently admitting visitors based on its Operational Hours.
- **Core Invariant**: The application must never present a Winery as definitively "Closed" when its `Operational Hours` are indeterminate or missing. Missing or in-flight hours must be clearly designated as `Hours Unavailable` with appropriate loading skeleton states.

## Settled Architectural Decisions

1. **Tri-State Operational Status & UI Display Convention**:
   - Status badge representation:
     - `isOpen === true`: Green pulsating dot + "OPEN NOW" (desktop modal) / `🟢 OPEN NOW` (mobile drawer).
     - `isOpen === false`: Red dot + "CLOSED" (desktop modal) / `🔴 CLOSED` (mobile drawer).
     - `isOpen === null`:
       - If `isLoading`: Render animated skeleton pill (`h-3 w-16 bg-muted-foreground/20 animate-pulse rounded`).
       - If not loading: Neutral gray dot (`bg-muted-foreground`) + "HOURS UNAVAILABLE" (desktop modal) / `⚪ HOURS UNAVAILABLE` (mobile drawer).
   - Thumbnail card: Render `Hours Unavailable` or cleanly omit without ever defaulting `null` to `Closed`.
   - Today's schedule line: Consume `getDailyHoursForDate(winery.openingHours)` from `lib/utils/opening-hours.ts` (foundation in v3.6.1). If `null`, render "Hours Unavailable" with a fallback link or button to `winery.website` if available.

2. **On-Demand Google Places Enrichment Hardening**:
   - In `lib/stores/wineryStore.ts` (`ensureWineryDetails`), when `placeId` is a numeric database ID (`/^\d+$/.test(placeId)`), query Postgres RPC `get_winery_details_by_id`.
   - If returned `dbData` lacks `opening_hours` or is un-enriched, do not abort; resolve `dbData.google_place_id` and invoke `invokeFunction('get-winery-details', { body: { placeId: dbData.google_place_id } })`.
   - Maintain `loadingWineryId` active during pending on-demand enrichment.
   - Guard against hanging background revalidations: ensure `inFlightRevalidations` catches errors and removes in-flight keys cleanly.

3. **PWA Invalidation & Store Re-hydration**:
   - Update `wineryStore.ts` Zustand `persist` configuration to `version: 2`.
   - Provide a `migrate` callback that filters `persistentWineries` to purge records lacking `last_enriched_at` or `openingHours`.
   - In `hooks/use-pwa-update.ts`, when update is applied (`SKIP_WAITING`), set `sessionStorage.setItem('_PWA_JUST_UPDATED', String(Date.now()))`.
   - On post-update reload, detect `_PWA_JUST_UPDATED`, invoke `fetchWineryData()`, and re-hydrate the active winery modal if open.

4. **Strict Test-Driven Development (TDD) Lifecycle & Scaffolding Cleanup**:
   - All phases follow strict Red-Green-Refactor cycles with failing unit/integration tests written before implementation code.
   - Dedicated cleanup phase audits all tests and removes temporary scaffolding fixtures, preserving permanent regression test suites.

## Functional Requirements
- **FR-1**: Replace binary open/closed status with tri-state status handling across `winery-info-card.tsx`, `mobile-winery-drawer.tsx`, and `winery-card-thumbnail.tsx`.
- **FR-2**: Indeterminate hours render as "HOURS UNAVAILABLE" / "Hours Unavailable" with loading skeleton state when `isLoading` is true.
- **FR-3**: Daily hours display uses `getDailyHoursForDate` and provides website link fallback when hours are missing.
- **FR-4**: Numeric DB ID lookup in `ensureWineryDetails` resolves `google_place_id` and triggers Edge Function enrichment when Postgres lacks `opening_hours`.
- **FR-5**: In-flight revalidations handle rejected promises without deadlock.
- **FR-6**: Zustand persistence bumped to version 2 with migration purging un-enriched records from IndexedDB.
- **FR-7**: PWA update toast reload triggers immediate background winery re-fetch.
- **FR-8**: Scaffolding tests removed before track completion while maintaining >80% coverage and zero regressions.

## Non-Functional Requirements
- **Domain Invariant Compliance**: Strict adherence to `CONTEXT.md` operational hours and status definitions.
- **Zero Breaking Changes**: Existing database RPCs and Edge Function contracts remain backward-compatible.
- **Responsive & Touch Accessibility**: Mobile drawer maintains smooth gestures and touch targets >= 44px.
- **Strict TDD & Quality Gates**: Failing tests precede implementations; all containerized tests pass.

## Acceptance Criteria
- [ ] `winery-info-card.tsx` displays "HOURS UNAVAILABLE" and loading skeleton instead of "Closed" when hours are null/undefined.
- [ ] `mobile-winery-drawer.tsx` peek badge renders `⚪ HOURS UNAVAILABLE` when `isOpenNow` is null.
- [ ] `winery-card-thumbnail.tsx` does not display "Closed" for null hours.
- [ ] `ensureWineryDetails` successfully enriches wineries requested by numeric database ID when DB hours are missing.
- [ ] Zustand store version 2 migration purges un-enriched records from IndexedDB on startup.
- [ ] PWA update triggers re-hydration on reload.
- [ ] Scaffolding tests audited and removed; full Jest and Playwright test suites pass.

## Out of Scope
- Backend Edge Function payload schema redesign.
- Global Supabase database backfill migration for all historic wineries.
