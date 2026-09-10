# Implementation Plan: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization

Pruning dead dependencies and bundle bloat, unblocking Turbopack development with production-only Serwist, isolating map engines and CSS, decoupling modal trees from root layout via an Authenticated Modal Host, establishing robust Server Component boundaries with static metadata, achieving strict React 19 compiler adherence with useActionState, and hardening Service Worker auth caching.

## Phase 1: Dependency Pruning, Tooling Optimization & Turbopack Unblocking
Focus: Audit and prune unused dependencies (@dnd-kit, recharts, unreferenced Radix primitives), clean brittle package.json overrides, make Serwist production-only in next.config.mjs, and enable Turbopack dev.

- [ ] Task: Write failing verification tests for dependency references, package overrides, and Serwist config gating
    - [ ] Add Jest tests in `lib/__tests__/tooling/dependencies.test.ts` verifying no files in `app/`, `components/`, or `lib/` import `@dnd-kit/*`, `recharts`, or unreferenced Radix primitives (`aspect-ratio`, `collapsible`, `context-menu`, `hover-card`, `menubar`, `navigation-menu`, `progress`, `radio-group`, `scroll-area`, `slider`, `input-otp`, `react-resizable-panels`, `sonner`)
    - [ ] Add tests asserting `next.config.mjs` does not attach Serwist Webpack plugin when `process.env.NODE_ENV !== 'production'`
    - [ ] Add tests asserting `package.json#overrides` is cleaned of redundant major-version overrides
- [ ] Task: Prune dead dependencies and clean overrides in `package.json`
    - [ ] Uninstall `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `recharts`, `react-resizable-panels`, `input-otp`, `sonner`, and unreferenced `@radix-ui` primitive packages
    - [ ] Prune unnecessary overrides in `package.json#overrides`
    - [ ] Run clean `npm install` and verify package integrity and typecheck
- [ ] Task: Refactor `next.config.mjs` and dev scripts for Turbopack with production-only Serwist
    - [ ] Wrap Serwist plugin activation in `next.config.mjs` so it only attaches when `process.env.NODE_ENV === 'production'`; in development, export plain `nextConfig`
    - [ ] Update `package.json` dev script to `"dev": "next dev --turbo"` (keeping `"build": "next build --webpack"`)
    - [ ] Verify local dev startup boots with Turbopack without Serwist Webpack hook errors
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Dependency Pruning, Tooling Optimization & Turbopack Unblocking' (Protocol in workflow.md)

## Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading
Focus: Isolate Mapbox GL CSS to map boundaries and dynamically load Google Maps fallback components via next/dynamic.

- [ ] Task: Write failing tests for Mapbox CSS isolation and Google Maps fallback dynamic loading
    - [ ] Add test asserting `app/layout.tsx` does not import `mapbox-gl/dist/mapbox-gl.css`
    - [ ] Add test verifying `components/map/MapView.tsx` loads `GoogleMapFallback` via `next/dynamic` and does not evaluate `@googlemaps/js-api-loader` on Mapbox-supported clients
- [ ] Task: Isolate Mapbox CSS and dynamically load fallback Google Maps components
    - [ ] Move `import 'mapbox-gl/dist/mapbox-gl.css'` from `app/layout.tsx` into `components/map/MapView.tsx` (and `components/WineryMap.tsx`)
    - [ ] Refactor `components/map/MapView.tsx` to load `GoogleMapFallback` via `next/dynamic({ ssr: false })` with loading placeholder maintaining DOM stability (`data-testid="map-view-canvas" data-state="loading"`)
- [ ] Task: Verify Mapbox rendering and fallback behavior across unit test suite
    - [ ] Verify `components/map/__tests__/MapView.test.tsx`, `components/map/__tests__/google-map-fallback.test.tsx`, and map hooks pass cleanly
    - [ ] Run `npm run type-check` to verify zero type regressions in map components
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading' (Protocol in workflow.md)

## Phase 3: Server Component Boundaries, SSR Date Determinism & Modal Host Modularization
Focus: Extract heavy modals from `app/layout.tsx` into a dedicated `AuthenticatedModalHost` loaded via next/dynamic, refactor `/friends/[id]` and `/forgot-password` to Server Components with static metadata, and enforce deterministic SSR dates.

- [ ] Task: Write failing tests for root layout isolation, AuthenticatedModalHost mounting, Server Component auth guards, and SSR dates
    - [ ] Add test asserting `app/layout.tsx` contains no direct imports or DOM nodes for `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, or `GlobalModalRenderer`
    - [ ] Add test asserting `AuthenticatedModalHost` lazily loads modal trees via `next/dynamic({ ssr: false })`
    - [ ] Add test asserting `app/friends/[id]/page.tsx` is an async Server Component redirecting unauthenticated users to `/login` and exporting route `Metadata`
    - [ ] Add test asserting `app/forgot-password/page.tsx` is a Server Component exporting route `Metadata`
    - [ ] Add test asserting deterministic date formatting across SSR components using `formatDateLocal()`
- [ ] Task: Create `AuthenticatedModalHost` and decouple modals from `app/layout.tsx` (Expand-and-Contract)
    - [ ] (Expand) Create `components/modals/authenticated-modal-host.tsx` dynamically importing `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, and `GlobalModalRenderer` with `ssr: false`
    - [ ] (Migrate) Mount `AuthenticatedModalHost` inside `components/app-shell.tsx` and standalone authenticated views (`app/settings/page.tsx`, `app/friends/[id]/page.tsx`)
    - [ ] (Contract) Remove direct modal imports and JSX elements from root `app/layout.tsx`, ensuring public routes (`/login`, `/signup`, `/forgot-password`, `/privacy`, `/terms`) mount without modal trees
