# Specification: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization

## 1. Overview & Objectives
This track executes the **Frontend Modernization** initiative for Milestone [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1), addressing parent epic [#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39) and detailed issue specifications in [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36), building directly on [04-frontend-modernization-architecture.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/proposals/04-frontend-modernization-architecture.md).

The primary objectives are organized into **7 tightly bounded, domain-separated phases** (each strictly capped at 3–4 tasks to guarantee single-session execution under 60 turns):
1. **Bundle & Tooling Pruning (Phase 1 - Tooling Domain)**: Prune 7 dead dependencies and 10 unreferenced Radix primitives (retaining `@radix-ui/react-accordion`), clean brittle `package.json` overrides (`minimatch`, `glob`, `brace-expansion`, `uuid`), and make Serwist PWA production-only in `next.config.mjs` to unblock Turbopack development (`next dev --turbo`).
2. **Map Engine Bundle Isolation & Dynamic Fallback (Phase 2 - Map Engine Domain)**: Isolate Mapbox GL CSS imports to map boundaries and dynamically load fallback Google Maps components via `next/dynamic({ ssr: false })` with DOM stability preservation (`data-testid="map-view-canvas" data-state="loading"`).
3. **Root Layout Decoupling & Authenticated Modal Host (Phase 3 - Layout Domain / Expand-and-Contract)**: Extract heavy modal trees from root `app/layout.tsx` into a lazy `AuthenticatedModalHost` mounted in `components/app-shell.tsx` and standalone authenticated views (including `app/trips/[id]/page.tsx`), while strictly preserving `<ModalHost />` (`#modal-root`) in root `app/layout.tsx` for portal stability.
4. **Server Component Boundaries, Route Metadata & Deterministic Dates (Phase 4 - App Router Domain)**: Enforce proper Server/Client boundaries across `/friends/[id]`, `/forgot-password`, and `/manual-confirm`; whitelist `/manual-confirm` in `proxy.ts`; export static route `Metadata`; and eliminate dynamic dates in SSR (`app/privacy`, `app/terms`, `components/VisitForm.tsx`).
5. **React 19 Adherence: State Derivation & Compiler Compliance (Phase 5 - React 19 Domain)**: Eliminate render-time `setState` in `use-winery-modal-state.ts` via keyed component reset (`WineryModalContent key={activeWineryId}`); extract keyed subcomponents in `WineryQnA.tsx`; derive state in `use-trip-actions.ts`; adopt `useMounted()` in `trip-planner.tsx`; and eliminate all 3 `react-hooks/set-state-in-effect` ESLint suppressions across the entire repository.
6. **React 19 Form Actions Modernization (Phase 6 - Forms Domain)**: Standardize authentication forms (`login-form.tsx`, `forgot-password-form.tsx`, `manual-confirm-form.tsx`) on React 19 Server Actions with `useActionState`; modernize `trip-form.tsx` submission with a Hybrid Client Action State pattern while preserving `react-hook-form` / Zod validation and offline Zustand store sync.
7. **Service Worker Auth Hygiene & Production Quality Audit (Phase 7 - PWA & QA Domain)**: Enforce `NetworkOnly` caching for Supabase Auth (`/auth/v1/*`) in `app/sw.ts`; bridge `userStore.logout()` to purge `supabase-auth` and `pages` from `window.caches` with offline-resilient error shielding and `PURGE_AUTH_CACHE` SW messaging; and execute a complete production quality audit (`lint`, `type-check`, `build`).

---

## 2. Scope & Technical Findings Addressed

- **FE-01 & FE-02 (Dependency Pruning - Phase 1)**:
  - Prune 7 dead libraries: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `recharts`, `react-resizable-panels`, `input-otp`, and `sonner`.
  - Prune 10 unreferenced Radix primitives: `aspect-ratio`, `collapsible`, `context-menu`, `hover-card`, `menubar`, `navigation-menu`, `progress`, `radio-group`, `scroll-area`, and `slider`.
  - **Critical Retention**: Explicitly retain `@radix-ui/react-accordion` (actively imported in `components/winery/winery-amenities-list.tsx:17` and `components/WineryDetails.tsx:5`).
- **FE-03 (Map Engine Isolation - Phase 2)**:
  - Move `import 'mapbox-gl/dist/mapbox-gl.css'` from `app/layout.tsx` into `components/map/MapView.tsx`.
  - Dynamically load `GoogleMapFallback` via `next/dynamic({ ssr: false })` in `MapView.tsx` so `@googlemaps/js-api-loader` is only evaluated when Mapbox initialization fails, preserving DOM stability (`data-state="loading"`).
- **FE-04 (Service Worker Auth Hygiene - Phase 7)**:
  - Remove `StaleWhileRevalidate` matcher in `app/sw.ts` for `/auth/v1/user` and `/auth/v1/session`.
  - Configure explicit `NetworkOnly` runtime caching strategy for all Supabase Auth requests matching `/auth/v1/*`.
  - Implement `PURGE_AUTH_CACHE` listener in `app/sw.ts` to evict `supabase-auth` and `pages` caches upon user logout.
  - Bridge `userStore.ts#logout` to purge `window.caches` with defensive `try/catch` wrapping around `supabase.auth.signOut()` to ensure offline logouts reset stores cleanly.
- **FE-06 (Turbopack Unblocking - Phase 1)**:
  - Refactor `next.config.mjs` so Serwist activates exclusively when `process.env.NODE_ENV === 'production'`, exporting plain `nextConfig` during development.
  - Update `package.json` dev script to `"dev": "next dev --turbo"`, keeping `"build": "next build --webpack"`.
- **FE-07 (Server Component Auth Guard - Phase 4)**:
  - Convert `app/friends/[id]/page.tsx` to an async Server Component with server-side `getUser()` check, redirect to `/login`, and `Metadata` export, delegating interactive UI to `components/FriendProfile.tsx`.
- **FE-08 (React 19 Actions - Phase 6)**:
  - Standardize authentication forms (`login-form.tsx`, `forgot-password-form.tsx`, `manual-confirm-form.tsx`) on React 19 Server Actions (`app/actions/auth.ts`) using `useActionState`.
  - Modernize `trip-form.tsx` submission with `useActionState` while preserving `react-hook-form` / Zod validation and Zustand store mutations.
- **FE-09 (React Compiler Violations & Suppressions - Phase 5)**:
  - In `components/winery/use-winery-modal-state.ts`, eliminate render-time `setState` calls (`prevActiveWineryId`, `snapPoint`, `lightboxPhoto`).
  - In `components/winery-modal.tsx`, key inner content (`<WineryModalContent key={activeWineryId} />`) to reset drawer state via native React reconciliation.
  - In `components/WineryQnA.tsx`, key review content (`<WineryQuestionReviewCard key={activeQuestionId} />`) to eliminate `useEffect` state synchronization.
  - In `hooks/use-trip-actions.ts`, derive `currentMembers` directly and remove `selectedFriends` state and effect.
  - In `components/trip-planner.tsx`, replace local `isMounted` state with shared `useMounted()` hook.
  - Eliminate all 3 `react-hooks/set-state-in-effect` ESLint suppressions across the codebase.
- **FE-10 (Deterministic SSR Dates - Phase 4)**:
  - Replace dynamic `new Date().toLocaleDateString()` in `app/privacy/page.tsx` and `app/terms/page.tsx` with static `LAST_UPDATED` constant.
  - Replace `new Date().toISOString().split("T")[0]` in `components/VisitForm.tsx` with `getTodayLocal()`.
  - Standardize SSR component dates using `formatDateLocal()`.
- **FE-11 (Root Layout Modal Decoupling - Phase 3)**:
  - Preserve `<ModalHost />` (`#modal-root` portal container) in `app/layout.tsx`.
  - Extract `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, and `GlobalModalRenderer` into lazy `AuthenticatedModalHost` with `ssr: false`.
  - Mount `AuthenticatedModalHost` inside `components/app-shell.tsx` and `app/trips/[id]/page.tsx` (where `TripCard` triggers share and winery note modals).
- **FE-12 (Dependency Override Cleanup - Phase 1)**:
  - Prune brittle `minimatch`, `glob`, `brace-expansion`, and redundant `uuid` overrides in `package.json#overrides`.
  - Retain essential security and build overrides: `postcss: "^8.5.18"`, `ws: "^8.20.1"`, and `sharp: "^0.35.0"`.
- **FE-13 (Auth Page Architecture & Proxy Routing - Phase 4)**:
  - Split `app/forgot-password/page.tsx` into a Server Component exporting `Metadata` and a client component `components/forgot-password-form.tsx`.
  - Split `app/manual-confirm/page.tsx` into a Server Component exporting `Metadata` and a client component `components/manual-confirm-form.tsx`.
  - Add `'/manual-confirm'` to `publicRoutes` in `proxy.ts` to unblock unauthenticated email confirmation flows.

---

## 3. Functional Requirements by Phase

### Phase 1: Dependency Pruning, Tooling Optimization & Turbopack Unblocking
1. **Audit & Remove Dead Packages**:
   - Prune `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `recharts`, `react-resizable-panels`, `input-otp`, `sonner`, and the 10 unreferenced Radix packages from `package.json`.
   - Verify zero residual imports across `app/`, `components/`, and `lib/`. Retain `@radix-ui/react-accordion`.
2. **Clean Dependency Overrides**:
   - Remove `minimatch`, `glob`, `brace-expansion`, and `uuid` overrides. Verify `npm install` runs cleanly without dependency tree conflicts.
3. **Make Serwist Production-Only & Enable Turbopack**:
   - In `next.config.mjs`, conditionally export `withSerwist(nextConfig)` only when `process.env.NODE_ENV === 'production'`.
   - Update `npm run dev` to `next dev --turbo`, verifying dev startup without Serwist Webpack hook errors.

### Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading
1. **Isolate Mapbox CSS**:
   - Remove `import 'mapbox-gl/dist/mapbox-gl.css'` from `app/layout.tsx`.
   - Move Mapbox CSS import to `components/map/MapView.tsx`.
2. **Lazy-Load Google Maps Fallback**:
   - Dynamically import `GoogleMapFallback` via `next/dynamic({ ssr: false })` in `MapView.tsx`.
   - Ensure loading placeholder maintains DOM stability (`data-testid="map-view-canvas" data-state="loading"`).
   - Verify `@googlemaps/js-api-loader` is never evaluated when Mapbox initializes successfully.

### Phase 3: Root Layout Decoupling & Authenticated Modal Host
1. **Preserve Root Portal Anchor**:
   - Retain `<ModalHost />` (`#modal-root`) in root `app/layout.tsx`.
2. **Authenticated Modal Host (Expand-and-Contract)**:
   - *(Expand)* Create `components/modals/authenticated-modal-host.tsx` dynamically importing `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, and `GlobalModalRenderer` with `{ ssr: false }`.
   - *(Migrate)* Mount `AuthenticatedModalHost` inside `components/app-shell.tsx`, `app/trips/[id]/page.tsx`, `app/friends/[id]/page.tsx`, and `app/settings/page.tsx`.
   - *(Contract)* Remove direct modal component imports and JSX elements from root `app/layout.tsx`.

### Phase 4: Server Component Boundaries, Route Metadata & Deterministic Dates
1. **Server Auth Guard & Metadata for `/friends/[id]`**:
   - Convert `app/friends/[id]/page.tsx` into an async Server Component with `await getUser()`, server redirect to `/login`, and `metadata` export.
   - Delegate presentation to client `<FriendProfile friendId={id} />`.
2. **Modularize Auth Pages & Whitelist `/manual-confirm`**:
   - Convert `app/forgot-password/page.tsx` and `app/manual-confirm/page.tsx` into Server Components exporting `Metadata`.
   - Extract forms into `components/forgot-password-form.tsx` and `components/manual-confirm-form.tsx`.
   - Add `'/manual-confirm'` to `publicRoutes` in `proxy.ts`.
3. **Deterministic SSR Dates**:
   - Replace dynamic `new Date().toLocaleDateString()` in `app/privacy/page.tsx` and `app/terms/page.tsx` with static `LAST_UPDATED` constant.
   - Replace `new Date().toISOString().split("T")[0]` in `components/VisitForm.tsx` with `getTodayLocal()`.

### Phase 5: React 19 Adherence: State Derivation & Compiler Compliance
1. **Fix React Compiler Memoization & `setState` Violations**:
   - In `components/winery/use-winery-modal-state.ts`, remove `prevActiveWineryId`, `setPrevActiveWineryId`, and render-body state setters.
   - In `components/winery-modal.tsx`, key inner content on `activeWineryId` (`<WineryModalContent key={activeWineryId} />`) to reset state via React reconciliation.
2. **Eliminate All `react-hooks/set-state-in-effect` Suppressions**:
   - In `components/WineryQnA.tsx`, extract review display into `<WineryQuestionReviewCard key={activeQuestionId} />`.
   - In `hooks/use-trip-actions.ts`, derive `currentMembers` directly and remove unused `selectedFriends` state and effect.
   - In `components/trip-planner.tsx`, replace local `isMounted` effect with shared `useMounted()` hook.
   - Remove all 3 ESLint suppression comments.

### Phase 6: React 19 Form Actions Modernization
1. **Auth Forms on React 19 Server Actions**:
   - Create `app/actions/auth.ts` with Server Actions (`loginAction`, `forgotPasswordAction`, `manualConfirmAction`).
   - Refactor `login-form.tsx`, `forgot-password-form.tsx`, and `manual-confirm-form.tsx` to use `useActionState` with native `isPending`.
2. **Entity Forms Hybrid Client Action State**:
   - Refactor `components/trip-form.tsx` submission with `useActionState` while preserving `react-hook-form` / Zod validation, client Zustand store mutations, and offline sync.

### Phase 7: Service Worker Auth Hygiene & Production Quality Audit
1. **Service Worker Auth Cache Eviction**:
   - In `app/sw.ts`, remove `StaleWhileRevalidate` matcher for `/auth/v1/user` and `/auth/v1/session`.
   - Configure `NetworkOnly` runtime caching strategy for all `/auth/v1/*` requests.
   - Add message listener in `app/sw.ts` for `{ type: 'PURGE_AUTH_CACHE' }` to delete `supabase-auth` and `pages` caches.
2. **Offline-Resilient Logout Cache Eviction**:
   - In `lib/stores/userStore.ts#logout`, wrap `supabase.auth.signOut()` in defensive `try/catch` to ensure offline logouts reset stores cleanly.
   - Purge `supabase-auth` and `pages` from `window.caches` and dispatch `PURGE_AUTH_CACHE` to `navigator.serviceWorker.controller`.
3. **Full Verification & Build Audit**:
   - Execute `npm run lint`, `npm run type-check`, and `npm run build` to verify clean compilation with zero warnings and reduced bundle chunk sizes.

---

## 4. Non-Functional & Operational Requirements (AGENTS.md)
- **Date Handling**: Always use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts`.
- **UI Architecture**: Maintain Container/Presentational pattern with Tailwind CSS v4 utility classes.
- **DOM Stability**: Keep critical UI containers (`map-container`, `trip-list-container`, `map-view-canvas`) in the DOM across loading/error states using `data-state="loading|error|ready"`.
- **Adaptive 3-Tier Layout**: Respect responsive tier transitions across Mobile (< 768px), Tablet Portrait (768px–1024px), and Desktop (≥ 1024px).
- **Zero Regressions**: All existing unit tests (`npm test`) and E2E tests must continue to pass.

---

## 5. Acceptance Criteria
- [ ] 7 dead libraries and 10 unused Radix packages pruned from `package.json` with clean lockfile; `@radix-ui/react-accordion` retained.
- [ ] Dev server launches with Turbopack (`npm run dev`) with Serwist active only in production builds.
- [ ] Mapbox CSS is isolated to `MapView.tsx` and Google Maps fallback loader is lazy-loaded via `next/dynamic`.
- [ ] Root `app/layout.tsx` retains `<ModalHost />` but mounts zero feature dialogs on public landing or auth routes.
- [ ] `AuthenticatedModalHost` dynamically mounts modals across authenticated routes, including `app/trips/[id]/page.tsx`.
- [ ] `app/friends/[id]/page.tsx`, `app/forgot-password/page.tsx`, and `app/manual-confirm/page.tsx` are Server Components exporting `Metadata`.
- [ ] `proxy.ts` permits unauthenticated access to `/manual-confirm`.
- [ ] Zero hydration mismatch warnings occur across all core pages.
- [ ] Zero `setState` calls occur during render cycles; zero `react-hooks/set-state-in-effect` lint suppressions exist across the entire repo.
- [ ] Auth forms use React 19 Server Actions with `useActionState`; `trip-form.tsx` uses Hybrid Client `useActionState`.
- [ ] Service worker never caches `/auth/v1/` routes; CacheStorage (`supabase-auth`, `pages`) is purged on logout even when offline.
- [ ] Production build (`npm run build`) completes cleanly with reduced JavaScript chunk sizes.

---

## 6. Out of Scope
- Visual redesign of winery modals or bottom drawers (covered in separate UI tracks).
- Database migrations or Supabase DDL changes (purely frontend architecture and tooling).
- Test infrastructure restructuring or Playwright runner container refactoring (reserved for Sprint 4 QA).
