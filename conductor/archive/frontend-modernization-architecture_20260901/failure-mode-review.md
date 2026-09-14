# Master Architectural & Failure Mode Review: Phases 2 through 7
**Initiative**: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization  
**Track**: `conductor/tracks/frontend-modernization-architecture_20260901/`  
**Author**: Lead Technical Writer & Architect Worker (`worker_doc_writer`)  
**Milestone**: v3.6.0 (Architectural Recovery & Test Reliability)  
**Target File**: `conductor/tracks/frontend-modernization-architecture_20260901/failure-mode-review.md`  
**Date**: 2026-09-11  
**Status**: Publication-Grade Review Complete  

---

## 1. Executive Summary & Architectural Risk Matrix

### 1.1 Architectural Evaluation & Readiness Overview
The Frontend Modernization initiative for the Winery Visit Planner and Tracker (`finger-lakes-app-57`) addresses foundational technical debt, bundle overhead, React 19 compiler compliance, App Router boundary enforcement, and offline Progressive Web App (PWA) resilience across seven structured phases. Phase 1 (*Dependency Pruning, Tooling Optimization & Turbopack Unblocking*) successfully established a clean dependency baseline (commit `1cbfaa1`).

This master review provides an exhaustive architectural evaluation and failure mode audit of **Phases 2 through 7** prior to implementation. Each phase was investigated against the active source codebase, Next.js 16 and React 19 runtime mechanics, Serwist Service Worker caching primitives, `@supabase/ssr` authentication lifecycles, and the strict engineering guardrails established in `AGENTS.md`.

Our primary finding is that while the high-level objectives of Phases 2–7 are sound, the current implementation plan (`plan.md`) contains **seven Critical (Blocker)** and **eight High-severity** architectural vulnerabilities. If executed without the mitigations identified in this review, these flaws would result in:
1. **Production Map Freezes & Hard Crashes**: Lack of runtime WebGL context error boundaries and dynamic fallback race conditions.
2. **User Data Loss & Interaction Freezes**: Unmounted dialog form state destruction and orphaned `pointer-events: none` CSS locks during client navigation.
3. **Session Eviction Loops**: Stale request headers during Next.js middleware token refresh kicking authenticated users to `/login`, and unconfirmed users trapped in login loops due to missing middleware whitelisting.
4. **Data Corruption via Non-Deterministic Dates**: Four distinct `toISOString()` and timezone bugs shifting logged visits to incorrect days in evening hours or east-of-UTC timezones.
5. **Mobile Gesture Breakage & Compiler Bailout**: Outer modal re-keying thrashing Vaul drawers and Radix dialogs, drawer snap-point desynchronization, and render-phase `setState` infinite render loops.
6. **Offline PWA Lockout & Ghost Trip Duplication**: Synchronous database RPC guards blocking offline winery selection, missing optimistic rollback leaving orphaned negative-ID trips, and offline sync replay duplicating trips permanently.
7. **Offline Authentication Session Nullification**: Strict `NetworkOnly` routing on Supabase Auth endpoints wiping client user identity when the PWA boots offline.

All seven phases are currently classified as **CONDITIONAL BLOCKER** or **CRITICAL BLOCKER**. Execution must NOT proceed until the task lists and acceptance criteria in `plan.md` are updated with the actionable amendments provided in Section 5 of this document.

---

### 1.2 Comprehensive Architectural Risk Matrix

| Phase | Domain & Name | Risk Score (1–10) | Primary Failure Modes | Blocking Status | Readiness Verdict |
|---|---|:---:|---|:---:|---|
| **Phase 2** | **Map Engine Bundle Isolation & Dynamic Fallback** | **7.5 / 10** | WebGL context crash traps, duplicate canvas test IDs, React StrictMode WebGL leaks, case-sensitivity build breaks on Linux, initial paint projection distortion. | **CONDITIONAL BLOCKER** | Requires error boundary hardening, single-container DOM stability, and filesystem casing standardization. |
| **Phase 3** | **Root Layout Decoupling & Authenticated Modal Host** | **8.5 / 10** | Route navigation in-flight form destruction, orphaned body pointer lock (`pointer-events: none`), Radix `DialogPortal` bypassing `#modal-root`, Server Component `ssr: false` boundary violations, omission of `WineryModal`. | **CRITICAL BLOCKER** | Requires Client Component encapsulation, route-change store cleanup, modal coverage expansion, and expand-and-contract phase splitting. |
| **Phase 4** | **Server Component Boundaries & Deterministic Dates** | **9.0 / 10** | Stale request headers during middleware token refresh wiping server sessions, `/manual-confirm` missing from whitelist causing login loop, zero App Router error boundaries, 4 non-deterministic date bugs mutating visit records. | **CRITICAL BLOCKER** | Requires middleware cookie forwarding repair, `/manual-confirm` whitelisting, `app/error.tsx` creation, and complete date standardization via `lib/utils.ts`. |
| **Phase 5** | **React 19 Adherence: State Derivation & Compiler Compliance** | **8.0 / 10** | Outer container re-keying thrashing Vaul/Radix animations, drawer `snapPoint` desynchronization, render-phase `setState` infinite loop risk, transient out-of-bounds review flashes in `WineryQnA`. | **CRITICAL BLOCKER** | Requires keying inner `<WineryModalContent>` instead of modal shells, moving snap-point reset to action handlers, and removing all 3 `set-state-in-effect` suppressions. |
| **Phase 6** | **React 19 Form Actions Modernization** | **9.0 / 10** | Server Action Flight serialization crashes with `AuthError`, `useActionState` desynchronization with non-native pickers, synchronous `ensureInDb` RPC blocking offline winery selection, optimistic UI rollback failure and ghost trip duplication. | **CRITICAL BLOCKER** | Requires plain serializable `ActionState` contracts, Controlled Hybrid Client Action pattern, offline ephemeral winery IDs, and atomic trip ID reconciliation. |
| **Phase 7** | **Service Worker Auth Hygiene & Quality Audit** | **8.5 / 10** | Offline session wiped by `NetworkOnly` auth routing without `getSession()` fallback, `userStore.logout()` null-controller crashes, CacheStorage delete/put races, omission of containerized Playwright E2E verification. | **CRITICAL BLOCKER** | Requires local `getSession()` fallback in `userStore.fetchUser()`, defensive null-controller messaging, auth page cache exclusion, and containerized E2E audit integration. |

---

## 2. Phase-by-Phase Deep-Dive Architectural & Failure-Mode Analysis

### 2.1 Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading

#### 2.1.1 Architectural Intent & Scope
Phase 2 isolates the heavy Mapbox GL JavaScript and CSS bundles from the root application layout, deferring stylesheet and script evaluation to map route boundaries. It replaces static Mapbox capability branching with a dynamic import of `GoogleMapFallback` via `next/dynamic({ ssr: false })` while maintaining DOM stability (`data-state="loading|ready|error"`).

#### 2.1.2 Deep-Dive Technical Findings & Failure Modes

1. **Absence of Runtime Error Boundary & Mapbox Failure Recovery (Static Capability Trap)**
   - **Affected Files & Symbols**: `components/map/MapView.tsx:151-203` (`mapboxgl.supported()`, `<Map>`), `react-map-gl/mapbox`.
   - **Mechanics & Failure Mode**: `mapboxgl.supported()` checks only whether the browser reports basic WebGL support on initial evaluation. It does not detect runtime WebGL initialization failures, GPU memory exhaustion, or browser context limits (mobile WebKit and Chromium strictly cap concurrent WebGL contexts to 8–16). When a user navigates between routes or when GPU memory is constrained, `<Map>` throws a synchronous unhandled exception during canvas creation (`webglcontextcreationerror`). Furthermore, if the Mapbox access token fails authorization (401/403) or Mapbox style endpoints timeout over poor rural cellular connections, `<Map>` emits an unhandled `error` event. Because `MapView.tsx` lacks a React Error Boundary and specifies no `onError` handler on `<Map>`, the entire client React application crashes with an unhandled exception or hangs indefinitely displaying a blank canvas.
   - **Mitigation**: Wrap `<Map>` inside an internal `MapErrorBoundary` and attach an `onError` listener to `<Map>`. Introduce local state `mapboxFailed`. If `<Map>` throws or emits an unrecoverable context/style error, log the failure and transition state to render `GoogleMapFallback` seamlessly without crashing the page.

2. **Dynamic Fallback DOM Stacking & Conflicting `data-state` / `data-testid` (DOM Stability Violation)**
   - **Affected Files & Symbols**: `components/map/MapView.tsx:153-166`, `conductor/.../plan.md:30`, `AGENTS.md` Sec. 4.
   - **Mechanics & Failure Mode**: `plan.md` task 30 mandates loading `GoogleMapFallback` via `next/dynamic({ ssr: false })` with a loading placeholder providing `data-testid="map-view-canvas" data-state="loading"`. However, in `MapView.tsx:154`, the fallback is already wrapped in `<div data-testid="map-view-canvas" data-state="ready" className="relative h-full w-full">`. Nesting the dynamic fallback inside this wrapper results in two elements with `data-testid="map-view-canvas"` during chunk resolution: the outer wrapper marked `data-state="ready"` and the inner placeholder marked `data-state="loading"`. In Jest, `screen.getByTestId("map-view-canvas")` immediately throws `TestingLibraryElementError: Found multiple elements`. In Playwright E2E tests, selectors waiting for `[data-testid="map-view-canvas"][data-state="ready"]` resolve prematurely against the empty wrapper before Google Maps has even initialized, causing marker interaction assertions to timeout.
   - **Mitigation**: Eliminate the nested wrapper. Guarantee that exactly ONE container element holds `data-testid="map-view-canvas"`. Dynamically manage `data-state`: `"loading"` while mounted is false or fallback is loading; `"ready"` when Mapbox fires `onLoad` or Google Maps initializes; `"error"` if both engines fail.