- [ ] Task: Refactor `/friends/[id]` and `/forgot-password` to Server Components and enforce deterministic SSR dates
    - [ ] Refactor `app/friends/[id]/page.tsx` into an async Server Component with server auth check via `getUser()`, dynamic `Metadata` export, and extracted client component `components/friends/friend-detail-view.tsx`
    - [ ] Split `app/forgot-password/page.tsx` into a Server Component exporting static `Metadata` and a client component `components/forgot-password-form.tsx`
    - [ ] Standardize SSR dates across `app/` and `components/` using `formatDateLocal()` and static fallbacks to prevent hydration mismatch
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Server Component Boundaries, SSR Date Determinism & Modal Host Modularization' (Protocol in workflow.md)

## Phase 4: React 19 Adherence: State Derivation & Form Actions
Focus: Eliminate render-time `setState` calls and lint suppressions in `use-winery-modal-state.ts` and `WineryQnA.tsx` via component keying; modernize `login-form.tsx`, `forgot-password-form.tsx`, and `trip-form.tsx` using React 19 `useActionState`.

- [ ] Task: Write failing tests for React Compiler state derivation and useActionState form actions
    - [ ] Add tests for `use-winery-modal-state.ts` asserting state reset behavior without render-time `setState`
    - [ ] Add tests for `WineryQnA.tsx` asserting active question transitions reset review index and expansion without `useEffect` state synchronization
    - [ ] Add tests for `login-form.tsx`, `forgot-password-form.tsx`, and `trip-form.tsx` verifying pending state transitions and form submission via React 19 `useActionState`
- [ ] Task: Resolve render-time setState violations and remove ESLint suppressions in `use-winery-modal-state.ts` and `WineryQnA.tsx`
    - [ ] In `components/winery/use-winery-modal-state.ts`, eliminate render-time `setPrevActiveWineryId`, `setSnapPoint`, and `setLightboxPhoto`; derive state during render and leverage component keying (`key={activeWineryId}`) at the caller level
    - [ ] In `components/WineryQnA.tsx`, eliminate `useEffect` state resetting by extracting the review content to a child component keyed by `activeQuestionId`
    - [ ] Remove all `eslint-disable-next-line react-hooks/set-state-in-effect` comments and verify zero React Compiler warnings
- [ ] Task: Migrate `login-form.tsx`, `forgot-password-form.tsx`, and `trip-form.tsx` to React 19 `useActionState`
    - [ ] Modernize `components/login-form.tsx` using `useActionState` with pending indicator (`isPending`)
    - [ ] Modernize `components/forgot-password-form.tsx` using `useActionState`
    - [ ] Modernize `components/trip-form.tsx` submission with `useActionState` while preserving `react-hook-form` / Zod validation and store mutations
- [ ] Task: Conductor - User Manual Verification 'Phase 4: React 19 Adherence: State Derivation & Form Actions' (Protocol in workflow.md)

## Phase 5: Service Worker Auth Hygiene, CacheStorage Eviction & Quality Verification
Focus: Restrict `/auth/v1/` routes in `app/sw.ts` strictly to NetworkOnly, bridge `userStore.logout()` to purge CacheStorage, and execute full production quality audit.

- [ ] Task: Write failing tests for Service Worker auth caching rules and logout CacheStorage eviction
    - [ ] Add tests in `lib/utils/__tests__/sw-utils.test.ts` verifying `/auth/v1/` routes are excluded from `StaleWhileRevalidate` and matched by `NetworkOnly`
    - [ ] Add tests verifying `userStore.logout()` invokes CacheStorage purge of auth and page caches
- [ ] Task: Harden `app/sw.ts` with NetworkOnly auth caching and sign-out CacheStorage purge bridge
    - [ ] In `app/sw.ts`, remove `StaleWhileRevalidate` matcher for `/auth/v1/user` and `/auth/v1/session`; ensure all `/auth/v1/*` requests are strictly handled by `NetworkOnly`
    - [ ] Add message listener in `app/sw.ts` for `{ type: 'PURGE_AUTH_CACHE' }`
    - [ ] Update `lib/stores/userStore.ts#logout` to purge `window.caches` (deleting `supabase-auth` and `pages`) and dispatch `PURGE_AUTH_CACHE` to `navigator.serviceWorker.controller`
- [ ] Task: Execute full build and quality audit (lint, type-check, build)
    - [ ] Run `npm run lint` and verify zero ESLint errors or warnings
    - [ ] Run `npm run type-check` and verify zero TypeScript errors
    - [ ] Run `npm run build` and verify clean production Webpack compilation with reduced chunk sizes
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Service Worker Auth Hygiene, CacheStorage Eviction & Quality Verification' (Protocol in workflow.md)
