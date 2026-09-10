# Implementation Plan: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization

Pruning dead dependencies and bundle bloat, unblocking Turbopack development with production-only Serwist, isolating map engines and CSS, decoupling modal trees from root layout via an Authenticated Modal Host, establishing robust Server Component boundaries with static metadata, achieving strict React 19 compiler adherence with useActionState, and hardening Service Worker auth caching.

## Phase 1: Dependency Pruning, Tooling Optimization & Turbopack Unblocking
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
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Dependency Pruning, Tooling Optimization & Turbopack Unblocking' (Protocol in workflow.md)

## Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading
Focus: Isolate Mapbox GL CSS to map boundaries and dynamically load Google Maps fallback components via next/dynamic with DOM stability.

- [ ] Task: Write failing tests for Mapbox CSS isolation and Google Maps fallback dynamic loading
    - [ ] Add test asserting `app/layout.tsx` does not import `mapbox-gl/dist/mapbox-gl.css`
    - [ ] Add test verifying `components/map/MapView.tsx` loads `GoogleMapFallback` via `next/dynamic` and does not evaluate `@googlemaps/js-api-loader` on Mapbox-supported clients
- [ ] Task: Isolate Mapbox CSS and dynamically load fallback Google Maps components
    - [ ] Move `import 'mapbox-gl/dist/mapbox-gl.css'` from `app/layout.tsx` into `components/map/MapView.tsx`
    - [ ] Refactor `components/map/MapView.tsx` to load `GoogleMapFallback` via `next/dynamic({ ssr: false })` with loading placeholder maintaining DOM stability (`data-testid="map-view-canvas" data-state="loading"`)
- [ ] Task: Verify Mapbox rendering and fallback behavior across unit test suite
    - [ ] Update `components/map/__tests__/MapView.test.tsx` for dynamic import compatibility and verify tests pass cleanly
    - [ ] Run `npm run type-check` to verify zero type regressions in map components
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading' (Protocol in workflow.md)

## Phase 3: Root Layout Decoupling & Authenticated Modal Host
Focus: Extract heavy modal trees from root `app/layout.tsx` into an `AuthenticatedModalHost` loaded lazily via next/dynamic, while preserving `<ModalHost />` (`#modal-root`) in layout.

- [ ] Task: Write failing tests for root layout modal isolation and AuthenticatedModalHost mounting
    - [ ] Add test asserting `app/layout.tsx` retains `<ModalHost />` (`#modal-root`) but contains no direct imports or JSX nodes for `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, or `GlobalModalRenderer`
    - [ ] Add test asserting `AuthenticatedModalHost` lazily loads modal trees via `next/dynamic({ ssr: false })`
    - [ ] Add test asserting `components/app-shell.tsx` and `app/trips/[id]/page.tsx` mount `AuthenticatedModalHost`
- [ ] Task: Create `AuthenticatedModalHost` (Expand)
    - [ ] Create `components/modals/authenticated-modal-host.tsx` dynamically importing `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, and `GlobalModalRenderer` with `{ ssr: false }`
    - [ ] Verify `AuthenticatedModalHost` renders correctly in isolation without breaking existing layout trees
- [ ] Task: Mount modal host in callers and decouple `app/layout.tsx` (Migrate & Contract)
    - [ ] Mount `AuthenticatedModalHost` inside `components/app-shell.tsx`, `app/trips/[id]/page.tsx`, `app/friends/[id]/page.tsx`, and `app/settings/page.tsx`
    - [ ] Remove modal component imports and JSX elements from root `app/layout.tsx`, ensuring public routes (`/login`, `/signup`, `/forgot-password`, `/manual-confirm`, `/privacy`, `/terms`) mount zero modal code
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Root Layout Decoupling & Authenticated Modal Host' (Protocol in workflow.md)

## Phase 4: Server Component Boundaries, Route Metadata & Deterministic Dates
Focus: Convert `/friends/[id]`, `/forgot-password`, and `/manual-confirm` into Server Components exporting static metadata, whitelist `/manual-confirm` in `proxy.ts`, and eliminate non-deterministic SSR dates.

