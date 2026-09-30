# Specification: Winery Operational Hours Resilience & PWA Hydration (Issue #56)

## Overview
Resolves Issue [#56](https://github.com/jarredb9/finger-lakes-app-57/issues/56) based on architectural proposal `conductor/proposals/winery-hours-resilience-and-root-cause.md`.

Eliminates the false-closed defect across all winery presentational surfaces, hardens on-demand Places API enrichment for numeric database ID lookups, decouples initial modal rendering from background detail enrichment, and introduces selective cache invalidation / session-backed store re-hydration during PWA updates.

In accordance with [CONTEXT.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/CONTEXT.md):
- **Operational Hours**: The structured weekly schedule of open and close periods and weekday descriptions associated with a Winery.
- **Operational Status**: The real-time determination (`Open`, `Closed`, or `Hours Unavailable`) of whether a Winery is currently admitting visitors based on its Operational Hours.
- **Core Invariant**: The application must never present a Winery as definitively "Closed" when its `Operational Hours` are indeterminate or missing. Missing or in-flight hours must be clearly designated as `Hours Unavailable` with appropriate loading skeleton states.

## Settled Architectural Decisions

1. **Tri-State Operational Status & Decoupled Loading Presentation**:
   - Status badge representation across surfaces:
     - `isOpen === true`: Green pulsating dot + "OPEN NOW" (desktop modal) / `🟢 OPEN NOW` (mobile drawer).
     - `isOpen === false`: Red dot + "CLOSED" (desktop modal) / `🔴 CLOSED` (mobile drawer).
     - `isOpen === null`:
       - If `isLoading`:
         - Desktop modal: Render animated skeleton pill (`h-3 w-16 bg-muted-foreground/20 animate-pulse rounded`).
         - Mobile drawer peek badge: Render animated skeleton pill (`h-6 w-24 bg-white/20 animate-pulse rounded-full`).
       - If not loading: Neutral gray dot (`bg-muted-foreground`) + "HOURS UNAVAILABLE" (desktop modal) / `⚪ HOURS UNAVAILABLE` (mobile drawer).
   - Layout-level skeleton decoupling:
     - `DesktopWineryLayout`, `MobileWineryLayout`, and `TabletWineryLayout` only render top-level full-screen skeleton when `!winery` (no cached data in memory).
     - When basic winery data exists in memory, render the layout immediately and pass `isLoading` down to `WineryDetails` and `WineryInfoCard` to show skeleton pills for pending fields while Places API enrichment runs in the background.
   - Thumbnail card (`components/winery-card-thumbnail.tsx`):
     - Cleanly omit the status badge when `isOpen === null` to avoid visual clutter on dense list surfaces (search results, wishlist, trip stops), reserving badges for explicit `Open`, `Closed`, and user collection tags (`Favorite`, `Visited`, `Want to Go`).
   - Schedule subtext & website fallback in `WineryInfoCard`:
     - Consume `getDailyHoursForDate(winery.openingHours)` from `lib/utils/opening-hours.ts`.
     - When hours are available, render today's hours string and weekly dropdown toggle.
     - When hours are `null` and `isLoading === false`: render "Hours Unavailable" subtext. If `winery.website` is present, render a direct "Check website" link/icon alongside; otherwise display only "Hours Unavailable".

2. **On-Demand Google Places Enrichment Hardening**:
   - In `lib/stores/wineryStore.ts` (`ensureWineryDetails`), when `placeId` is a numeric database ID (`/^\d+$/.test(placeId)`), query Postgres RPC `get_winery_details_by_id`.
   - If returned `dbData` lacks `opening_hours` or is un-enriched, do not abort; resolve `dbData.google_place_id` and invoke `invokeFunction('get-winery-details', { body: { placeId: dbData.google_place_id } })`.
   - Maintain `loadingWineryId` active during pending on-demand enrichment, setting it back to `null` on completion or failure.
   - If `dbData.google_place_id` is missing or the Edge Function returns an error (4xx/5xx/timeout), gracefully return the standardized `dbData` with `openingHours: null`, log a warning, and ensure `loadingWineryId` is cleared without stalling `inFlightRevalidations`.
   - Update `revalidateInBackground` to resolve `google_place_id` when given a numeric database ID.

3. **PWA Invalidation, Selective Migration & Session-Backed Modal Restore**:
   - Update `wineryStore.ts` Zustand `persist` configuration to `version: 2`.
   - Implement a selective `migrate` callback:
     - Purge only corrupted or stale records claiming `enrichment_tier === 'enriched' | 'full'` that lack `openingHours` or have invalid structures.
     - Preserve basic map marker records (`enrichment_tier === 'basic'` or valid coordinates) to guarantee offline map availability across PWA updates.
   - In `hooks/use-pwa-update.ts`:
     - When the user triggers `applyUpdate()`, set `sessionStorage.setItem('_PWA_JUST_UPDATED', String(Date.now()))`.
     - If an active modal is open (`useUIStore.getState().activeWineryId`), store `sessionStorage.setItem('_PWA_ACTIVE_WINERY_ID', activeWineryId)`.
     - Send `SKIP_WAITING` to trigger `controllerchange` and reload.
     - Keep `use-pwa-update.ts` completely decoupled from domain data stores (do not invoke `fetchWineryData`).
   - On post-update reload:
     - `WineryMap`'s standard mount effect handles `fetchWineryData(userId)`.
     - In `components/modals/authenticated-modal-host.tsx`, a mount effect detects `_PWA_ACTIVE_WINERY_ID`, invokes `openWineryModal(id)` and `ensureWineryDetails(id)`, and clears the session item.

4. **Strict Test-Driven Development (TDD) Lifecycle & Permanent Test Retention**:
   - All phases follow strict Red-Green-Refactor cycles with failing unit/integration tests written before implementation code.
   - All unit, integration, and E2E test suites created during the track are retained permanently as regression protection. Scaffolding cleanup applies exclusively to temporary test mocks, scratch files, or redundant test harnesses.

## Functional Requirements
- **FR-1**: Replace binary open/closed status with tri-state status handling across `winery-info-card.tsx`, `mobile-winery-drawer.tsx`, and `winery-card-thumbnail.tsx`.
- **FR-2**: Decouple top-level layout loading from detail enrichment so cached wineries render immediately with field-level loading skeleton pills.
- **FR-3**: Indeterminate hours render as "HOURS UNAVAILABLE" / "Hours Unavailable" with animated loading skeleton states when `isLoading` is true.
- **FR-4**: Daily hours display uses `getDailyHoursForDate` and provides website link fallback when hours are missing.
- **FR-5**: Numeric DB ID lookup in `ensureWineryDetails` resolves `google_place_id` and triggers Edge Function enrichment when Postgres lacks `opening_hours`, with resilient error handling.
- **FR-6**: `revalidateInBackground` resolves numeric IDs to `google_place_id` and prevents in-flight set deadlock on error.
- **FR-7**: Zustand persistence bumped to version 2 with selective migration purging only corrupt/stale enriched records while retaining basic map markers.
- **FR-8**: PWA update toast stores `_PWA_ACTIVE_WINERY_ID` in `sessionStorage`, and `AuthenticatedModalHost` re-opens and enriches the modal on post-update reload.
- **FR-9**: All written test suites retained permanently as regression coverage with zero regressions across Jest and Playwright.

## Non-Functional Requirements
- **Domain Invariant Compliance**: Strict adherence to `CONTEXT.md` operational hours and status definitions (`Open`, `Closed`, `Hours Unavailable`).
- **Zero Breaking Changes**: Existing database RPCs and Edge Function contracts remain backward-compatible.
- **Offline Map Safety**: Migration must not wipe basic map markers needed for offline functionality.
- **Responsive & Touch Accessibility**: Mobile drawer maintains smooth gestures and touch targets >= 44px.
- **Strict TDD & Quality Gates**: Failing tests precede implementations; all containerized tests pass.

## Acceptance Criteria
- [ ] `winery-info-card.tsx` displays "HOURS UNAVAILABLE" and loading skeleton pill instead of "Closed" when hours are null/undefined.
- [ ] `mobile-winery-drawer.tsx` peek badge renders animated skeleton pill when `isLoading === true` and `⚪ HOURS UNAVAILABLE` when `isOpenNow` is null.
- [ ] `winery-card-thumbnail.tsx` cleanly omits badge when hours are null.
- [ ] Layouts render cached winery data immediately and show skeleton pills for pending fields rather than full-screen skeletons.
- [ ] `ensureWineryDetails` successfully enriches wineries requested by numeric database ID when DB hours are missing, and gracefully handles missing place IDs or edge function errors.
- [ ] Zustand store version 2 migration selectively cleans corrupted enriched records from IndexedDB while preserving basic map markers.
- [ ] PWA update restores open modal on reload via session storage without coupling `use-pwa-update.ts` to stores.
- [ ] Full Jest and Playwright test suites pass in containerized runners with zero regressions.

## Out of Scope
- Backend Edge Function payload schema redesign.
- Global Supabase database backfill migration for all historic wineries.
