# Implementation Plan: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization

Pruning dead dependencies and bundle bloat, unblocking Turbopack development with production-only Serwist, decoupling modal trees from root layout, establishing robust Server Component boundaries with static metadata, and achieving strict React 19 compiler adherence.

## Phase 1: Dependency Pruning, Bundle Optimization & Turbopack Unblocking
Focus: Audit and remove unused dependencies (`@dnd-kit`, `recharts`, unused Radix packages), clean `package.json` overrides, isolate Mapbox CSS, lazy-load Google Maps fallback, and configure production-only Serwist to unblock Turbopack dev.

- [ ] Task: Write failing verification tests for dependency references, dynamic map loader boundaries, and next config
    - [ ] Add tests verifying no residual imports of pruned packages (`@dnd-kit`, `recharts`, unused Radix packages) remain in the codebase
    - [ ] Add tests verifying fallback map loader isolation and conditional import execution
    - [ ] Add tests asserting Serwist configuration behaves correctly based on `NODE_ENV`
- [ ] Task: Prune dead dependencies and clean overrides in `package.json`
    - [ ] Remove `@dnd-kit/core`, `@dnd-kit/sortable`, `recharts`, and unused `@radix-ui/react-*` primitive packages
    - [ ] Clean unnecessary major-version overrides in `package.json#overrides`
    - [ ] Run clean `npm install` and verify package integrity
- [ ] Task: Refactor `next.config.mjs` and dev scripts for Turbopack with production-only Serwist
    - [ ] Wrap Serwist plugin activation to run strictly when `process.env.NODE_ENV === 'production'`
    - [ ] Update `npm run dev` and scripts to run Turbopack (`next dev --turbo`)
    - [ ] Verify local dev server startup without Webpack lock-in
- [ ] Task: Isolate Mapbox CSS and dynamically load fallback Google Maps components
    - [ ] Scope Mapbox GL CSS imports to map-specific container components
    - [ ] Lazy-load Google Maps API loader via `next/dynamic` only when Mapbox is unavailable or explicitly requested
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Dependency Pruning, Bundle Optimization & Turbopack Unblocking' (Protocol in workflow.md)

## Phase 2: Server Component Boundaries & App Layout Modularization
Focus: Move heavy modals out of root `app/layout.tsx` into an authenticated App Shell with `next/dynamic`, refactor `/friends/[id]` and `/forgot-password` to async Server Components with metadata, and enforce deterministic SSR dates.

- [ ] Task: Write failing tests for root layout isolation, server component auth guards, and deterministic date rendering
    - [ ] Add tests verifying unauthenticated routes do not mount heavy modal dialog DOM nodes
    - [ ] Add tests verifying server-side auth redirect on `/friends/[id]`
    - [ ] Add tests verifying deterministic date formatting output for SSR components
- [ ] Task: Extract modals from `app/layout.tsx` into an authenticated App Shell loaded via `next/dynamic`
    - [ ] Remove `VisitFormModal`, `WineryNoteModal`, and `TripShareDialogWrapper` from root `app/layout.tsx`
    - [ ] Create an authenticated App Shell component dynamically mounting modal trees with `next/dynamic({ ssr: false })`
    - [ ] Verify public routes (`/login`, `/signup`, `/privacy`) bundle and mount without modal trees
- [ ] Task: Refactor `app/friends/[id]/page.tsx` and `app/forgot-password/page.tsx` into Server Components with static metadata
    - [ ] Convert `app/friends/[id]/page.tsx` into an async Server Component with server auth check and route `Metadata` export
    - [ ] Extract interactive friend detail UI into `components/friends/friend-detail-view.tsx`
    - [ ] Split `app/forgot-password/page.tsx` into Server Component exporting `Metadata` and Client Component `components/forgot-password-form.tsx`
- [ ] Task: Audit and standardize SSR dates using `formatDateLocal()` and static constants
    - [ ] Audit server and client rendered date stamps across `app/` and `components/`
    - [ ] Enforce `formatDateLocal()` and static fallbacks to eliminate hydration mismatches
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Server Component Boundaries & App Layout Modularization' (Protocol in workflow.md)

## Phase 3: React 19 Adherence & Service Worker Hygiene
Focus: Eliminate render-time `setState` calls and lint suppressions in `use-winery-modal-state.ts` and `WineryQnA.tsx`, migrate forms to React 19 `useActionState`, and enforce network-only Supabase Auth caching and cache purge in `app/sw.ts`.

- [ ] Task: Write failing tests for React 19 form actions, modal state derivation, and service worker auth eviction
    - [ ] Add tests covering React 19 form action state transitions and error handling
    - [ ] Add tests verifying `use-winery-modal-state` derives state without render-time `setState`
    - [ ] Add tests for service worker cache strategy rules on `/auth/v1/` and logout eviction
- [ ] Task: Resolve render-time `setState` violations and remove ESLint suppressions in `use-winery-modal-state.ts` and `WineryQnA.tsx`
    - [ ] Refactor `components/winery/use-winery-modal-state.ts` to derive state during render and use component `key` resets
    - [ ] Refactor `components/WineryQnA.tsx` to eliminate render-time state modifications
    - [ ] Remove `eslint-disable-next-line react-hooks/set-state-in-effect` suppressions and verify zero compiler warnings
- [ ] Task: Migrate auth forms (`login-form.tsx`, `forgot-password-form.tsx`) and `trip-form.tsx` to React 19 `useActionState`
    - [ ] Modernize `components/login-form.tsx` and `components/forgot-password-form.tsx` with React 19 Server Actions and `useActionState`
    - [ ] Modernize `components/trip-form.tsx` using `useActionState` with pending status indicators
- [ ] Task: Harden `app/sw.ts` with network-only `/auth/v1/` caching and sign-out CacheStorage purge
    - [ ] Update `app/sw.ts` runtime caching to ensure Supabase Auth endpoints are strictly `NetworkOnly`
    - [ ] Add cache purge on user logout to prevent stale session persistence
- [ ] Task: Run full build and lint checks (`npm run lint && npm run type-check && npm run build`)
    - [ ] Verify zero TypeScript errors and zero lint warnings
    - [ ] Verify production build completes cleanly with reduced bundle sizes
- [ ] Task: Conductor - User Manual Verification 'Phase 3: React 19 Adherence & Service Worker Hygiene' (Protocol in workflow.md)
