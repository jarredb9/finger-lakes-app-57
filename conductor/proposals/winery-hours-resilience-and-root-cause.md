# Architecture Proposal & Root Cause Plan: Winery Operational Hours Resilience & PWA Hydration

> **Target Issue:** [jarredb9/finger-lakes-app-57#56](https://github.com/jarredb9/finger-lakes-app-57/issues/56)  
> **Component Focus:** `components/winery/winery-info-card.tsx`, `components/winery/mobile-winery-drawer.tsx`, `lib/stores/wineryStore.ts`, `hooks/use-pwa-update.ts`, `app/sw.ts`  
> **Status:** Proposal & Plan (Pre-Implementation)  
> **Date:** September 28, 2026  

---

## 1. Executive Summary & Root Cause Confirmation

The reported bug in Issue #56 observed that Anyela's Vineyards (`p_winery_id: 2988`) was displayed on mobile iOS PWA on 09/26/2026 at 14:00 EDT as simply **"CLOSED"** with no operational hours or weekly dropdown, but rendered correctly as **"OPEN"** with weekly hours on desktop Chromium on 09/28/2026 at 07:30 EDT.

Through code and database artifact inspection, the root causes have been established empirically:

1. **Empirical Proof of Database Enrichment Timing (Hypothesis 3 Confirmed):**
   - The user-supplied JSON payload (`2988-details.json`) records `last_enriched_at: "2026-09-28T11:25:16.135+00:00"` (07:25:16 AM EDT on 09/28/2026).
   - This timestamp was written **less than 5 minutes before** the desktop Chromium observation at 07:30 AM EDT.
   - On Saturday 09/26/2026 at 14:00 EDT, the Supabase production database did not possess this enriched dataset; `opening_hours` in Postgres was `NULL` (or un-enriched). The desktop Chromium session at 07:25 AM EDT triggered `ensureWineryDetails`, which called `invokeFunction('get-winery-details')`, fetching from Google Places API v1 and updating Supabase at 07:25:16 AM EDT.

2. **The UI False-Closed Defect:**
   - In [`winery-info-card.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/winery-info-card.tsx#L53-L57) and [`mobile-winery-drawer.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/mobile-winery-drawer.tsx#L117):
     ```tsx
     const isOpen = isOpenNow(winery.openingHours);
     // ...
     <span className="uppercase tracking-wide text-foreground truncate">
       {isOpen ? "Open Now" : "Closed"}
     </span>
     // ...
     <span className="...">{isOpen ? "🟢 OPEN NOW" : "🔴 CLOSED"}</span>
     ```
   - When `winery.openingHours` is `null` or `undefined`, [`isOpenNow`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/utils/opening-hours.ts#L28) returns `null`. Both components evaluate `null` as falsy, rendering **"Closed"** and **"🔴 CLOSED"**.
   - Furthermore, the hours text and weekly dropdown accordion are guarded by `{winery.openingHours && (winery.openingHours.weekday_text || winery.openingHours.open_now !== undefined) && ...}`.
   - **Result:** Any winery whose hours are missing, pending remote enrichment, or nullified renders as falsely "CLOSED" with zero hours and no accordion, rather than indicating "Hours Unavailable" or showing a loading skeleton.

3. **Numeric ID Routing in [`ensureWineryDetails`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryStore.ts#L300):**
   - Line 300 of `wineryStore.ts` enforces:
     ```ts
     if (!/^\d+$/.test(placeId)) {
       const { data: googleData } = await invokeFunction('get-winery-details', { body: { placeId } });
     ```
   - If a caller initiates winery inspection via a numeric database ID (`dbId` / `p_winery_id` like `"2988"`), the function fetches from Postgres RPC `get_winery_details_by_id`. If Postgres does not yet have hours, the function skips the Edge Function fallback entirely, returning the un-enriched record to the UI.

4. **PWA Update Cache Invalidation Gap:**
   - In [`hooks/use-pwa-update.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-pwa-update.ts#L33-L49), clicking the "Update" button sends `SKIP_WAITING` to the waiting Service Worker and reloads via `window.location.reload()`.
   - The Service Worker activation event only flushes caches matching `supabase-auth`. IndexedDB ([`idbStorage`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/idb-persist-storage.ts)), which stores `persistentWineries`, persists untouched across reloads.
   - If a mobile client has an un-enriched or malformed winery record persisted in IndexedDB, reloading the app does not invalidate or re-hydrate that winery unless it passes the strict `isStaleRecord(last_enriched_at)` test.

---

## 2. Architectural Principles & Domain Boundary

Following [`CONTEXT.md`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/CONTEXT.md):
- **Operational Hours**: The structured weekly schedule of open and close periods and weekday descriptions associated with a Winery.
- **Operational Status**: The real-time determination (`Open`, `Closed`, or `Hours Unavailable`) of whether a Winery is currently admitting visitors based on its Operational Hours.
- **Core Invariant**: The application must never present a Winery as definitively "Closed" when its `Operational Hours` are indeterminate or missing. Missing or in-flight hours must be clearly designated as `Hours Unavailable` with appropriate loading states.

---

## 3. Detailed Implementation Plan

### Phase 1: Tri-State Operational Status & UI Resilience
**Objective:** Eliminate the false-closed bug across all winery presentational surfaces.

1. **Update [`components/winery/winery-info-card.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/winery-info-card.tsx):**
   - Consume `isLoading` state from `useWineryModalState` / props.
   - Refactor status badge rendering:
     - `isOpen === true`: Green pulsating dot + "OPEN NOW"
     - `isOpen === false`: Red dot + "CLOSED"
     - `isOpen === null`:
       - If `isLoading`: Render animated skeleton pill (`h-3 w-16 bg-muted-foreground/20 animate-pulse rounded`).
       - If not loading: Neutral gray dot (`bg-muted-foreground`) + "HOURS UNAVAILABLE".
   - Underneath the status badge:
     - If `winery.openingHours?.weekday_text`: Render today's hours string and weekly dropdown chevron.
     - If `winery.openingHours` is null/empty: Render "Hours not provided" with a direct link or button to the winery website if available (`winery.website`).

2. **Update [`components/winery/mobile-winery-drawer.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/mobile-winery-drawer.tsx):**
   - Refactor the hero overlay badge:
     ```tsx
     {isOpen === true && (
       <span data-testid="peek-open-status-tag" className="... bg-green-950/70 border-green-500/40 text-green-200">
         🟢 OPEN NOW
       </span>
     )}
     {isOpen === false && (
       <span data-testid="peek-open-status-tag" className="... bg-red-950/70 border-red-500/40 text-red-200">
         🔴 CLOSED
       </span>
     )}
     {isOpen === null && (
       <span data-testid="peek-open-status-tag" className="... bg-neutral-900/70 border-neutral-500/30 text-neutral-300">
         ⚪ UNVERIFIED
       </span>
     )}
     ```

3. **Update [`components/winery-card-thumbnail.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery-card-thumbnail.tsx):**
   - Ensure thumbnail status indicators respect the tri-state convention without defaulting `null` to `false`.

---

### Phase 2: On-Demand Enrichment & ID Resolution Hardening
**Objective:** Ensure that requesting winery details by numeric database ID or Google Place ID reliably triggers Google Places API v1 enrichment when hours are missing in Postgres.

1. **Harden [`ensureWineryDetails`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryStore.ts#L186-L329):**
   - When `placeId` is numeric (`/^\d+$/.test(placeId)`):
     - After querying `supabase.rpc('get_winery_details_by_id')`, extract `dbData.google_place_id`.
     - If `dbData` lacks `opening_hours` or is un-enriched, do not abort; resolve the `google_place_id` and invoke `invokeFunction('get-winery-details', { body: { placeId: dbData.google_place_id } })`.
   - Prevent background revalidation deduplication sets (`inFlightRevalidations`) from getting stuck if an invocation rejects.
   - When `dbData` is returned, if `opening_hours` is missing, ensure `loadingWineryId` remains active until the background edge function returns or fails gracefully.

2. **Audit All Selection Callers:**
   - Verify all invocation sites of `openWineryModal` and `ensureWineryDetails`:
     - Mapbox markers (`components/map/MapView.tsx`, `components/WineryMap.tsx`)
     - Search results (`components/map/WinerySearchResults.tsx`)
     - Wishlist & Favorites lists (`components/winery-card-thumbnail.tsx`)
     - Trip stops (`components/trip-card.tsx`, `components/TripCardPresentational.tsx`)
     - Global history (`components/global-visit-history.tsx`, `components/visit-history-modal.tsx`)
   - Standardize all callers to pass `winery.id` (canonical `GooglePlaceId`) whenever available.

---

### Phase 3: PWA Cache Invalidation & Store Revalidation
**Objective:** Guarantee that client-persisted IndexedDB state reconciles against newly deployed application code and database backfills upon PWA update.

1. **Store Migration & Versioning in [`lib/stores/wineryStore.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryStore.ts):**
   - Set Zustand `persist` configuration `version: 2`.
   - Define a `migrate` callback that flushes stale `persistentWineries` records whose `last_enriched_at` is null or lacks `openingHours`, forcing clean hydration on startup.

2. **PWA Update Lifecycle Hook in [`hooks/use-pwa-update.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-pwa-update.ts):**
   - When the user triggers `applyUpdate()`, dispatch a custom client event or set a timestamp flag in `sessionStorage` (`_PWA_JUST_UPDATED = Date.now()`).
   - On post-update reload, if `_PWA_JUST_UPDATED` is detected, trigger an immediate re-fetch of current map markers (`fetchWineryData`) and re-hydrate the active winery modal if open.

---

### Phase 4: Verification & Test Protocol

1. **Unit Tests (Containerized Jest):**
   - [`components/winery/__tests__/winery-info-card.test.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/__tests__/winery-info-card.test.tsx):
     - Assert `Open Now` renders when `isOpenNow === true`.
     - Assert `Closed` renders when `isOpenNow === false`.
     - Assert `Hours Unavailable` (neutral badge) renders when `openingHours === null` or `undefined`.
     - Assert skeleton renders when `isLoading === true`.
   - [`lib/stores/__tests__/wineryStore.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/__tests__/wineryStore.test.ts):
     - Test `ensureWineryDetails` when invoked with a numeric `dbId`: verify that it resolves `google_place_id` and invokes `get-winery-details` when Postgres has null `opening_hours`.

2. **Integration & E2E Verification (Playwright Container):**
   - Create or update an E2E test in `e2e/winery-hours-resilience.spec.ts`:
     - Mock a winery with `opening_hours: null`.
     - Assert drawer renders `⚪ UNVERIFIED` or `Hours Unavailable` rather than `🔴 CLOSED`.
     - Assert no broken dropdown toggle is shown.
     - Simulate background enrichment arrival and assert dynamic transition to `🟢 OPEN NOW` with weekly hours.
