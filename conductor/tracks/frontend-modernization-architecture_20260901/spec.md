# Specification: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization

## 1. Overview & Objectives
This track executes the **Frontend Modernization** initiative for Milestone [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1), addressing parent epic [#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39) and detailed issue specifications in [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36), building directly on [04-frontend-modernization-architecture.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/proposals/04-frontend-modernization-architecture.md).

The primary objectives are:
1. **Bundle & Tooling Pruning**: Prune dead and redundant dependencies (`@dnd-kit`, `recharts`, unused Radix primitives), isolate Mapbox CSS, lazy-load fallback map loaders, clean brittle `package.json` overrides, and make Serwist PWA production-only to unblock Turbopack development.
2. **App Router & Server Component Boundaries**: Enforce proper Server/Client boundaries across `/friends/[id]` and `/forgot-password`, lift heavy modals out of root `app/layout.tsx` into an authenticated App Shell loaded lazily via `next/dynamic`, and ensure deterministic SSR date rendering.
3. **React 19 Adherence & Service Worker Hygiene**: Standardize forms on React 19 `useActionState`, fix React Compiler memoization violations (render-time `setState`), and prevent stale session retention in `app/sw.ts`.

---

## 2. Scope & Technical Findings Addressed
- **FE-01 & FE-02 (Dependency Pruning)**: Remove unused libraries (`@dnd-kit/core`, `@dnd-kit/sortable`, `recharts`, and ~10 unused `@radix-ui/react-*` primitive packages).
- **FE-03 (Map Engine Isolation)**: Dynamically load fallback Google Maps components and isolate Mapbox GL CSS to prevent initial bundle bloat.
- **FE-04 (Service Worker Auth Hygiene)**: Enforce network-only caching for Supabase Auth (`/auth/v1/`) and purge CacheStorage upon user sign-out in [app/sw.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/sw.ts).
- **FE-06 (Turbopack Unblocking)**: Refactor [next.config.mjs](file:///home/byrnesjd4821/Git/finger-lakes-app-57/next.config.mjs) and scripts so Serwist activates exclusively in production (`process.env.NODE_ENV === 'production'`), allowing `next dev --turbo`.
- **FE-07 (Server Component Auth Guard)**: Convert [app/friends/[id]/page.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/friends/[id]/page.tsx) to an async Server Component with server-side auth validation and metadata export, delegating interactive UI to a Client Component.
- **FE-08 (React 19 Actions)**: Standardize authentication forms ([login-form.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/login-form.tsx), [forgot-password-form.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/forgot-password-form.tsx)) and trip CRUD forms ([trip-form.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-form.tsx)) on React 19 Server Actions using `useActionState`.
- **FE-09 (React Compiler Violations)**: Fix render-time `setState` calls in [use-winery-modal-state.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/use-winery-modal-state.ts) and [WineryQnA.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/WineryQnA.tsx); eliminate `react-hooks/set-state-in-effect` lint suppressions by deriving state during render and using `key` props for resets.
- **FE-10 (Deterministic SSR Dates)**: Enforce `formatDateLocal()` and static date constants across SSR components to eliminate client hydration mismatches.
- **FE-11 (Root Layout Decoupling)**: Extract heavy modals (`VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`) from root [app/layout.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/layout.tsx) into an authenticated shell loaded via `next/dynamic`.
- **FE-12 (Dependency Override Cleanup)**: Audit and prune blanket major-version overrides in `package.json#overrides`.
- **FE-13 (Auth Page Architecture)**: Split [app/forgot-password/page.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/forgot-password/page.tsx) into a Server Component exporting static `Metadata` and a Client Form component.

---

## 3. Functional Requirements

### Phase 1: Dependency Pruning & Turbopack Unblocking
1. **Audit & Remove Dead Packages**:
   - Prune `@dnd-kit/core`, `@dnd-kit/sortable`, `recharts`, and unused `@radix-ui/react-*` packages from `package.json`.
   - Audit imports across `components/` and `app/` to verify zero residual usages.
2. **Clean Dependency Overrides**:
   - Streamline `package.json` overrides to minimal required security resolutions; verify `npm install` runs cleanly without dependency conflicts.
3. **Make Serwist Production-Only & Enable Turbopack**:
   - In `next.config.mjs`, wrap Serwist plugin activation so it only attaches when `process.env.NODE_ENV === 'production'`.
   - Update `npm run dev` to support Turbopack (`next dev --turbo`), verifying dev startup without Serwist build hooks.
4. **Isolate Mapbox CSS & Lazy-Load Google Maps Fallback**:
   - Isolate Mapbox CSS import to map-specific containers.
   - Ensure the Google Maps fallback loader is dynamically imported via `next/dynamic` only when Mapbox initialization fails or Google Maps is explicitly requested.

### Phase 2: Server Component Boundaries & App Layout Modularization
1. **App Shell Modal Decoupling**:
   - Move `VisitFormModal`, `WineryNoteModal`, and `TripShareDialogWrapper` out of `app/layout.tsx`.
   - Place modals inside an authenticated App Shell wrapper rendered on authenticated routes (`/`, `/trips`, `/friends`, `/profile`).
   - Load modal components lazily via `next/dynamic({ ssr: false })` so they are not loaded on initial HTML page fetch for `/login`, `/signup`, or public routes.
2. **Server Auth Guard & Metadata for `/friends/[id]`**:
   - Convert `app/friends/[id]/page.tsx` into an async Server Component.
   - Perform server-side auth verification via Supabase Server Client; redirect unauthenticated users to `/login`.
   - Export static/dynamic route `Metadata`.
   - Delegate friend details presentation and interactive state to a client component (`components/friends/friend-detail-view.tsx`).
3. **Modularize `/forgot-password` Page**:
   - Convert `app/forgot-password/page.tsx` into a Server Component exporting route `Metadata`.
   - Extract form interactions to a client component `components/forgot-password-form.tsx`.
4. **Deterministic SSR Dates**:
   - Audit `app/` and `components/` for non-deterministic `new Date().toLocaleDateString()` or dynamic timestamps rendered in Server Components.
   - Enforce `formatDateLocal()` and static fallback date constants to guarantee 100% hydration match between SSR and client.

### Phase 3: React 19 Adherence & Service Worker Hygiene
1. **Fix React Compiler Memoization & `setState` Violations**:
   - In `components/winery/use-winery-modal-state.ts`, eliminate direct `setState` calls in the hook execution body. Replace effect-based state synchronization with derived state and component keying.
   - In `components/WineryQnA.tsx`, refactor question submission and state resets to eliminate render-time state modifications.
   - Remove all ESLint suppressions (`eslint-disable-next-line react-hooks/set-state-in-effect`).
2. **Modernize Forms with React 19 `useActionState`**:
   - Refactor authentication forms (`login-form.tsx`, `forgot-password-form.tsx`) to use React 19 Server Actions with `useActionState` and `useFormStatus` / pending indicators.
   - Refactor `trip-form.tsx` to utilize React 19 form actions while maintaining validation feedback and existing store integrations.
3. **Service Worker Auth Cache Eviction & Logout Purge**:
   - In `app/sw.ts`, configure explicit `NetworkOnly` runtime caching strategy for all Supabase Auth requests matching `/auth/v1/`.
   - Add a listener or export a utility to purge CacheStorage upon user logout.
4. **Full Verification & Build Audit**:
   - Run `npm run lint`, `npm run type-check`, and `npm run build` to verify clean compilation with zero warnings and reduced bundle chunk sizes.

---

## 4. Non-Functional & Operational Requirements (AGENTS.md)
- **Date Handling**: Always use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts`.
- **UI Architecture**: Maintain Container/Presentational pattern with Tailwind CSS v4 utility classes.
- **DOM Stability**: Keep critical UI containers (`map-container`, `trip-list-container`) in the DOM across loading/error states using `data-state="loading|error|ready"`.
- **Adaptive 3-Tier Layout**: Respect responsive tier transitions across Mobile (< 768px), Tablet Portrait (768px–1024px), and Desktop (≥ 1024px).
- **Zero Regressions**: All existing unit tests (`npm test`) and E2E tests must continue to pass.

---

## 5. Acceptance Criteria
- [ ] Dead dependencies (`@dnd-kit`, `recharts`, unused Radix packages) removed from `package.json` with clean lockfile.
- [ ] Dev server launches with Turbopack (`npm run dev`) with Serwist active only in production builds.
- [ ] Mapbox CSS is isolated and Google Maps fallback loader is lazy-loaded via `next/dynamic`.
- [ ] Root `app/layout.tsx` does not mount interactive modals on public landing or auth routes.
- [ ] `app/friends/[id]/page.tsx` and `app/forgot-password/page.tsx` are Server Components exporting `Metadata`.
- [ ] Zero hydration mismatch warnings occur across all core pages.
- [ ] Zero `setState` calls occur during render cycles; zero `react-hooks/set-state-in-effect` lint suppressions exist.
- [ ] Auth and trip forms use React 19 `useActionState`.
- [ ] Service worker never caches `/auth/v1/` routes and CacheStorage is purged on logout.
- [ ] Production build (`npm run build`) completes cleanly with reduced JavaScript chunk sizes.

---

## 6. Out of Scope
- Visual redesign of winery modals or bottom drawers (covered in separate UI tracks).
- Database migrations or Supabase DDL changes (purely frontend architecture and tooling).
- Test infrastructure restructuring or Playwright runner container refactoring (reserved for Proposal 05 / Sprint 4 QA).