- [ ] Task: Write failing tests for Server Component auth guards, route metadata, proxy whitelisting, and SSR date determinism
    - [ ] Add test asserting `app/friends/[id]/page.tsx` is an async Server Component redirecting unauthenticated users to `/login` and exporting route `Metadata`
    - [ ] Add tests asserting `app/forgot-password/page.tsx` and `app/manual-confirm/page.tsx` are Server Components exporting static `Metadata`
    - [ ] Add test asserting `proxy.ts` allows unauthenticated access to `/manual-confirm`
    - [ ] Add tests asserting `app/privacy/page.tsx` and `app/terms/page.tsx` render static dates with zero hydration mismatches
- [ ] Task: Convert `app/friends/[id]/page.tsx` to Server Component with auth guard and metadata
    - [ ] Refactor `app/friends/[id]/page.tsx` into an async Server Component with server auth check via `getUser()`, server-side redirect to `/login`, and `Metadata` export
    - [ ] Pass resolved `id` to client component `components/FriendProfile.tsx`
- [ ] Task: Modularize `forgot-password`, `manual-confirm`, update `proxy.ts`, and enforce deterministic SSR dates
    - [ ] Split `app/forgot-password/page.tsx` into a Server Component exporting static `Metadata` and a client component `components/forgot-password-form.tsx`
    - [ ] Split `app/manual-confirm/page.tsx` into a Server Component exporting static `Metadata` and a client component `components/manual-confirm-form.tsx`
    - [ ] Add `'/manual-confirm'` to `publicRoutes` in `proxy.ts`
    - [ ] Replace dynamic `new Date().toLocaleDateString()` in `app/privacy/page.tsx` and `app/terms/page.tsx` with static `LAST_UPDATED` constant
    - [ ] Replace `new Date().toISOString().split("T")[0]` in `components/VisitForm.tsx` with `getTodayLocal()`
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Server Component Boundaries, Route Metadata & Deterministic Dates' (Protocol in workflow.md)

## Phase 5: React 19 Adherence: State Derivation & Compiler Compliance
Focus: Eliminate render-time `setState` calls in `use-winery-modal-state.ts` via keyed component reset, extract keyed review display in `WineryQnA.tsx`, and remove all 3 `react-hooks/set-state-in-effect` suppressions.

- [ ] Task: Write failing tests for React Compiler state derivation, keyed resets, and effect suppression removal
    - [ ] Add tests for `use-winery-modal-state.ts` asserting state reset behavior without render-time `setState`
    - [ ] Add tests for `WineryQnA.tsx` asserting active question transitions reset review state without `useEffect` state synchronization
    - [ ] Add test asserting zero `react-hooks/set-state-in-effect` suppressions exist across the entire repository
- [ ] Task: Eliminate render-time `setState` in `use-winery-modal-state.ts` and key `WineryModal.tsx`
    - [ ] In `components/winery/use-winery-modal-state.ts`, eliminate `prevActiveWineryId`, `setPrevActiveWineryId`, `setSnapPoint`, and `setLightboxPhoto` from the render body
    - [ ] In `components/winery-modal.tsx`, extract inner content to `<WineryModalContent key={activeWineryId} activeWineryId={activeWineryId} />` to reset drawer state naturally via React reconciliation
- [ ] Task: Key review content in `WineryQnA.tsx` and eliminate all effect suppressions
    - [ ] In `components/WineryQnA.tsx`, extract review display into `<WineryQuestionReviewCard key={activeQuestionId} />` and remove `useEffect` state reset
    - [ ] In `hooks/use-trip-actions.ts`, derive `currentMembers` directly and remove unused `selectedFriends` state and effect
    - [ ] In `components/trip-planner.tsx`, replace local `isMounted` effect with shared `useMounted()` hook
    - [ ] Remove all 3 `eslint-disable-next-line react-hooks/set-state-in-effect` comments