3. **React 19 StrictMode WebGL Context & Listener Leaks in `google-map-fallback.tsx`**
   - **Affected Files & Symbols**: `components/map/google-map-fallback.tsx:45-79` (`useEffect`, `initMap`), lines 107–178.
   - **Mechanics & Failure Mode**: In React 19 development mode (and under rapid client navigation), React StrictMode mounts, unmounts, and remounts components. `initMap` executes `new mapsLib.Map(containerRef.current, ...)`, injecting canvas elements and listeners into `containerRef.current`. The cleanup function on line 74 sets `active = false; mapRef.current = null; setMapAdapter(null);`, but never empties `containerRef.current` or removes Google Maps DOM elements and event listeners. Upon remount, a second Google Map is instantiated inside the same container. In production, navigating back and forth between `/` and `/trips` leaks WebGL contexts until the browser hits context limits and throws `CONTEXT_LOST_WEB_GL`.
   - **Mitigation**: On cleanup in `google-map-fallback.tsx`, purge DOM contents via `containerRef.current.innerHTML = ""` and invoke `google.maps.event.clearInstanceListeners` on all marker instances before dropping references.

4. **Case-Sensitivity Filename Collision in Dynamic Import**
   - **Affected Files & Symbols**: `conductor/.../plan.md:27,30`, `conductor/.../spec.md:25,81`, `components/map/google-map-fallback.tsx`.
   - **Mechanics & Failure Mode**: `plan.md` and `spec.md` specify importing `GoogleMapFallback.tsx` in PascalCase (`import("./GoogleMapFallback")`). The actual file on disk is kebab-case: `components/map/google-map-fallback.tsx`. On case-sensitive Linux filesystems (including the production CI/CD environment and Podman test containers), Node/Webpack throws `Module not found: Can't resolve './GoogleMapFallback'`, immediately failing the build.
   - **Mitigation**: Standardize all import statements and plan references strictly on `./google-map-fallback`.

5. **Mapbox GL CSS Isolation Rendering Flicker & Unstyled Canvas Distortion**
   - **Affected Files & Symbols**: `app/layout.tsx:5` (`import 'mapbox-gl/dist/mapbox-gl.css'`), `components/map/MapView.tsx:174`.
   - **Mechanics & Failure Mode**: Moving Mapbox CSS from root layout to `MapView.tsx` splits the stylesheet into a dynamic CSS chunk. When the map first mounts, Mapbox GL queries container dimensions. If the CSS chunk has not evaluated, `.mapboxgl-map` lacks `position: relative; width: 100%; height: 100%`. The canvas defaults to HTML5 300x150 dimensions, causing a visual flash and unstyled controls before snapping to size. If Mapbox does not receive a resize signal after CSS evaluation, coordinate-to-screen projection remains warped.
   - **Mitigation**: Constrain the wrapper in `MapView.tsx` with explicit Tailwind classes (`relative w-full h-full overflow-hidden`) and trigger `mapRef.current?.getMap().resize()` inside `handleMapLoad`.

6. **Coordinate Standardization & GeoJSON Parser Crashes**
   - **Affected Files & Symbols**: `components/map/MapView.tsx:80-100` (`wineriesGeoJSON`), `AGENTS.md` Sec. 4.
   - **Mechanics & Failure Mode**: `wineriesGeoJSON` maps coordinates using `[Number(winery.longitude), Number(winery.latitude)]`. If any winery object has missing, null, or invalid coordinates, `Number()` yields `NaN`. Mapbox strictly validates GeoJSON feature coordinates; encountering `NaN` causes Mapbox GL JS to throw `Error: Input data is not a valid GeoJSON object: Coordinates must be numbers`, completely disabling the wineries layer and rendering zero map pins.
   - **Mitigation**: Validate coordinates using `Number.isFinite(w.latitude) && Number.isFinite(w.longitude)` prior to GeoJSON feature creation, adhering to `AGENTS.md` coordinate standardization rules.

---

### 2.2 Phase 3: Root Layout Decoupling & AuthenticatedModalHost

