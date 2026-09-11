# Implementation Plan: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization

Pruning dead dependencies and bundle bloat, unblocking Turbopack development with production-only Serwist, isolating map engines and CSS, decoupling modal trees from root layout via an Authenticated Modal Host, establishing robust Server Component boundaries with static metadata, achieving strict React 19 compiler adherence with useActionState, and hardening Service Worker auth caching.

## Phase 1: Dependency Pruning, Tooling Optimization & Turbopack Unblocking [checkpoint: 1cbfaa1]
Focus: Audit and prune 7 dead dependencies and 10 unreferenced Radix primitives (retaining `@radix-ui/react-accordion`), clean brittle `package.json` overrides, make Serwist production-only in `next.config.mjs`, and enable Turbopack dev.

- [x] Task: Write failing verification tests for dependency references, package overrides, and Serwist config gating [6d7eb7e]
    - [x] Add Jest tests in `lib/__tests__/tooling/dependencies.test.ts` asserting zero imports in `app/`, `components/`, or `lib/` for `@dnd-kit/*`, `recharts`, `react-resizable-panels`, `input-otp`, `sonner`, and the 10 unreferenced Radix packages (`aspect-ratio`, `collapsible`, `context-menu`, `hover-card`, `menubar`, `navigation-menu`, `progress`, `radio-group`, `scroll-area`, `slider`)
    - [x] Add tests asserting `package.json#overrides` is cleaned of brittle `minimatch`, `glob`, `brace-expansion`, and `uuid` overrides while retaining `postcss`, `ws`, and `sharp`
    - [x] Add tests asserting `next.config.mjs` exports plain `nextConfig` when `process.env.NODE_ENV !== 'production'`
- [x] Task: Prune dead dependencies and clean overrides in `package.json` [93b084e]
    - [x] Uninstall 7 dead libraries (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `recharts`, `react-resizable-panels`, `input-otp`, `sonner`) and 10 unreferenced Radix packages, verifying `@radix-ui/react-accordion` is retained
    - [x] Remove `minimatch`, `glob`, `brace-expansion`, and `uuid` overrides in `package.json#overrides`
    - [x] Run clean `npm install` and verify package integrity, lockfile, and clean typecheck
- [x] Task: Refactor `next.config.mjs` and dev scripts for Turbopack with production-only Serwist [222408e]
    - [x] Wrap Serwist plugin activation in `next.config.mjs` so it only attaches when `process.env.NODE_ENV === 'production'`; in development, export plain `nextConfig`
    - [x] Update `package.json` dev script to `"dev": "next dev --turbo"` (keeping `"build": "next build --webpack"`)
    - [x] Verify local dev startup boots with Turbopack without Serwist Webpack hook errors
- [x] Task: Conductor - User Manual Verification 'Phase 1: Dependency Pruning, Tooling Optimization & Turbopack Unblocking' (Protocol in workflow.md) 1cbfaa1

## Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading
Focus: Isolate Mapbox GL CSS to map boundaries, harden Mapbox against runtime WebGL crashes with automatic Google Maps fallback, standardize coordinates, and dynamically load fallback components via next/dynamic with strict DOM stability.

- [x] Task: Write failing tests for Mapbox CSS isolation, Google Maps fallback dynamic loading, and runtime error recovery [c1d27eb]
    - [x] Add test asserting `app/layout.tsx` does not import `mapbox-gl/dist/mapbox-gl.css`
    - [x] Add test verifying `components/map/MapView.tsx` loads `GoogleMapFallback` via `next/dynamic` and does not evaluate `@googlemaps/js-api-loader` on Mapbox-supported clients
    - [x] Add test verifying `MapView.tsx` transitions gracefully to `GoogleMapFallback` when Mapbox emits a WebGL context creation failure or runtime error
    - [x] Add test verifying coordinate filtering excludes `NaN` / non-finite coordinates from GeoJSON generation
- [x] Task: Isolate Mapbox CSS, harden WebGL error boundary, and dynamically load Google Maps fallback [d08ebfe]
    - [x] Move `import 'mapbox-gl/dist/mapbox-gl.css'` from `app/layout.tsx` into `components/map/MapView.tsx`
    - [x] Refactor `components/map/MapView.tsx` to load `GoogleMapFallback` via `next/dynamic({ ssr: false })` using exact filesystem casing (`./google-map-fallback`)
    - [x] Add `onError` listener and `MapErrorBoundary` in `components/map/MapView.tsx` to automatically trigger `GoogleMapFallback` on WebGL failure or style error
    - [x] Maintain strict DOM stability on single root element (`data-testid="map-view-canvas" data-state="loading|ready|error"`) without nested duplicate test IDs
    - [x] Purge DOM container and event listeners on effect cleanup in `components/map/google-map-fallback.tsx` to eliminate React 19 StrictMode context leaks
    - [x] Sanitize coordinates in `MapView.tsx:wineriesGeoJSON` to prevent Mapbox parser crashes on `NaN`
    - [x] Enforce Tailwind sizing constraints on `MapView.tsx` wrapper and trigger `map.resize()` on load
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