- [ ] Task: Conductor - User Manual Verification 'Phase 5: React 19 Adherence: State Derivation & Compiler Compliance' (Protocol in workflow.md)

## Phase 6: React 19 Form Actions Modernization
Focus: Standardize authentication forms on React 19 Server Actions with `useActionState` and modernize `trip-form.tsx` submission with Hybrid Client Action State.

- [ ] Task: Write failing tests for form submissions using React 19 `useActionState`
    - [ ] Add tests for `components/login-form.tsx` verifying pending state transitions and form submission via `useActionState`
    - [ ] Add tests for `components/forgot-password-form.tsx` and `components/manual-confirm-form.tsx` verifying submission via `useActionState`
    - [ ] Add tests for `components/trip-form.tsx` verifying form submission via `useActionState` while preserving `react-hook-form` / Zod validation and store persistence
- [ ] Task: Modernize authentication forms with React 19 Server Actions and `useActionState`
    - [ ] Create `app/actions/auth.ts` with Server Actions (`loginAction`, `forgotPasswordAction`, `manualConfirmAction`)
    - [ ] Refactor `components/login-form.tsx` to use React 19 `useActionState` with native `isPending` indicator
    - [ ] Refactor `components/forgot-password-form.tsx` and `components/manual-confirm-form.tsx` to use `useActionState`
- [ ] Task: Modernize `trip-form.tsx` submission with Hybrid Client `useActionState`
    - [ ] Integrate `useActionState` into `components/trip-form.tsx` for form action dispatch while maintaining `react-hook-form` schema validation and `tripStore` / `wineryStore` DB hydration and offline IndexedDB sync
- [ ] Task: Conductor - User Manual Verification 'Phase 6: React 19 Form Actions Modernization' (Protocol in workflow.md)

## Phase 7: Service Worker Auth Hygiene & Production Quality Audit
Focus: Restrict `/auth/v1/*` routes in `app/sw.ts` strictly to NetworkOnly, bridge `userStore.logout()` to purge CacheStorage with offline resilience, and execute full production quality audit.

- [ ] Task: Write failing tests for Service Worker auth caching rules, offline-safe logout eviction, and build audit
    - [ ] Add tests in `lib/utils/__tests__/sw-utils.test.ts` verifying `/auth/v1/` routes match `NetworkOnly` and are excluded from `StaleWhileRevalidate`
    - [ ] Add tests in `lib/stores/__tests__/userStore.test.ts` verifying `userStore.logout()` purges `supabase-auth` and `pages` from `window.caches`, posts `PURGE_AUTH_CACHE` to Service Worker, and completes store reset even when offline
- [ ] Task: Harden `app/sw.ts` with NetworkOnly auth caching and bridge `userStore.ts#logout`
    - [ ] In `app/sw.ts`, remove `StaleWhileRevalidate` matcher for `/auth/v1/user` and `/auth/v1/session`; route all `/auth/v1/*` requests strictly to `NetworkOnly`
    - [ ] In `app/sw.ts`, add message listener for `{ type: 'PURGE_AUTH_CACHE' }` to delete `supabase-auth` and `pages` caches
    - [ ] In `lib/stores/userStore.ts#logout`, wrap `supabase.auth.signOut()` in defensive `try/catch`, purge `window.caches`, and dispatch `PURGE_AUTH_CACHE` to `navigator.serviceWorker.controller`
- [ ] Task: Execute full quality audit (lint, type-check, build)
    - [ ] Run `npm run lint` and verify zero ESLint errors, warnings, or suppressions
    - [ ] Run `npm run type-check` and verify zero TypeScript errors
    - [ ] Run `npm run build` and verify clean production Webpack compilation with reduced JavaScript chunk sizes
- [ ] Task: Conductor - User Manual Verification 'Phase 7: Service Worker Auth Hygiene & Production Quality Audit' (Protocol in workflow.md)
