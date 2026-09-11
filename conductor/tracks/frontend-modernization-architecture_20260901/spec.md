# Specification: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization

## 1. Overview & Objectives
This track executes the **Frontend Modernization** initiative for Milestone [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1), addressing parent epic [#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39) and detailed issue specifications in [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36), building directly on [04-frontend-modernization-architecture.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/proposals/04-frontend-modernization-architecture.md) and hardened by the comprehensive architectural failure-mode audit in [failure-mode-review.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/frontend-modernization-architecture_20260901/failure-mode-review.md).

The primary objectives are organized into **7 tightly bounded, domain-separated phases** (each strictly capped at 3–4 tasks to guarantee single-session execution under 60 turns):
1. **Bundle & Tooling Pruning (Phase 1 - Tooling Domain - COMPLETE `1cbfaa1`)**: Prune 7 dead dependencies and 10 unreferenced Radix primitives (retaining `@radix-ui/react-accordion`), clean brittle `package.json` overrides (`minimatch`, `glob`, `brace-expansion`, `uuid`), and make Serwist PWA production-only in `next.config.mjs` to unblock Turbopack development (`next dev --turbo`).
2. **Map Engine Bundle Isolation & Dynamic Fallback (Phase 2 - Map Engine Domain)**: Isolate Mapbox GL CSS to map boundaries, harden Mapbox against runtime WebGL context crashes and style failures via an internal `MapErrorBoundary` with automatic fallback to `google-map-fallback.tsx`, sanitize winery coordinates against `NaN` crashes, resolve Linux case-sensitive imports (`./google-map-fallback`), and dynamically load fallback components via `next/dynamic({ ssr: false })` while strictly maintaining single-element DOM stability (`data-testid="map-view-canvas" data-state="loading|ready|error"`).
3. **Root Layout Decoupling & Authenticated Modal Host (Phase 3 - Layout Domain / Expand-and-Contract)**: Extract heavy modal trees from root `app/layout.tsx` into a lazy `AuthenticatedModalHost` marked `"use client";` (covering `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, `GlobalModalRenderer`, `WineryModal`, and `VisitHistoryModal`) mounted in `components/app-shell.tsx` and standalone authenticated views (including `app/trips/[id]/page.tsx`), adding route-change dismissal to prevent form state destruction and clear body `pointer-events: none` locks, while strictly preserving `<ModalHost />` (`#modal-root`) in root `app/layout.tsx` for portal stability.
4. **Server Component Boundaries, Route Metadata & Deterministic Dates (Phase 4 - App Router Domain)**: Enforce proper Server/Client boundaries across `/friends/[id]`, `/forgot-password`, and `/manual-confirm`; whitelist `/manual-confirm` in `proxy.ts` to unblock confirmation flows; forward updated session cookies in `utils/supabase/auth-helper.ts` via `NextResponse.next({ request })` to prevent middleware session dropouts; export static route `Metadata`; add `app/error.tsx` App Router error boundary; and eliminate 4 non-deterministic date bugs in SSR and visit forms (`app/privacy`, `app/terms`, `components/VisitForm.tsx`).
5. **React 19 Adherence: State Derivation & Compiler Compliance (Phase 5 - React 19 Domain)**: Eliminate render-time `setState` in `use-winery-modal-state.ts` while preserving outer drawer/dialog instances in `components/winery-modal.tsx` to prevent animation thrashing, keying only inner `<WineryModalContent key={activeWineryId} />`; reset drawer snap-points inside action handlers; extract keyed `<WineryQuestionReviewCard key={activeQuestionId} />` in `WineryQnA.tsx`; derive `currentMembers` directly in `use-trip-actions.ts`; adopt `useMounted()` in `trip-planner.tsx`; and eliminate all 3 `react-hooks/set-state-in-effect` ESLint suppressions across the entire repository.
6. **React 19 Form Actions Modernization (Phase 6 - Forms Domain)**: Standardize authentication forms (`login-form.tsx`, `forgot-password-form.tsx`, `manual-confirm-form.tsx`) on React 19 Server Actions (`app/actions/auth.ts`) with typed, serializable `ActionState` return types to prevent Next.js Flight crashes; modernize `trip-form.tsx` submission with a Controlled Hybrid Client Action State pattern preserving `react-hook-form` / Zod validation, supporting offline winery selection via ephemeral IDs, and ensuring atomic `replaceTripTempId` to eliminate ghost trip duplication after offline sync replay.
7. **Service Worker Auth Hygiene & Production Quality Audit (Phase 7 - PWA & QA Domain)**: Enforce `NetworkOnly` caching for Supabase Auth (`/auth/v1/*`) in `app/sw.ts`; exclude auth pages from `pages` cache; add offline fallback to `supabase.auth.getSession()` in `userStore.fetchUser()`; bridge `userStore.logout()` to purge `supabase-auth` and `pages` from `window.caches` with defensive null-controller shielding and `PURGE_AUTH_CACHE` SW messaging; and execute a complete production quality audit (`lint`, `type-check`, `build`, and containerized Playwright E2E tests).

---

## 2. Scope & Technical Findings Addressed

- **FE-01 & FE-02 (Dependency Pruning - Phase 1 - COMPLETE)**:
  - Pruned 7 dead libraries: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `recharts`, `react-resizable-panels`, `input-otp`, and `sonner`.
  - Pruned 10 unreferenced Radix primitives: `aspect-ratio`, `collapsible`, `context-menu`, `hover-card`, `menubar`, `navigation-menu`, `progress`, `radio-group`, `scroll-area`, and `slider`.
  - **Critical Retention**: Retained `@radix-ui/react-accordion` (actively imported in `components/winery/winery-amenities-list.tsx:17` and `components/WineryDetails.tsx:5`).
- **FE-03 (Map Engine Isolation & Error Boundary - Phase 2)**:
  - Move `import 'mapbox-gl/dist/mapbox-gl.css'` from `app/layout.tsx` into `components/map/MapView.tsx`.
  - Dynamically load `GoogleMapFallback` via `next/dynamic({ ssr: false })` using exact kebab-case `./google-map-fallback` to prevent Linux case-sensitive build failures.
  - Implement `MapErrorBoundary` and `onError` handler on `<Map>` in `MapView.tsx` to automatically transition to `GoogleMapFallback` upon WebGL context creation failure or tile loading timeouts.
  - Ensure exactly ONE element holds `data-testid="map-view-canvas"` to prevent duplicate selector collisions in testing frameworks.
  - Purge DOM container and event listeners on effect cleanup in `google-map-fallback.tsx` to prevent React 19 StrictMode context leaks.
  - Sanitize winery coordinates (`Number.isFinite`) in `wineriesGeoJSON` to prevent Mapbox GeoJSON parser crashes on `NaN`.
- **FE-04 (Service Worker Auth Hygiene & Offline Identity - Phase 7)**:
  - Remove `StaleWhileRevalidate` matcher in `app/sw.ts` for `/auth/v1/user` and `/auth/v1/session`; route all `/auth/v1/*` requests strictly to `NetworkOnly`.
  - In `userStore.ts#fetchUser`, add offline fallback to `supabase.auth.getSession()` so users do not lose authenticated state when opening the PWA offline.
  - Implement `PURGE_AUTH_CACHE` listener in `app/sw.ts` to evict `supabase-auth` and `pages` caches upon user logout, and exclude auth pages (`/login`, `/signup`, `/forgot-password`, `/manual-confirm`) from the Serwist `pages` cache.
  - Bridge `userStore.ts#logout` to purge `window.caches` with defensive `try/catch` wrapping around `supabase.auth.signOut()` and safe null-controller message posting.
- **FE-06 (Turbopack Unblocking - Phase 1 - COMPLETE)**:
  - Refactored `next.config.mjs` so Serwist activates exclusively when `process.env.NODE_ENV === 'production'`, exporting plain `nextConfig` during development.
  - Updated `package.json` dev script to `"dev": "next dev --turbo"`, keeping `"build": "next build --webpack"`.
- **FE-07 (Server Component Auth Guard & Error Boundary - Phase 4)**:
  - Convert `app/friends/[id]/page.tsx` to an async Server Component with server-side `getUser()` check, redirect to `/login?redirectTo=/friends/${id}`, and `Metadata` export, delegating interactive UI to `components/FriendProfile.tsx`.
  - Create `app/error.tsx` App Router error boundary to prevent full-page White Screens of Death on uncaught server rejections.
- **FE-08 (React 19 Actions & Offline Mutation Safety - Phase 6)**:
  - Standardize authentication forms (`login-form.tsx`, `forgot-password-form.tsx`, `manual-confirm-form.tsx`) on React 19 Server Actions (`app/actions/auth.ts`) using `useActionState` with plain serializable `ActionState` contracts (preventing Flight serialization crashes).
  - Modernize `trip-form.tsx` submission with Controlled Hybrid `useActionState` while preserving `react-hook-form` / Zod schema validation.
  - Allow offline winery selection in `trip-form.tsx` via ephemeral IDs when `ensureInDb` returns `null`.
  - Implement atomic `replaceTripTempId` in `syncService.ts` and `tripDataSlice.ts` to eliminate duplicate ghost trips on offline sync replay, and add true optimistic rollback on permanent mutation failure.
- **FE-09 (React Compiler Violations, Drawer Stability & Suppressions - Phase 5)**:
  - In `components/winery/use-winery-modal-state.ts`, eliminate render-time `setState` calls (`prevActiveWineryId`, `snapPoint`, `lightboxPhoto`).
  - In `components/winery-modal.tsx`, maintain stable outer `<Drawer>`, `<Dialog>`, and `<Sheet>` shells and key only the inner content: `<WineryModalContent key={activeWineryId} />` to reset tabs, lightbox, and scroll state via React reconciliation without unmounting the Vaul drawer wrapper.
  - Reset drawer `snapPoint` to default `"300px"` in `uiStore.openWineryModal` action handler.
  - In `components/WineryQnA.tsx`, key review content (`<WineryQuestionReviewCard key={activeQuestionId} />`) to eliminate `useEffect` state synchronization.
  - In `hooks/use-trip-actions.ts`, derive `currentMembers` directly and remove `selectedFriends` state and effect.
  - In `components/trip-planner.tsx`, replace local `isMounted` state with shared `useMounted()` hook.
  - Eliminate all 3 `react-hooks/set-state-in-effect` ESLint suppressions across the codebase.
- **FE-10 (Deterministic SSR Dates & Form Date Standardization - Phase 4)**:
  - Replace dynamic `new Date().toLocaleDateString()` in `app/privacy/page.tsx` and `app/terms/page.tsx` with static `LAST_UPDATED = "January 15, 2025"` constant.
  - Replace `new Date().toISOString().split("T")[0]` in `components/VisitForm.tsx` (lines 37, 48, 108) with `getTodayLocal()`.
  - Retain `editingVisit.visit_date` directly in `components/VisitForm.tsx:59` without re-serializing through `toISOString()`, preventing UTC date shifts for evening visits.
- **FE-11 (Root Layout Modal Decoupling & Navigation Safety - Phase 3)**:
  - Preserve `<ModalHost />` (`#modal-root` portal container) in `app/layout.tsx`.
  - Extract `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, `GlobalModalRenderer`, `WineryModal`, and `VisitHistoryModal` into lazy `AuthenticatedModalHost` marked `"use client";` with `ssr: false` and idle prefetching.
  - Mount `AuthenticatedModalHost` inside `components/app-shell.tsx`, `app/trips/[id]/page.tsx`, `app/friends/[id]/page.tsx`, and `app/settings/page.tsx`.
  - Add route navigation cleanup to dismiss open modals and cleanse body `pointer-events: none` locks upon route transitions.
- **FE-12 (Dependency Override Cleanup - Phase 1 - COMPLETE)**:
  - Pruned brittle `minimatch`, `glob`, `brace-expansion`, and redundant `uuid` overrides in `package.json#overrides`.
  - Retained essential security and build overrides: `postcss: "^8.5.18"`, `ws: "^8.20.1"`, and `sharp: "^0.35.0"`.
- **FE-13 (Auth Page Architecture, Proxy Whitelisting & Cookie Forwarding - Phase 4)**:
  - Split `app/forgot-password/page.tsx` into a Server Component exporting `Metadata` and a client component `components/forgot-password-form.tsx`.
  - Split `app/manual-confirm/page.tsx` into a Server Component exporting `Metadata` and a client component `components/manual-confirm-form.tsx`.
  - Add `'/manual-confirm'` to `publicRoutes` in `proxy.ts`, preserve query strings in `redirectTo`, normalize trailing slashes, and return 401 for unauthenticated Server Action POSTs.
  - In `utils/supabase/auth-helper.ts`, update `setAll` to forward modified request cookies via `NextResponse.next({ request })` so downstream Server Components receive refreshed tokens.

---

## 3. Functional Requirements by Phase

### Phase 1: Dependency Pruning, Tooling Optimization & Turbopack Unblocking [COMPLETE]
1. **Audit & Remove Dead Packages**:
   - Pruned dead libraries and unreferenced Radix packages from `package.json`.
   - Retained `@radix-ui/react-accordion`.
2. **Clean Dependency Overrides**:
   - Removed brittle overrides (`minimatch`, `glob`, `brace-expansion`, `uuid`).
3. **Make Serwist Production-Only & Enable Turbopack**:
   - Serwist activates exclusively in production builds; dev script updated to `next dev --turbo`.

### Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading
1. **Isolate Mapbox CSS & Canvas Sizing**:
   - Remove `import 'mapbox-gl/dist/mapbox-gl.css'` from `app/layout.tsx`.
   - Move Mapbox CSS import to `components/map/MapView.tsx`.
   - Constrain `MapView.tsx` wrapper with explicit Tailwind dimensions and trigger `map.resize()` on load.
2. **Harden Mapbox with Runtime Fallback**:
   - Wrap `<Map>` inside `MapErrorBoundary` and attach an `onError` listener to detect WebGL context creation failures and tile style errors.
   - Automatically transition to `GoogleMapFallback` without throwing unhandled exceptions.
3. **Lazy-Load Google Maps Fallback with Strict DOM Stability**:
   - Dynamically import `GoogleMapFallback` via `next/dynamic({ ssr: false })` using exact kebab-case `./google-map-fallback`.
   - Maintain strict DOM stability on a single container (`data-testid="map-view-canvas"` with `data-state="loading|ready|error"`).
   - Purge DOM container and event listeners on effect cleanup in `google-map-fallback.tsx`.
   - Sanitize winery coordinates in `wineriesGeoJSON` to prevent Mapbox GeoJSON parser crashes on `NaN`.

### Phase 3: Root Layout Decoupling & Authenticated Modal Host
1. **Preserve Root Portal Anchor**:
   - Retain `<ModalHost />` (`#modal-root`) in root `app/layout.tsx`.
2. **Authenticated Modal Host with Full Modal Coverage (Expand-and-Contract)**:
   - *(Expand)* Create `components/modals/authenticated-modal-host.tsx` marked `"use client";` dynamically importing `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, `GlobalModalRenderer`, `WineryModal`, and `VisitHistoryModal` with `{ ssr: false }`.
   - Include idle prefetching via `requestIdleCallback` and route-change cleanup to dismiss open modals and restore document body pointer events.
   - *(Migrate)* Mount `AuthenticatedModalHost` inside `components/app-shell.tsx`, `app/trips/[id]/page.tsx`, `app/friends/[id]/page.tsx`, and `app/settings/page.tsx`. Remove redundant modal declarations from `components/app-shell.tsx`.
   - *(Contract)* Remove direct modal imports and JSX elements from root `app/layout.tsx`.

### Phase 4: Server Component Boundaries, Route Metadata & Deterministic Dates
1. **Server Auth Guard, Metadata & Error Boundary for `/friends/[id]`**:
   - Convert `app/friends/[id]/page.tsx` into an async Server Component with `await getUser()`, server redirect to `/login?redirectTo=/friends/${id}`, and static `Metadata` export.
   - Delegate presentation to client `<FriendProfile friendId={id} />`.
   - Create `app/error.tsx` providing a global fallback error boundary.
2. **Modularize Auth Pages, Harden Proxy & Forward Cookies**:
   - Convert `app/forgot-password/page.tsx` and `app/manual-confirm/page.tsx` into Server Components exporting `Metadata`.
   - Extract forms into `components/forgot-password-form.tsx` and `components/manual-confirm-form.tsx`.
   - Add `'/manual-confirm'` to `publicRoutes` in `proxy.ts`, preserve query strings in `redirectTo`, and return 401 for unauthenticated Server Action POSTs.
   - Update `utils/supabase/auth-helper.ts` to forward modified request cookies via `NextResponse.next({ request })`.
3. **Deterministic SSR and Form Dates**:
   - Replace dynamic `new Date().toLocaleDateString()` in `app/privacy/page.tsx` and `app/terms/page.tsx` with static `LAST_UPDATED = "January 15, 2025"` constant.
   - Replace `new Date().toISOString().split("T")[0]` in `components/VisitForm.tsx` with `getTodayLocal()`.
   - Preserve `editingVisit.visit_date` directly in `components/VisitForm.tsx` without UTC re-serialization.

### Phase 5: React 19 Adherence: State Derivation & Compiler Compliance
1. **Fix React Compiler Memoization & Keyed Inner Content**:
   - In `components/winery/use-winery-modal-state.ts`, remove `prevActiveWineryId`, `setPrevActiveWineryId`, and render-phase state setters.
   - In `components/winery-modal.tsx`, maintain stable outer drawer/dialog instances and extract inner content to `<WineryModalContent key={activeWineryId} />` to reset state via React reconciliation without unmounting Vaul drawers.
   - Reset drawer `snapPoint` to default `"300px"` in `uiStore.openWineryModal`.
2. **Eliminate All `react-hooks/set-state-in-effect` Suppressions**:
   - In `components/WineryQnA.tsx`, extract review display into `<WineryQuestionReviewCard key={activeQuestionId} />`.
   - In `hooks/use-trip-actions.ts`, derive `currentMembers` directly as `trip.members || []` and remove unused `selectedFriends` state and effect.
   - In `components/trip-planner.tsx`, replace local `isMounted` effect with shared `useMounted()` hook.
   - Remove all 3 ESLint suppression comments.

### Phase 6: React 19 Form Actions Modernization
1. **Auth Forms on React 19 Server Actions with Serializable Contracts**:
   - Create `app/actions/auth.ts` exporting typed Server Actions (`loginAction`, `forgotPasswordAction`, `manualConfirmAction`) returning plain serializable `ActionState` objects (preventing Flight serialization crashes).
   - Refactor `login-form.tsx`, `forgot-password-form.tsx`, and `manual-confirm-form.tsx` to use `useActionState` with native `isPending` indicator.
2. **Entity Forms Controlled Hybrid Client Action State**:
   - Refactor `components/trip-form.tsx` with Controlled Hybrid `useActionState`, triggering client action dispatch via `form.handleSubmit(onValidSubmit)` in `startTransition` and syncing action errors back to `form.setError()`.
   - Allow offline winery selection in `trip-form.tsx` by assigning ephemeral IDs when `ensureInDb` returns `null`.
   - Implement true optimistic rollback on permanent failure in `createTripHelper`.
   - Implement atomic `replaceTripTempId` in `syncService.ts` and `tripDataSlice.ts` to eliminate ghost trip duplication after offline queue replay.

### Phase 7: Service Worker Auth Hygiene & Production Quality Audit
1. **Service Worker Auth Cache Eviction & Offline Session Fallback**:
   - In `app/sw.ts`, remove `StaleWhileRevalidate` matcher for `/auth/v1/user` and `/auth/v1/session`; route all `/auth/v1/*` requests strictly to `NetworkOnly`.
   - Exclude auth pages (`/login`, `/signup`, `/forgot-password`, `/manual-confirm`) from the Serwist `pages` cache.
   - In `lib/stores/userStore.ts#fetchUser`, add offline fallback to `supabase.auth.getSession()` when network is unavailable.
2. **Offline-Resilient Logout Cache Eviction**:
   - In `lib/stores/userStore.ts#logout`, wrap `supabase.auth.signOut()` in defensive `try/catch`.
   - Purge `supabase-auth` and `pages` from `window.caches` and dispatch `PURGE_AUTH_CACHE` via `navigator.serviceWorker.ready` and `controller` with null-controller safety.
3. **Full Quality Audit & Containerized E2E Tests**:
   - Execute `npm run lint`, `npm run type-check`, and `npm run build` to verify clean compilation with zero warnings.
   - Run containerized Playwright E2E tests via `./scripts/run-e2e-container.sh` covering auth recovery, PWA offline behavior, and trip flows.

---

## 4. Non-Functional & Operational Requirements (AGENTS.md)
- **Date Handling**: Always use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts`.
- **UI Architecture**: Maintain Container/Presentational pattern with Tailwind CSS v4 utility classes.
- **DOM Stability**: Keep critical UI containers (`map-container`, `trip-list-container`, `map-view-canvas`) in the DOM across loading/error states using `data-state="loading|error|ready"`.
- **Adaptive 3-Tier Layout**: Respect responsive tier transitions across Mobile (< 768px), Tablet Portrait (768px–1024px), and Desktop (≥ 1024px).
- **Zero Regressions**: All existing unit tests (`npm test`) and E2E tests must continue to pass.

---

## 5. Acceptance Criteria
- [x] 7 dead libraries and 10 unused Radix packages pruned from `package.json` with clean lockfile; `@radix-ui/react-accordion` retained (Phase 1).
- [x] Dev server launches with Turbopack (`npm run dev`) with Serwist active only in production builds (Phase 1).
- [ ] Mapbox CSS is isolated to `MapView.tsx`; `GoogleMapFallback` is dynamically imported using kebab-case `./google-map-fallback`; `MapErrorBoundary` seamlessly catches WebGL crashes.
- [ ] Exactly one container carries `data-testid="map-view-canvas"` with dynamic `data-state="loading|ready|error"`.
- [ ] Root `app/layout.tsx` retains `<ModalHost />` but mounts zero modal dialogs on public landing or auth routes.
- [ ] `AuthenticatedModalHost` dynamically mounts all modal dialogs (including `WineryModal` and `VisitHistoryModal`) across authenticated routes, dismissing modals and restoring pointer events on route changes.
- [ ] `app/friends/[id]/page.tsx`, `app/forgot-password/page.tsx`, and `app/manual-confirm/page.tsx` are Server Components exporting `Metadata`.
- [ ] `proxy.ts` permits unauthenticated access to `/manual-confirm` and forwards updated cookies to Server Components via `NextResponse.next({ request })`.
- [ ] `app/error.tsx` catches server-side render exceptions while preserving App Shell navigation.
- [ ] Zero hydration mismatch warnings occur across all core pages; zero date shifts occur in visit logging.
- [ ] Zero `setState` calls occur during render cycles; outer drawer shells remain stable during winery transitions; zero `react-hooks/set-state-in-effect` lint suppressions exist across the entire repo.
- [ ] Auth forms use React 19 Server Actions returning typed, serializable `ActionState` with `useActionState`; `trip-form.tsx` uses Controlled Hybrid `useActionState` supporting offline winery selection and atomic trip ID reconciliation.
- [ ] Service worker never caches `/auth/v1/` routes; CacheStorage (`supabase-auth`, `pages`) is purged on logout even when offline; offline users retain identity via local session fallback.
- [ ] Production build (`npm run build`) completes cleanly with reduced JavaScript chunk sizes.
- [ ] Containerized Playwright E2E tests pass cleanly across `auth-recovery.spec.ts`, `pwa-offline.spec.ts`, and `trip-flow.spec.ts`.

---

## 6. Out of Scope
- Visual redesign of winery modals or bottom drawers (covered in separate UI tracks).
- Database migrations or Supabase DDL changes (purely frontend architecture and tooling).
- Test infrastructure restructuring or Playwright runner container refactoring (reserved for Sprint 4 QA).