#### 2.2.1 Architectural Intent & Scope
Phase 3 extracts heavy modal component trees (`VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, `GlobalModalRenderer`) from root `app/layout.tsx` into an `AuthenticatedModalHost` dynamically loaded with `{ ssr: false }`, ensuring public routes (`/login`, `/signup`, `/privacy`, `/terms`) download zero modal JavaScript. It preserves `<ModalHost />` (`#modal-root`) in layout for portal stability following an Expand-and-Contract migration.

#### 2.2.2 Deep-Dive Technical Findings & Failure Modes

1. **Unmounted Dialog State Loss & Destroyed In-Flight Forms on Route Navigation**
   - **Affected Files & Symbols**: `lib/stores/uiStore.ts:64-241`, `components/app-shell.tsx`, `app/trips/[id]/page.tsx`, `components/VisitFormModal.tsx`.
   - **Mechanics & Failure Mode**: `uiStore` tracks modal open state (`isModalOpen: true`), but form data (notes, visit date, ratings, queued photo uploads) lives in local component state (`useState`, `react-hook-form`). In `plan.md:47`, `AuthenticatedModalHost` is mounted in individual route pages (`components/app-shell.tsx`, `app/trips/[id]/page.tsx`, `app/friends/[id]/page.tsx`, `app/settings/page.tsx`). When a user begins filling out a visit form or winery note on `/` and navigates to `/trips/1`:
     1. `app/page.tsx` unmounts `AppShell`, which **unmounts `AuthenticatedModalHost`**.
     2. All user form input, draft text, and queued photo files are permanently destroyed without confirmation.
     3. In `uiStore`, `isModalOpen` remains `true`. When `/trips/[id]` mounts its `AuthenticatedModalHost`, it opens a blank, broken modal on an unrelated route.
   - **Mitigation**: Add a navigation change listener in `AuthenticatedModalHost` or `uiStore`: when route transitions occur, invoke `closeModal()`, `closeVisitForm()`, and `closeWineryNoteEditor()`. Implement draft persistence for visit logging.

2. **Orphaned `pointer-events: none` and `overflow: hidden` on `document.body`**
   - **Affected Files & Symbols**: `components/ui/dialog.tsx`, Radix UI `@radix-ui/react-dialog`.
   - **Mechanics & Failure Mode**: Radix Dialog applies inline styles to `document.body` when open: `pointer-events: none; overflow: hidden`. Normally, dismissing the dialog runs Radix's exit animation and cleanup lifecycle, clearing the body styles. When `AuthenticatedModalHost` is unmounted abruptly during client-side Next.js route navigation while a dialog is open, Radix's unmount cleanup is bypassed. `pointer-events: none` remains orphaned on `document.body`. The destination page becomes completely unresponsive to pointer clicks, trapping the user in a frozen UI state.
   - **Mitigation**: In `AuthenticatedModalHost`, add an explicit `useEffect` unmount cleanup hook that resets `document.body.style.pointerEvents = ""` and `document.body.style.overflow = ""`.

3. **Radix `DialogPortal` Bypasses `#modal-root` (Phantom Portal Destination Trap)**
   - **Affected Files & Symbols**: `components/modal-host.tsx:5` (`#modal-root`), `components/ui/dialog.tsx:36` (`<DialogPortal>`), `components/VisitFormModal.tsx:74-77`, `components/WineryNoteModal.tsx:76-79`.
   - **Mechanics & Failure Mode**: `plan.md` mandates retaining `<ModalHost />` (`#modal-root`) in `app/layout.tsx`. In `VisitFormModal.tsx:77`, `createPortal(<Dialog>...</Dialog>, modalRoot)` is called. However, inside `components/ui/dialog.tsx:36`, `<DialogContent>` unconditionally wraps its content in Radix's `<DialogPortal>`, which by default portals directly to `document.body`. React portals `<Dialog>` into `#modal-root`, and Radix immediately re-portals the actual modal DOM nodes out to `document.body` with `z-50`, ignoring `#modal-root`'s `z-[100]`. Meanwhile, `GlobalModalRenderer` and `TripShareDialogWrapper` do not use `#modal-root` at all. If `#modal-root` is missing, `VisitFormModal` and `WineryNoteModal` return `null` and fail to render, while other modals render fine.
   - **Mitigation**: Standardize portal behavior: pass `container={document.getElementById("modal-root")}` to Radix `<DialogPortal>` if `#modal-root` is strictly required for stacking context isolation, or remove the redundant `createPortal` calls in `VisitFormModal.tsx` and `WineryNoteModal.tsx` to let Radix portal directly to `document.body`.

4. **Server Component Boundary Violation (`ssr: false` in Server Components)**
   - **Affected Files & Symbols**: `app/trips/[id]/page.tsx`, `app/settings/page.tsx`, `components/modals/authenticated-modal-host.tsx`.
   - **Mechanics & Failure Mode**: `app/trips/[id]/page.tsx` and `app/settings/page.tsx` are async Server Components (`export default async function ...`). In Next.js App Router (versions 15 and 16), calling `dynamic(() => import(...), { ssr: false })` inside a Server Component throws a fatal compilation error: `Error: ssr: false is not allowed in Server Components`.
   - **Mitigation**: Ensure `components/modals/authenticated-modal-host.tsx` has `"use client";` at line 1. Encapsulate all `next/dynamic({ ssr: false })` imports inside this client component. Server Components import and render `<AuthenticatedModalHost />` as an opaque client boundary.

5. **Omission of `WineryModal` and `VisitHistoryModal` in `AuthenticatedModalHost`**
   - **Affected Files & Symbols**: `conductor/.../plan.md:40,44`, `components/app-shell.tsx:72`, `components/winery-modal.tsx`, `app/trips/[id]/page.tsx`.
   - **Mechanics & Failure Mode**: `plan.md` task 44 defines `AuthenticatedModalHost` as importing only `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, and `GlobalModalRenderer`. `WineryModal` and `VisitHistoryModal` are omitted and left inside `components/app-shell.tsx`. Decoupled authenticated routes like `app/trips/[id]/page.tsx` do not render `AppShell`. When a user viewing trip details clicks on a winery in the trip list to inspect details, `uiStore.openWineryModal(id)` executes, but `<WineryModal />` is not in the DOM. The click fails silently.
   - **Mitigation**: Include `WineryModal` and `VisitHistoryModal` in `AuthenticatedModalHost`, dynamically loaded with `{ ssr: false }`. Remove duplicate declarations from `components/app-shell.tsx`.

6. **Expand-and-Contract Stepping Hazard in Unified Migrate & Contract Task**
   - **Affected Files & Symbols**: `conductor/.../plan.md:46-48`, `app/layout.tsx`.
   - **Mechanics & Failure Mode**: Task 46 conflates Migrate and Contract steps: mounting `AuthenticatedModalHost` across pages and simultaneously deleting modal imports from `app/layout.tsx`. This violates `AGENTS.md` Critical Guardrail 3 (Expand-and-Contract pattern). If any caller is overlooked during migration, removing modals from `app/layout.tsx` causes silent production regressions before the migration is verified.
   - **Mitigation**: Split into distinct tasks: Phase 3 Task B (Migrate - mount in callers and verify) and Phase 3 Task C (Contract - remove from `app/layout.tsx` after verification).

---

### 2.3 Phase 4: Server Component Boundaries, Route Metadata & Deterministic Dates

#### 2.3.1 Architectural Intent & Scope
Phase 4 enforces Server Component boundaries by converting `/friends/[id]`, `/forgot-password`, and `/manual-confirm` into Server Components exporting static `Metadata`. It updates `proxy.ts` middleware to whitelist `/manual-confirm`, adds App Router error boundaries, and replaces dynamic date calculations with deterministic utilities from `lib/utils.ts`.

#### 2.3.2 Deep-Dive Technical Findings & Failure Modes

1. **Stale Request Headers in Middleware Token Refresh Causing Server Session Loss**
   - **Affected Files & Symbols**: `utils/supabase/auth-helper.ts:39-59` (`updateSession` -> `setAll`), `proxy.ts:23`, `utils/supabase/server.ts:4-28` (`createClient`), `lib/auth.ts:3-24` (`getUser`), `app/friends/[id]/page.tsx`.
   - **Mechanics & Failure Mode**: In `utils/supabase/auth-helper.ts`:
     ```ts
     setAll(cookiesToSet: SupabaseCookie[]) {
       cookiesToSet.forEach(({ name, value, options }) => {
         request.cookies.set({ name, value, ...options });
       });
       response = NextResponse.next({
         request: {
           headers: request.headers, // ⚠️ CRITICAL FLAW
         },
       });
       cookiesToSet.forEach(({ name, value, options }) => {
         response.cookies.set({ name, value, ...options });
       });
     }
     ```
     Calling `request.cookies.set()` updates the internal Next.js request cookie jar map, but does NOT re-serialize or update the raw `request.headers.get('cookie')` string. Because `NextResponse.next({ request: { headers: request.headers } })` forwards the unmodified headers, downstream Server Components calling `await cookies()` receive the **stale, expired access token**. When `app/friends/[id]/page.tsx` calls `getUser()`, `@supabase/ssr` encounters the expired token. In Server Components, `cookies().set()` cannot modify response headers (the write throws and is swallowed in `server.ts:20-24`). Consequently, `getUser()` fails and returns `null`. The Server Component immediately triggers `redirect('/login')`, kicking an authenticated user with a valid refresh token out of their session.
   - **Mitigation**: In `utils/supabase/auth-helper.ts`, forward the modified `request` directly into `NextResponse.next({ request })` instead of overriding with stale headers, and ensure `@supabase/ssr` cookies are fully reflected on downstream requests.

2. **Unauthenticated Confirmation Lockout: `/manual-confirm` Missing from Middleware Whitelist**
   - **Affected Files & Symbols**: `proxy.ts:4-17` (`publicRoutes`), `app/manual-confirm/page.tsx`.
   - **Mechanics & Failure Mode**: In `proxy.ts`, `publicRoutes` lists `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/api/auth/confirm-user`, `/site.webmanifest`, `/sw.js`, `/privacy`, `/terms`. Notice `/manual-confirm` is completely absent. When a newly registered user whose email confirmation was delayed attempts to visit `/manual-confirm`, `proxy.ts:35` treats them as unauthenticated and redirects to `/login?redirectTo=/manual-confirm`. When they attempt to log in at `/login`, Supabase rejects them with "Email not confirmed". When they navigate back to `/manual-confirm`, they are redirected back to `/login` in an inescapable loop.
   - **Mitigation**: Add `'/manual-confirm'` to `publicRoutes` in `proxy.ts` and verify with unit tests in `__tests__/proxy.test.ts`.

3. **Absence of App Router Error Boundaries for Server RPC & Auth Outages**
   - **Affected Files & Symbols**: `app/error.tsx` (Missing), `app/global-error.tsx` (Missing), `app/friends/[id]/page.tsx`.
   - **Mechanics & Failure Mode**: There are zero `error.tsx` or `global-error.tsx` files in `app/`. If Supabase Auth experiences a network timeout or 502/503 outage during SSR, `getUser()` in `lib/auth.ts` catches the error and returns `null`, redirecting the user to `/login`. If any future Server Component database fetch or RPC throws an unhandled exception, Next.js aborts SSR and returns an unstyled 500 error page, completely unmounting the App Shell and navigation bar.
   - **Mitigation**: Add `app/error.tsx` to preserve App Shell navigation while displaying an accessible error card with retry capabilities.

4. **Query Parameter Discard and Trailing Slash Inconsistency in `proxy.ts`**
   - **Affected Files & Symbols**: `proxy.ts:45-60`.
   - **Mechanics & Failure Mode**: On line 55, `proxy.ts` sets `url.searchParams.set('redirectTo', pathname)`. Query strings are dropped; `/trips?filter=upcoming` loses its filter parameter after login. Additionally, line 45 defines `const deepLinkRoutes = ['/', '/trips/', '/friends/', '/settings/']`. Requests to `/trips` or `/friends` (without trailing slash) fail `pathname === r` and `pathname.startsWith('/trips/')`, causing inconsistent redirect behavior in E2E mode.
   - **Mitigation**: Set `redirectTo` to `pathname + request.nextUrl.search`, and normalize `deepLinkRoutes` to match routes with or without trailing slash.

5. **Four Non-Deterministic Date Formats & Hydration Divergence in Forms and Legal Pages**
   - **Affected Files & Symbols**: `components/VisitForm.tsx:37, 48, 59, 108`, `app/privacy/page.tsx:17`, `app/terms/page.tsx:17`.
   - **Mechanics & Failure Mode**:
     1. In `VisitForm.tsx:37, 48, 108`, `new Date().toISOString().split("T")[0]` evaluates in UTC. In EDT (UTC-4), any user logging a visit after 8:00 PM local time gets tomorrow's date recorded in the database.
     2. In `VisitForm.tsx:59`, `setVisitDate(new Date(editingVisit.visit_date + "T00:00:00").toISOString().split("T")[0])` parses local midnight and converts to UTC. In any timezone east of UTC (e.g. UTC+1 through UTC+12), this shifts the date backwards into the previous evening, subtracting one day from the visit record on every edit.
     3. In `app/privacy/page.tsx:17` and `app/terms/page.tsx:17`, `new Date().toLocaleDateString()` generates different strings between Node SSR (server locale/UTC) and client browser locales, triggering React 19 hydration mismatches.
   - **Mitigation**: In `VisitForm.tsx`, replace lines 37, 48, and 108 with `getTodayLocal()` from `lib/utils.ts`. On line 59, assign `editingVisit.visit_date` directly without re-parsing. In `privacy` and `terms`, replace dynamic calls with a static constant `const LAST_UPDATED = "January 15, 2025"`.

---

### 2.4 Phase 5: React 19 Adherence: State Derivation & Compiler Compliance

#### 2.4.1 Architectural Intent & Scope
Phase 5 addresses React Compiler violations in `components/winery/use-winery-modal-state.ts`, eliminates render-phase `setState` via keyed component reset, keys review display in `WineryQnA.tsx`, derives state in `use-trip-actions.ts`, adopts `useMounted()`, and removes all 3 `react-hooks/set-state-in-effect` ESLint suppressions across the repository.

#### 2.4.2 Deep-Dive Technical Findings & Failure Modes

1. **Outer Modal Container Re-Keying Regressions: Animation Destruction & DOM Instability**
   - **Affected Files & Symbols**: `components/winery-modal.tsx:67-96`, `components/winery/mobile-winery-drawer.tsx`, `components/winery/desktop-winery-modal.tsx`, `conductor/.../plan.md:79`, `AGENTS.md` Sec. 4.
   - **Mechanics & Failure Mode**: Plan task 79 specifies keying `WineryModalContent key={activeWineryId}`. If the key is placed on the **outer container** (`MobileWineryDrawer`, `DesktopWineryModal`, or `TabletWinerySheet`):
     1. Vaul Drawer unmounts and remounts, destroying gesture tracking, cancelling active drag motions, and causing visual drawer open/close flashes.
     2. Radix Dialog on desktop unmounts and remounts its overlay, repeatedly mutating body styles (`pointer-events: none; overflow: hidden`), thrashing focus back to the document body.
     3. This violates `AGENTS.md` Section 4 DOM stability rules.
   - **Mitigation**: Outer modal containers (`<Drawer>`, `<Dialog>`, `<Sheet>`) must remain permanently mounted with stable keys. The key `key={activeWineryId}` must be applied strictly to the **inner content** inside `<DrawerContent>`, `<DialogContent>`, and `<SheetContent>`: `<WineryModalContent key={activeWineryId} ... />`.

2. **Drawer `snapPoint` Desynchronization when Relying Exclusively on Keyed Content Reset**
   - **Affected Files & Symbols**: `components/winery/use-winery-modal-state.ts:28-42`, `components/winery/mobile-winery-drawer.tsx:59, 370`, `lib/stores/uiStore.ts:92-96`.
   - **Mechanics & Failure Mode**: Currently, `use-winery-modal-state.ts` resets `snapPoint` when `activeWineryId !== prevActiveWineryId`. Removing this code eliminates render-phase `setState`. However, `snapPoint` is controlled by the outer `<Drawer activeSnapPoint={snapPoint} setActiveSnapPoint={setSnapPoint}>`. Keying the inner `<WineryModalContent>` resets internal tabs and photo galleries, but does NOT reset `snapPoint`. If a user expands the drawer to full height (`snapPoint = 1`) on Winery A and clicks on Winery B's map marker, the drawer remains locked at full screen rather than collapsing to the default peek height (`300px`).
   - **Mitigation**: Reset `snapPoint` in the action handler that initiates the winery selection (`uiStore.openWineryModal`), following React 19 event-driven state reset best practices.

3. **Render-Time `setState` Infinite Render Loop Risk & Compiler De-Optimization**
   - **Affected Files & Symbols**: `components/winery/use-winery-modal-state.ts:33-42`.
   - **Mechanics & Failure Mode**: In `use-winery-modal-state.ts`, lines 33–42 invoke `setPrevActiveWineryId`, `setSnapPoint`, and `setLightboxPhoto` directly in the hook body during render. In React 19 with `reactCompiler: true` enabled in `next.config.mjs`, this prevents memoization optimization and, under Concurrent Mode re-renders, triggers: `Error: Too many re-renders. React limits the number of renders to prevent an infinite loop`.
   - **Mitigation**: Completely eliminate `prevActiveWineryId` and render-phase setters. Delegate tab and lightbox resets to `<WineryModalContent key={activeWineryId}>` and snap-point reset to `uiStore`.

4. **Transient Out-of-Bounds Index Flashes & Elimination of All 3 Hook Suppressions**
   - **Affected Files & Symbols**: `components/WineryQnA.tsx:392`, `hooks/use-trip-actions.ts:20`, `components/trip-planner.tsx:26`.
   - **Mechanics & Failure Mode**:
     1. In `WineryQnA.tsx:392`, `useEffect` synchronizes `activeReviewIndex(0)` when `activeQuestionId` changes. When switching from a question with 5 reviews to one with 1 review, for one paint frame `activeReviewIndex` is out of bounds, rendering "No mention of this in the reviews" before snapping to the review.
     2. In `hooks/use-trip-actions.ts:20`, `useEffect` synchronizes `trip.members` to unused `selectedFriends` state.
     3. In `components/trip-planner.tsx:26`, an effect sets local `isMounted(true)`, ignoring the existing `useMounted()` hook.
   - **Mitigation**: Extract `<WineryQuestionReviewCard key={activeQuestionId} />` in `WineryQnA.tsx`. In `use-trip-actions.ts`, derive `currentMembers = trip.members || []` and remove `selectedFriends`. In `trip-planner.tsx`, adopt `useMounted()`. Remove all 3 ESLint suppression comments.

---

### 2.5 Phase 6: React 19 Form Actions Modernization

#### 2.5.1 Architectural Intent & Scope
Phase 6 modernizes authentication forms (`login-form.tsx`, `forgot-password-form.tsx`, `manual-confirm-form.tsx`) using React 19 Server Actions (`app/actions/auth.ts`) with `useActionState`, and refactors `components/trip-form.tsx` submission with a Controlled Hybrid Client Action State pattern.

#### 2.5.2 Deep-Dive Technical Findings & Failure Modes

1. **Server Action Flight Serialization Crashes with Supabase `AuthError`**
   - **Affected Files & Symbols**: `app/actions/auth.ts`, `components/login-form.tsx`, `utils/supabase/server.ts`.
   - **Mechanics & Failure Mode**: Next.js App Router Server Actions serialize return values across the React Flight protocol. When Supabase Auth calls (`signInWithPassword`, `resetPasswordForEmail`) fail, Supabase returns instances of `AuthError` (classes with methods and non-enumerable properties). If a Server Action returns `{ error }` containing an `AuthError` instance, React Flight throws: `Error: Only plain objects, and a few built-ins, can be passed to Client Components from Server Components`. If the Server Action throws (`throw error`), Next.js in production (`NODE_ENV === 'production'`) redacts the error to a generic message digest, masking legitimate error messages ("Invalid credentials", "Email not confirmed") from the user.
   - **Mitigation**: Establish a strict Plain Old JavaScript Object (POJO) contract:
     ```typescript
     export type ActionState<T = unknown> = {
       success: boolean;
       error: string | null;
       fieldErrors?: Record<string, string[]>;
       data?: T;
     };
     ```
     Wrap all Supabase calls in `app/actions/auth.ts` in defensive `try/catch` and return `{ success: false, error: error.message }`.

2. **Controlled Hybrid Client Action Pattern vs Native `<form action={...}>` Desynchronization**
   - **Affected Files & Symbols**: `components/trip-form.tsx`, `components/DatePicker.tsx`, `components/PlaceAutocomplete.tsx`.
   - **Mechanics & Failure Mode**: `TripForm` relies on synthetic, non-native inputs: `DatePicker` (Radix Popover calendar) and `PlaceAutocomplete` (manages `selectedWineries` in React state). If `TripForm` is refactored to native `<form action={formAction}>`:
     1. Browser `FormData` contains only native named inputs; `formData.get("date")` and `formData.get("wineries")` evaluate to `null`.
     2. If `react-hook-form`'s `handleSubmit` is attached, its internal `e.preventDefault()` suppresses native React 19 form action dispatch.
   - **Mitigation**: Adopt the Controlled Hybrid Client Action Pattern: retain `react-hook-form` + `zodResolver` for client validation; define `useActionState` accepting structured `TripFormValues`; dispatch `submitAction(data)` inside `startTransition` within `handleSubmit(onValidSubmit)`; and sync action errors back to `form.setError("root", ...)`.

3. **Synchronous `ensureInDb` RPC Guard Blocks Offline Winery Selection**
   - **Affected Files & Symbols**: `components/trip-form.tsx:81-86`, `lib/stores/wineryStore.ts:146`, `lib/services/wineryService.ts:60-75`.
   - **Mechanics & Failure Mode**: In `trip-form.tsx:81`, `handleWineryToggle` calls `await ensureInDb(winery.id)`. `ensureInDb` invokes `supabase.rpc('ensure_winery')`. When the user is offline in rural wine regions, the RPC fails with a network exception. Line 83 checks `if (!dbId)`: it fires a destructive error toast and aborts. The winery is never appended to `form.wineries`. Offline users are completely blocked from adding wineries to a trip.
   - **Mitigation**: Decouple winery selection from synchronous RPCs: if offline or if `ensureInDb` returns `null`, assign an ephemeral client ID (`-Date.now()`). When connectivity restores, `SyncService` resolves the database ID in the background.

4. **Optimistic Relational ID Corruption & Permanent Ghost Trip Duplication upon Sync**
   - **Affected Files & Symbols**: `lib/stores/slices/tripMutationHelpers.ts:18-85`, `lib/stores/slices/tripFetchHelpers.ts:53-67`, `lib/services/syncService.ts:648`, `lib/stores/tripStore.ts:48`.
   - **Mechanics & Failure Mode**: In `createTripHelper`, a temporary trip is created with `tempId = -Date.now()`.
     - *Case A (Permanent Error)*: If the server returns a 4xx error, `createTripHelper` catches the error, marks the trip `syncStatus: 'error'`, and throws. The trip is NEVER removed from `trips` or `tripsForDate`. Because `tripStore` persists the top 20 trips to IndexedDB, this failed trip with negative ID is stored permanently. Clicking it navigates to `/trips/-1726054123456`, which crashes on RPC 404.
     - *Case B (Offline Sync Replay Duplication)*: User creates a trip offline (`id: -1726054123456`). Connectivity returns; `SyncService.sync()` runs `create_trip` RPC on Supabase, which returns positive ID `42`. `SyncService` triggers `fetchTrips()`. In `fetchTripsHelper`, incoming trips match existing trips by `id`. Since `-1726054123456 !== 42`, the temporary trip is retained and the new trip is appended as `trulyNew`. The trip is permanently duplicated in the UI.
   - **Mitigation**: In `createTripHelper`, take a snapshot of trips before optimistic mutation; on permanent error, perform true optimistic rollback by restoring the snapshot. In `SyncService` and `tripDataSlice.ts`, implement an atomic `replaceTripTempId(tempId, realTrip)` helper that substitutes the real trip before fetching.

---

### 2.6 Phase 7: Service Worker Auth Hygiene & Production Quality Audit

#### 2.6.1 Architectural Intent & Scope
Phase 7 restricts Supabase Auth routes (`/auth/v1/*`) in `app/sw.ts` strictly to `NetworkOnly`, bridges `userStore.logout()` to purge `window.caches` and message the Service Worker, and executes a full production quality audit.

#### 2.6.2 Deep-Dive Technical Findings & Failure Modes

1. **Offline PWA Session Nullification via `NetworkOnly` Route Enforcement**
   - **Affected Files & Symbols**: `app/sw.ts:86-107, 131-151`, `lib/stores/userStore.ts:37-64` (`fetchUser`).
   - **Mechanics & Failure Mode**: Routing `/auth/v1/*` strictly to `NetworkOnly` in `app/sw.ts` is critical to prevent cache poisoning across signouts. However, when an authenticated user opens the PWA offline:
     1. The Service Worker serves the HTML shell from the `pages` cache.
     2. The app mounts and invokes `userStore.fetchUser()`.
     3. `fetchUser()` calls `supabase.auth.getUser()`, which makes a GET request to `/auth/v1/user`.
     4. Because `/auth/v1/*` is `NetworkOnly`, the fetch fails immediately with a network error.
     5. `fetchUser()` checks `if (!authUser)` and executes: `set({ user: null, isLoading: false })`.
     6. The authenticated user's session is wiped from memory, and the app drops to unauthenticated guest mode while offline!
   - **Mitigation**: Maintain `NetworkOnly` in `app/sw.ts`. In `lib/stores/userStore.ts#fetchUser`, add a defensive offline fallback: if `navigator.onLine` is false or if `getUser()` fails with a network error, call `supabase.auth.getSession()` (which reads the local stored token without network requests) before clearing user state.

2. **Service Worker Message Channel Null-Controller Crashes & Multi-Tab Desynchronization**
   - **Affected Files & Symbols**: `lib/stores/userStore.ts:126-141`, `app/sw.ts:238-242`.
   - **Mechanics & Failure Mode**:
     1. In `userStore.ts#logout`, accessing `navigator.serviceWorker.controller.postMessage(...)` without defensive guards crashes with `TypeError: Cannot read properties of null` if the controller is null (first visit, incognito, hard refresh).
     2. In multi-tab sessions, if a user logs out in Tab 1, Tab 2 receives no event; its in-memory stores remain populated with private user data because `userStore` does not listen to `supabase.auth.onAuthStateChange`.
     3. In Jest unit tests, `window.caches` and `navigator.serviceWorker` are undefined; unprotected calls throw `ReferenceError`.
   - **Mitigation**: Defensively guard `window.caches` and use `navigator.serviceWorker.ready` with optional chaining. Implement the `PURGE_AUTH_CACHE` listener in `app/sw.ts`. Add `supabase.auth.onAuthStateChange` listener in `app-shell.tsx` to synchronize logout across tabs.

3. **CacheStorage Race Conditions Between `window.caches` and SW `pages` Cache**
   - **Affected Files & Symbols**: `lib/stores/userStore.ts`, `app/sw.ts:190-202`.
   - **Mechanics & Failure Mode**: If `userStore.logout()` executes `window.caches.delete('pages')` while Serwist's `NetworkFirst` strategy is simultaneously writing `/login` into `pages`, browser CacheStorage encounters lock contention or Serwist recreates `pages` with authenticated redirect fragments.
   - **Mitigation**: Exclude authentication routes (`/login`, `/signup`, `/forgot-password`, `/manual-confirm`) from Serwist's `pages` cache matcher, and centralize cache purge in the Service Worker via `event.waitUntil()`.

4. **Complete Omission of Containerized Playwright E2E Verification in Phase 7 Plan**
   - **Affected Files & Symbols**: `conductor/.../plan.md:112-116`, `scripts/run-e2e-container.sh`, `AGENTS.md` Sec. 3.
   - **Mechanics & Failure Mode**: Task 7.3 in `plan.md` lists only `lint`, `type-check`, and `build`. It completely omits Playwright E2E tests. However, `AGENTS.md` Section 3 explicitly mandates:
     `Playwright E2E: Run via Podman container script: ./scripts/run-e2e-container.sh [--build] [project] [test_file]`.
     Phases 6 and 7 make sweeping changes to form actions, offline mutation queues, and Service Worker caching. Relying solely on static checks allows runtime Service Worker interception bugs and form submission regressions to escape into production.
   - **Mitigation**: Amend Task 7.3 to mandate containerized Playwright execution for `auth-recovery.spec.ts`, `pwa-offline.spec.ts`, and `trip-flow.spec.ts`.

---

## 3. Master Prioritized Failure-Mode Catalog

### 3.1 Critical (Blocker) Severity Failures

| ID | Title | Affected Files & Symbols | Trigger Conditions | Technical Impact | Mitigation Summary |
|---|---|---|---|---|---|
| **FM-P2-01** | Absence of Runtime Error Boundary & Mapbox Failure Recovery | `components/map/MapView.tsx:151-203` (`<Map>`) | WebGL context allocation failure, GPU memory exhaustion, invalid Mapbox token, or style timeout. | Unhandled runtime React exception crashes application or displays permanent blank canvas; never reaches fallback. | Wrap `<Map>` in `MapErrorBoundary`, attach `onError` listener, and dynamically set `mapboxFailed = true`. |
| **FM-P3-01** | Unmounted Dialog State Loss & Destroyed In-Flight Forms | `lib/stores/uiStore.ts:64-241`, `components/app-shell.tsx`, `components/VisitFormModal.tsx:78` | User navigates between routes while a modal form has unsaved draft input. | `AuthenticatedModalHost` unmounts, destroying draft notes, ratings, and photo queues; leaves `isModalOpen: true` opening blank modals on target routes. | Add route-change listener in modal host to dismiss modals and clear stores on navigation; add draft persistence. |
| **FM-FE4-01** | Stale Request Headers in Middleware Token Refresh | `utils/supabase/auth-helper.ts:39-59`, `proxy.ts:23`, `utils/supabase/server.ts:4-28` | Authenticated user with expired access token navigates to protected Server Component. | Raw `request.headers` sent to downstream Server Components contains expired token; `getUser()` fails; user redirected to `/login`. | Update `setAll` in `auth-helper.ts` to pass modified request directly to `NextResponse.next({ request })`. |
| **FM-FE4-02** | Unauthenticated Confirmation Lockout | `proxy.ts:4-17` (`publicRoutes`), `app/manual-confirm/page.tsx` | Unconfirmed user navigates to `/manual-confirm`. | `/manual-confirm` not whitelisted; middleware redirects to `/login`; login fails; user trapped in inescapable redirect loop. | Add `'/manual-confirm'` to `publicRoutes` in `proxy.ts`. |
| **FM-FE5-03** | Render-Phase `setState` Infinite Loop & Compiler De-Optimization | `components/winery/use-winery-modal-state.ts:33-42` | `activeWineryId` changes during re-render in Concurrent Mode. | State setters in render body violate React purity; triggers React Compiler de-optimization and `Too many re-renders` crash. | Remove `prevActiveWineryId` and all render-phase setters; reset state via keyed content and event handlers. |
| **FM-6.1** | Server Action Non-Serializable `AuthError` Serialization Crash | `app/actions/auth.ts`, `components/login-form.tsx` | Supabase Auth operation fails in Server Action. | Class instances cannot be serialized across Flight protocol (crash); production masks error messages to generic digest. | Establish typed `ActionState` POJO contract; catch errors in Server Actions and return plain serialized error strings. |
| **FM-6.3** | Synchronous `ensureInDb` RPC Guard Blocks Offline Winery Selection | `components/trip-form.tsx:81-86`, `lib/stores/wineryStore.ts:146` | User toggles winery selection in `TripForm` while offline. | `ensureInDb` RPC fails over network, returns `null`; handler displays destructive toast and aborts; user cannot select wineries. | Decouple selection from synchronous RPC; assign ephemeral client ID (`-Date.now()`) when offline. |
| **FM-6.4** | Optimistic Relational ID Corruption & Ghost Trip Duplication | `lib/stores/slices/tripMutationHelpers.ts:18-85`, `lib/services/syncService.ts:648` | Trip creation encounters permanent 4xx error or replays offline queue. | Failed trips remain in store with negative ID; offline sync replay fails to match negative ID with server ID, duplicating trips permanently. | Implement true optimistic rollback on permanent error; implement atomic `replaceTripTempId` on sync. |
| **FM-7.1** | Offline PWA Session Nullification via `NetworkOnly` Auth Route | `app/sw.ts:86-107`, `lib/stores/userStore.ts:37-64` (`fetchUser`) | Authenticated user launches PWA offline. | `supabase.auth.getUser()` fails over network under `NetworkOnly`; `fetchUser` sets `user: null`, logging out offline user. | Add fallback to `supabase.auth.getSession()` (reads local stored token) in `userStore.fetchUser()` when offline. |

---

### 3.2 High Severity Failures

| ID | Title | Affected Files & Symbols | Trigger Conditions | Technical Impact | Mitigation Summary |
|---|---|---|---|---|---|
| **FM-P2-02** | Dynamic Fallback DOM Stacking & Conflicting Test IDs | `components/map/MapView.tsx:153-166`, `conductor/.../plan.md:30` | `GoogleMapFallback` is dynamically loaded inside existing `map-view-canvas` wrapper. | Two nested elements have `data-testid="map-view-canvas"` with conflicting `data-state`; breaks Jest and Playwright selectors. | Refactor `MapView.tsx` so exactly one root container holds `data-testid="map-view-canvas"`, transitioning `data-state`. |
| **FM-P2-03** | React StrictMode WebGL Context & Listener Leaks | `components/map/google-map-fallback.tsx:45-79` | React StrictMode remount or route navigation between map and other views. | Cleanup hook fails to empty container or clear listeners; leaks WebGL contexts until browser throws `CONTEXT_LOST_WEB_GL`. | Clear `containerRef.current.innerHTML` and remove Google Maps event listeners on effect unmount. |
| **FM-P2-04** | Case-Sensitivity Filename Collision on Linux | `conductor/.../plan.md:27,30`, `components/map/google-map-fallback.tsx` | Dynamic import uses PascalCase `GoogleMapFallback` on Linux. | Linux filesystem cannot resolve `./GoogleMapFallback`; Webpack/Turbopack compilation breaks. | Standardize import paths strictly on exact filesystem casing: `./google-map-fallback`. |
| **FM-P3-02** | Radix `DialogPortal` Bypasses `#modal-root` | `components/modal-host.tsx:5`, `components/ui/dialog.tsx:36`, `components/VisitFormModal.tsx:74` | Dialog renders inside `#modal-root` portal. | Radix re-portals to `document.body` with `z-50`; `#modal-root` is unused; missing `#modal-root` causes silent `null` return. | Explicitly pass container to Radix `DialogPortal` or standardize all modals on `document.body`. |
| **FM-P3-03** | Server Component Boundary Violation (`ssr: false`) | `app/trips/[id]/page.tsx`, `app/settings/page.tsx` | Next.js Server Component page attempts to import with `{ ssr: false }`. | Next.js throws fatal error: `ssr: false is not allowed in Server Components`. | Mark `authenticated-modal-host.tsx` with `"use client";` and encapsulate all dynamic imports inside it. |
| **FM-P3-04** | Omission of `WineryModal` in `AuthenticatedModalHost` | `conductor/.../plan.md:44`, `app/trips/[id]/page.tsx` | User clicks winery detail on standalone authenticated route (`/trips/[id]`). | `WineryModal` only mounted in `AppShell`; route lacks `AppShell`; modal never renders; click fails silently. | Include `WineryModal` and `VisitHistoryModal` in `AuthenticatedModalHost`. |
| **FM-FE4-03** | Absent App Router Error Boundaries | `app/error.tsx` (missing), `lib/auth.ts:3-23` | Server Component RPC or Supabase Auth throws unhandled exception during SSR. | Next.js returns unstyled 500 error page; root layout and App Shell navigation unmount completely. | Create `app/error.tsx` fallback boundary with styled retry card. |
| **FM-FE4-05** | Multiple Non-Deterministic Date Formats in SSR | `components/VisitForm.tsx:37,48,59,108`, `app/privacy/page.tsx:17` | User logs visit after 8:00 PM EDT or edits visit in timezone east of UTC; SSR legal page visit. | Evening visits record tomorrow's date; edits in east-of-UTC timezones decrement visit date by 1 day; legal pages cause hydration mismatch. | Replace lines 37, 48, 108 with `getTodayLocal()`; use `visit_date` directly on line 59; use static constant on legal pages. |
| **FM-FE5-01** | Outer Modal Container Re-Keying Regressions | `components/winery-modal.tsx:67-96`, `components/winery/mobile-winery-drawer.tsx` | `key={activeWineryId}` applied to outer `<Drawer>` or `<Dialog>`. | Vaul drawer unmounts, breaking gestures and animations; Radix dialog thrashes body locks and focus. | Keep outer containers mounted; place `key={activeWineryId}` strictly on inner `<WineryModalContent>`. |
| **FM-FE5-02** | Drawer `snapPoint` Desynchronization | `components/winery/use-winery-modal-state.ts:28-42`, `lib/stores/uiStore.ts:92` | User expands drawer to full height and selects different winery. | Inner key resets content but not outer `snapPoint`; drawer remains stuck at full-screen height. | Reset `snapPoint` to default `"300px"` in `uiStore.openWineryModal` action handler. |
| **FM-6.2** | `useActionState` vs Non-Native Controlled Inputs | `components/trip-form.tsx`, `components/DatePicker.tsx` | Refactoring `TripForm` to native `<form action={...}>`. | Native `FormData` lacks date and winery array; `handleSubmit` suppresses action; form submission fails. | Adopt Controlled Hybrid Client Action pattern using structured form values in `startTransition`. |
| **FM-7.2** | Service Worker Null-Controller Crashes & Multi-Tab Desync | `lib/stores/userStore.ts:126`, `app/sw.ts:238` | User clicks logout when controller is null or across multiple open tabs. | Calling `postMessage` on null controller throws `TypeError`; other tabs retain private user data in memory. | Add defensive guards on controller; implement `PURGE_AUTH_CACHE` listener; add cross-tab auth change listener. |
| **FM-7.5** | Complete Omission of Containerized Playwright E2E | `conductor/.../plan.md:112-116`, `scripts/run-e2e-container.sh` | Quality audit execution in Phase 7. | Omitting E2E tests violates `AGENTS.md` Sec. 3; allows SW caching and form action regressions into production. | Integrate containerized Playwright commands (`auth-recovery`, `pwa-offline`, `trip-flow`) into Phase 7 task. |

---

### 3.3 Medium & Low Severity Failures

| ID | Severity | Title | Affected Files & Symbols | Mitigation Summary |
|---|---|---|---|---|
| **FM-P2-05** | Medium | Mapbox CSS Isolation Layout Flicker | `app/layout.tsx:5`, `components/map/MapView.tsx:174` | Apply explicit Tailwind container sizing constraints and trigger `map.resize()` on load. |
| **FM-P2-06** | Medium | GeoJSON NaN Coordinate Parser Crash | `components/map/MapView.tsx:80-100` | Filter out non-finite or `NaN` coordinates before generating GeoJSON features. |
| **FM-P2-07** | Medium | Jest Async Resolution Failure with `next/dynamic` | `components/map/__tests__/MapView.test.tsx:92` | Update test assertions to use async `await screen.findByTestId`. |
| **FM-P3-05** | Medium | Dynamic Modal Chunk Waterfall on Slow Networks | `components/modals/authenticated-modal-host.tsx` | Use `requestIdleCallback` to prefetch heavy modal bundles after initial page render. |
| **FM-P3-06** | Medium | Expand-and-Contract Stepping Hazard | `conductor/.../plan.md:46-48` | Split Migrate and Contract operations into two sequential tasks. |
| **FM-FE4-04** | Medium | Query String Stripping and Trailing Slash Inconsistency | `proxy.ts:45-60` | Preserve `searchParams` in `redirectTo` and normalize deep-link trailing slashes. |
| **FM-FE5-04** | Medium | Out-of-Bounds Review Index Flash in `WineryQnA` | `components/WineryQnA.tsx:392` | Extract `<WineryQuestionReviewCard key={activeQuestionId} />` to reset state synchronously on mount. |
| **FM-7.3** | Medium | CacheStorage Race Conditions | `lib/stores/userStore.ts`, `app/sw.ts:190` | Centralize cache deletion in SW via `event.waitUntil()` and exclude auth routes from `pages` cache. |
| **FM-7.4** | Medium | Stale Authenticated HTML in `pages` Cache | `app/sw.ts:190`, `proxy.ts:20` | Reduce document cache expiration to 24 hours and purge on logout. |

---

## 4. AGENTS.md Guardrail Compliance Matrix

This section rigorously audits the planned changes across Phases 2–7 against the core architectural principles, critical guardrails, execution commands, and domain standards defined in `AGENTS.md`.

| AGENTS.md Guardrail / Standard | Section | Modernization Requirement & Impact | Compliance Verification & Hardening Measures |
|---|---|---|---|
| **1. Production Database Safety** | Sec. 2 (Guardrail 1) | Zero DDL or DML mutations against remote Supabase project (`jfsxclrdxmvftxacjuqf`). | **COMPLIANT**: Phases 2–7 are strictly limited to frontend architecture, tooling, and client/server Next.js code. No database migrations or schema alterations are permitted. |
| **2. Backwards Compatibility & Expand-and-Contract** | Sec. 2 (Guardrail 3) | Layout and component refactoring must expand, migrate, and contract safely without breaking live callers. | **HARDENED**: Phase 3 plan is amended to decouple "Migrate" (mounting `AuthenticatedModalHost` in callers) from "Contract" (removing modals from `app/layout.tsx`), preventing stepping hazards. |
| **3. Git Hygiene** | Sec. 2 (Guardrail 4) | Do not modify `.git/` or make automated commits unless explicitly requested. | **COMPLIANT**: All tasks operate strictly within application source files and conductor track documents. |
| **4. Middleware Entrypoint Standard** | Sec. 4 | `proxy.ts` is the active middleware entrypoint (`middleware.ts` is not used). | **COMPLIANT**: Phase 4 route whitelisting and session update fixes are executed strictly in `proxy.ts` and `utils/supabase/auth-helper.ts`. |
| **5. Date Handling Standard** | Sec. 4 | Always use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts`. | **HARDENED**: Phase 4 and Phase 6 eliminate all 4 occurrences of `new Date().toISOString()` in `VisitForm.tsx` and ensure `trip-form.tsx` uses `formatDateLocal(values.date)`. Static constant replaces `toLocaleDateString()` in legal pages. |
| **6. Relational IDs Normalization** | Sec. 4 | Zustand stores must normalize relational IDs to `Number()` upon retrieval. | **HARDENED**: Mitigated FM-6.4 where negative temporary IDs (`tempId = -Date.now()`) corrupted relational ID state. Added true optimistic rollback on permanent failure and atomic ID replacement during offline queue replay. |
| **7. Coordinate Standardization** | Sec. 4 | All winery data must pass through `standardizeWineryData` in `lib/utils/winery.ts`. Access coordinates via `location.latitude` and `location.longitude` (no `.lat()`, strip legacy `lat`/`lng`). | **HARDENED**: Phase 2 adds finite coordinate validation (`Number.isFinite`) to `MapView.tsx:wineriesGeoJSON` to prevent Mapbox parser crashes on `NaN` coordinates. |
| **8. Ghost Visit Prevention** | Sec. 4 | If a source reports `user_visited: false`, clear the `visits` array in the standardizer. | **COMPLIANT**: Standardizer behavior preserved in `wineryStore` and `visitStore`. |
| **9. DOM Stability & Testing** | Sec. 4 | Keep critical UI containers (`map-container`, `trip-list-container`, `map-view-canvas`) in DOM during loading/error states using `data-state="loading|error|ready"`. | **HARDENED**: Phase 2 unifies `map-view-canvas` to a single root container. Phase 5 enforces keying inner content rather than outer modal containers to preserve drawer/dialog DOM instances. Form states preserve `trip-form-card` DOM stability. |
| **10. UI Architecture Standard** | Sec. 4 | Container/Presentational pattern. Use Tailwind CSS v4 utility classes. | **COMPLIANT**: Separates stateful Server Action logic from presentational form components. Mapbox isolation utilizes Tailwind layout constraints. |
| **11. Environment & Execution Commands** | Sec. 3 | Node.js 24 LTS, Next.js Turbopack dev, Podman Playwright container: `./scripts/run-e2e-container.sh [--build] [project] [test_file]`. | **HARDENED**: Phase 7 task list amended to mandate running containerized Playwright E2E tests (`auth-recovery.spec.ts`, `pwa-offline.spec.ts`, `trip-flow.spec.ts`) via `./scripts/run-e2e-container.sh`. |

---

## 5. Actionable Plan Amendments (Copy-Paste Ready for `plan.md`)

Below are the complete, copy-paste-ready task lists for Phases 2, 3, 4, 5, 6, and 7 of `conductor/tracks/frontend-modernization-architecture_20260901/plan.md`. These amendments incorporate every mitigation, test requirement, and AGENTS.md guardrail identified in this review.

```markdown
## Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading
Focus: Isolate Mapbox GL CSS to map boundaries, harden Mapbox against runtime WebGL crashes with automatic Google Maps fallback, standardize coordinates, and dynamically load fallback components via next/dynamic with strict DOM stability.

- [ ] Task: Write failing tests for Mapbox CSS isolation, Google Maps fallback dynamic loading, and runtime error recovery
    - [ ] Add test asserting `app/layout.tsx` does not import `mapbox-gl/dist/mapbox-gl.css`
    - [ ] Add test verifying `components/map/MapView.tsx` loads `GoogleMapFallback` via `next/dynamic` and does not evaluate `@googlemaps/js-api-loader` on Mapbox-supported clients
    - [ ] Add test verifying `MapView.tsx` transitions gracefully to `GoogleMapFallback` when Mapbox emits a WebGL context creation failure or runtime error
    - [ ] Add test verifying coordinate filtering excludes `NaN` / non-finite coordinates from GeoJSON generation
- [ ] Task: Isolate Mapbox CSS, harden WebGL error boundary, and dynamically load Google Maps fallback
    - [ ] Move `import 'mapbox-gl/dist/mapbox-gl.css'` from `app/layout.tsx` into `components/map/MapView.tsx`
    - [ ] Refactor `components/map/MapView.tsx` to load `GoogleMapFallback` via `next/dynamic({ ssr: false })` using exact filesystem casing (`./google-map-fallback`)
    - [ ] Add `onError` listener and `MapErrorBoundary` in `components/map/MapView.tsx` to automatically trigger `GoogleMapFallback` on WebGL failure or style error
    - [ ] Maintain strict DOM stability on single root element (`data-testid="map-view-canvas" data-state="loading|ready|error"`) without nested duplicate test IDs
    - [ ] Purge DOM container and event listeners on effect cleanup in `components/map/google-map-fallback.tsx` to eliminate React 19 StrictMode context leaks
    - [ ] Sanitize coordinates in `MapView.tsx:wineriesGeoJSON` to prevent Mapbox parser crashes on `NaN`
    - [ ] Enforce Tailwind sizing constraints on `MapView.tsx` wrapper and trigger `map.resize()` on load
- [ ] Task: Verify Mapbox rendering and fallback behavior across unit test suite
    - [ ] Update `components/map/__tests__/MapView.test.tsx` for dynamic import compatibility (`findByTestId`) and verify tests pass cleanly
    - [ ] Run `npm run type-check` to verify zero type regressions in map components
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading' (Protocol in workflow.md)

## Phase 3: Root Layout Decoupling & Authenticated Modal Host
Focus: Extract heavy modal trees from root `app/layout.tsx` into an `AuthenticatedModalHost` (including WineryModal and VisitHistoryModal) loaded lazily via next/dynamic with idle prefetching, while standardizing portal behavior and strictly maintaining `<ModalHost />` (`#modal-root`) in layout.

- [ ] Task: Write failing tests for root layout modal isolation and AuthenticatedModalHost mounting
    - [ ] Add test asserting `app/layout.tsx` retains `<ModalHost />` (`#modal-root`) but contains no direct imports or JSX nodes for `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, or `GlobalModalRenderer`
    - [ ] Add test asserting `AuthenticatedModalHost` lazily loads modal trees via `next/dynamic({ ssr: false })` and prefetch triggers on idle
    - [ ] Add test asserting `components/app-shell.tsx` and `app/trips/[id]/page.tsx` mount `AuthenticatedModalHost`
    - [ ] Add test asserting route transitions dismiss open modals and cleanse body pointer-event locks
- [ ] Task: Create `AuthenticatedModalHost` with full modal coverage (Expand)
    - [ ] Create `components/modals/authenticated-modal-host.tsx` marked `"use client";` dynamically importing `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, `GlobalModalRenderer`, `WineryModal`, and `VisitHistoryModal` with `{ ssr: false }`
    - [ ] Add route change cleanup and idle prefetching via `requestIdleCallback` in `authenticated-modal-host.tsx`
    - [ ] Standardize portal targets between Radix `DialogPortal` and `#modal-root`
- [ ] Task: Mount modal host in callers (Migrate)
    - [ ] Mount `AuthenticatedModalHost` inside `components/app-shell.tsx`, `app/trips/[id]/page.tsx`, `app/friends/[id]/page.tsx`, and `app/settings/page.tsx`
    - [ ] Remove redundant `<WineryModal />` and `<VisitHistoryModal />` from `components/app-shell.tsx`
    - [ ] Verify `AuthenticatedModalHost` renders correctly across authenticated views
- [ ] Task: Decouple root `app/layout.tsx` (Contract)
    - [ ] Remove modal component imports and JSX elements from root `app/layout.tsx`, ensuring public routes (`/login`, `/signup`, `/forgot-password`, `/manual-confirm`, `/privacy`, `/terms`) mount zero modal code
    - [ ] Verify test suite and typecheck pass cleanly
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Root Layout Decoupling & Authenticated Modal Host' (Protocol in workflow.md)

## Phase 4: Server Component Boundaries, Route Metadata & Deterministic Dates
Focus: Convert `/friends/[id]`, `/forgot-password`, and `/manual-confirm` into Server Components exporting static metadata, whitelist `/manual-confirm` in `proxy.ts`, fix middleware cookie forwarding, add App Router error boundary, and eliminate non-deterministic dates.

- [ ] Task: Write failing tests for Server Component auth guards, route metadata, proxy whitelisting, cookie forwarding, and SSR date determinism
    - [ ] Add test asserting `app/friends/[id]/page.tsx` is an async Server Component redirecting unauthenticated users to `/login` and exporting route `Metadata`
    - [ ] Add tests asserting `app/forgot-password/page.tsx` and `app/manual-confirm/page.tsx` are Server Components exporting static `Metadata`
    - [ ] Add test asserting `proxy.ts` allows unauthenticated access to `/manual-confirm` and preserves query parameters in `redirectTo`
    - [ ] Add test asserting `utils/supabase/auth-helper.ts` forwards updated cookies to `NextResponse.next({ request })` so downstream Server Components receive refreshed tokens
    - [ ] Add tests asserting `app/privacy/page.tsx` and `app/terms/page.tsx` render static dates with zero hydration mismatches
    - [ ] Add test asserting `components/VisitForm.tsx` uses `getTodayLocal()` for initial and max dates and preserves `editingVisit.visit_date` without UTC shifts
- [ ] Task: Convert `app/friends/[id]/page.tsx` to Server Component with auth guard, metadata, and error boundary
    - [ ] Refactor `app/friends/[id]/page.tsx` into an async Server Component with server auth check via `getUser()`, server-side redirect to `/login?redirectTo=/friends/${id}`, and static `Metadata` export
    - [ ] Pass resolved `id` to client component `components/FriendProfile.tsx`
    - [ ] Create `app/error.tsx` providing a global fallback error boundary that preserves App Shell navigation and allows users to retry failed server operations
- [ ] Task: Modularize auth pages, harden `proxy.ts`, and enforce deterministic SSR dates
    - [ ] Split `app/forgot-password/page.tsx` into a Server Component exporting static `Metadata` and client component `components/forgot-password-form.tsx`
    - [ ] Split `app/manual-confirm/page.tsx` into a Server Component exporting static `Metadata` and client component `components/manual-confirm-form.tsx`
    - [ ] In `proxy.ts`, add `'/manual-confirm'` to `publicRoutes`, preserve query strings in `redirectTo`, normalize deep-link trailing slashes, and return 401 for unauthenticated Server Action POSTs
    - [ ] In `utils/supabase/auth-helper.ts`, update `setAll` to forward modified request cookies via `NextResponse.next({ request })`
    - [ ] Replace dynamic `new Date().toLocaleDateString()` in `app/privacy/page.tsx` and `app/terms/page.tsx` with static `LAST_UPDATED = "January 15, 2025"` constant
    - [ ] In `components/VisitForm.tsx`, replace `new Date().toISOString().split("T")[0]` (lines 37, 48, 108) with `getTodayLocal()`, and retain `editingVisit.visit_date` directly without re-serializing via `toISOString()` (line 59)
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Server Component Boundaries, Route Metadata & Deterministic Dates' (Protocol in workflow.md)

## Phase 5: React 19 Adherence: State Derivation & Compiler Compliance
Focus: Eliminate render-time `setState` calls in `use-winery-modal-state.ts` via keyed inner content, preserve outer drawer/dialog DOM stability, key review display in `WineryQnA.tsx`, derive state in `use-trip-actions.ts`, adopt `useMounted()`, and remove all 3 `react-hooks/set-state-in-effect` suppressions.

- [ ] Task: Write failing tests for React Compiler state derivation, keyed resets, and effect suppression removal
    - [ ] Add tests for `use-winery-modal-state.ts` asserting state reset behavior without render-time `setState`
    - [ ] Add test asserting outer modal containers (`Drawer`, `Dialog`, `Sheet`) maintain stable DOM instances while inner content resets via `key={activeWineryId}`
    - [ ] Add tests for `WineryQnA.tsx` asserting active question transitions reset review state without `useEffect` state synchronization or out-of-bounds review flashes
    - [ ] Add test asserting zero `react-hooks/set-state-in-effect` suppressions exist across the entire repository
- [ ] Task: Eliminate render-time `setState` in `use-winery-modal-state.ts` and key inner modal content
    - [ ] In `components/winery/use-winery-modal-state.ts`, eliminate `prevActiveWineryId`, `setPrevActiveWineryId`, and render-phase state setters
    - [ ] In `components/winery-modal.tsx`, maintain stable outer `<Drawer>`, `<Dialog>`, and `<Sheet>` containers, and extract inner content to `<WineryModalContent key={activeWineryId} activeWineryId={activeWineryId} />` to reset tabs, lightbox, and scroll state via React reconciliation
    - [ ] In `lib/stores/uiStore.ts`, reset drawer `snapPoint` to default `"300px"` in the `openWineryModal` action handler to avoid snap point desynchronization
- [ ] Task: Key review content in `WineryQnA.tsx` and eliminate all effect suppressions
    - [ ] In `components/WineryQnA.tsx`, extract review display into `<WineryQuestionReviewCard key={activeQuestionId} />` and remove `useEffect` state reset
    - [ ] In `hooks/use-trip-actions.ts`, derive `currentMembers` directly as `trip.members || []` and remove unused `selectedFriends` state, setter, and effect
    - [ ] In `components/trip-planner.tsx`, replace local `isMounted` state and effect with shared `useMounted()` hook
    - [ ] Remove all 3 `eslint-disable-next-line react-hooks/set-state-in-effect` comments across the codebase
- [ ] Task: Conductor - User Manual Verification 'Phase 5: React 19 Adherence: State Derivation & Compiler Compliance' (Protocol in workflow.md)

## Phase 6: React 19 Form Actions Modernization
Focus: Standardize authentication forms on React 19 Server Actions with `useActionState` and serializable error contracts; modernize `trip-form.tsx` submission with a Controlled Hybrid Client Action State pattern preserving `react-hook-form` / Zod validation, offline winery selection, and atomic optimistic rollback.

- [ ] Task: Write failing tests for form submissions using React 19 `useActionState` and optimistic rollback
    - [ ] Add tests for `components/login-form.tsx` verifying pending state transitions, serializable error handling, and form submission via `useActionState`
    - [ ] Add tests for `components/forgot-password-form.tsx` and `components/manual-confirm-form.tsx` verifying submission via `useActionState`
    - [ ] Add tests for `components/trip-form.tsx` verifying form submission via Controlled Hybrid `useActionState` while preserving `react-hook-form` / Zod validation, offline winery selection without blocking `ensureInDb` RPC guards, and store persistence
    - [ ] Add tests in `lib/stores/slices/__tests__/tripMutationHelpers.test.ts` verifying `createTripHelper` rolls back `tempId` on permanent error and replaces `tempId` atomically upon sync
- [ ] Task: Modernize authentication forms with React 19 Server Actions, serializable contracts, and `useActionState`
    - [ ] Create `app/actions/auth.ts` exporting typed Server Actions (`loginAction`, `forgotPasswordAction`, `manualConfirmAction`) with defensive `try/catch` and plain serializable `ActionState` contracts
    - [ ] Refactor `components/login-form.tsx` to use React 19 `useActionState` with native `isPending` indicator and `router.refresh()` / `router.push()` upon success
    - [ ] Refactor `components/forgot-password-form.tsx` and `components/manual-confirm-form.tsx` to use `useActionState` with client offline connectivity guard
- [ ] Task: Modernize `trip-form.tsx` submission with Controlled Hybrid Client `useActionState` and offline resilience
    - [ ] Refactor `components/trip-form.tsx` with Controlled Hybrid `useActionState`, triggering client action dispatch via `form.handleSubmit(onValidSubmit)` in `startTransition` and syncing action errors back to `form.setError()`
    - [ ] Update `handleWineryToggle` in `components/trip-form.tsx` to allow offline winery selection by assigning an ephemeral ID when `ensureInDb` returns `null`
    - [ ] In `lib/stores/slices/tripMutationHelpers.ts`, implement true optimistic rollback on permanent failure in `createTripHelper`
    - [ ] In `lib/services/syncService.ts` and `lib/stores/slices/tripDataSlice.ts`, implement atomic `replaceTripTempId` to eliminate ghost trip duplication after offline queue replay
- [ ] Task: Conductor - User Manual Verification 'Phase 6: React 19 Form Actions Modernization' (Protocol in workflow.md)

## Phase 7: Service Worker Auth Hygiene & Production Quality Audit
Focus: Restrict `/auth/v1/*` routes in `app/sw.ts` strictly to NetworkOnly, bridge `userStore.logout()` to purge CacheStorage safely with offline resilience and cross-tab awareness, harden `fetchUser()` with local session fallback, and execute full production quality audit including containerized Playwright E2E tests.

- [ ] Task: Write failing tests for Service Worker auth caching rules, offline session preservation, and build audit
    - [ ] Add tests in `lib/utils/__tests__/sw-utils.test.ts` verifying `/auth/v1/` routes match `NetworkOnly` and are excluded from `StaleWhileRevalidate`
    - [ ] Add tests in `lib/stores/__tests__/userStore.test.ts` verifying `userStore.fetchUser()` falls back to `getSession()` when offline without losing user identity
    - [ ] Add tests in `lib/stores/__tests__/userStore.test.ts` verifying `userStore.logout()` purges `supabase-auth` and `pages` from `window.caches`, posts `PURGE_AUTH_CACHE` to Service Worker with null-controller safety, and completes store reset even when offline or in non-browser test environments
- [ ] Task: Harden `app/sw.ts` with NetworkOnly auth caching and bridge `userStore.ts#logout`
    - [ ] In `app/sw.ts`, remove `StaleWhileRevalidate` matcher for `/auth/v1/user` and `/auth/v1/session`; route all `/auth/v1/*` requests strictly to `NetworkOnly`
    - [ ] In `app/sw.ts`, add message listener for `{ type: 'PURGE_AUTH_CACHE' }` to delete `supabase-auth` and `pages` caches, and exclude auth pages (`/login`, `/signup`, `/forgot-password`, `/manual-confirm`) from `pages` cache
    - [ ] In `lib/stores/userStore.ts#logout`, wrap `supabase.auth.signOut()` in defensive `try/catch`, purge `window.caches`, and dispatch `PURGE_AUTH_CACHE` via `navigator.serviceWorker.ready` and `controller`
    - [ ] In `lib/stores/userStore.ts#fetchUser`, add offline fallback to `supabase.auth.getSession()` when network is unavailable
- [ ] Task: Execute full quality audit (lint, type-check, build, and containerized E2E)
    - [ ] Run `npm run lint` and verify zero ESLint errors, warnings, or suppressions
    - [ ] Run `npm run type-check` and verify zero TypeScript errors
    - [ ] Run `npm run build` and verify clean production Webpack compilation with reduced JavaScript chunk sizes
    - [ ] Run containerized Playwright E2E tests via `./scripts/run-e2e-container.sh --build webkit e2e/auth-recovery.spec.ts`
    - [ ] Run containerized Playwright E2E tests via `./scripts/run-e2e-container.sh webkit e2e/pwa-offline.spec.ts`
    - [ ] Run containerized Playwright E2E tests via `./scripts/run-e2e-container.sh webkit e2e/trip-flow.spec.ts`
- [ ] Task: Conductor - User Manual Verification 'Phase 7: Service Worker Auth Hygiene & Production Quality Audit' (Protocol in workflow.md)
```

---

## 6. Conclusion & Implementation Sequence Guidance

The Frontend Modernization initiative is poised to deliver significant bundle optimization, tooling unblocking, and React 19 compiler adherence. However, proceeding with Phases 2–7 under the original `plan.md` tasks would have introduced severe regressions in runtime map rendering, dialog state persistence, user authentication, date integrity, offline trip planning, and PWA session caching.

By incorporating the architectural mitigations, error boundaries, Controlled Hybrid Action patterns, and containerized E2E audits detailed in this review, the implementation team can proceed through Phases 2 through 7 with high confidence, zero regressions, and strict adherence to `AGENTS.md` standards.

**Immediate Next Steps**:
1. Incorporate the amended task lists in Section 5 into `conductor/tracks/frontend-modernization-architecture_20260901/plan.md`.
2. Update track status in `conductor/tracks.md` to reflect that the Phase 2–7 failure mode review is complete and verified.
3. Dispatch Phase 2 implementation adhering strictly to the hardened `MapErrorBoundary`, single-container DOM stability, and Linux casing standards established herein.
