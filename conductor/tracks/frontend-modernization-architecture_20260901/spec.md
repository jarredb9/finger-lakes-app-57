# Specification: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization

## 1. Overview & Objectives
This track executes the **Frontend Modernization** initiative for Milestone [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1), addressing parent epic [#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39) and detailed issue specifications in [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36), building directly on [04-frontend-modernization-architecture.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/proposals/04-frontend-modernization-architecture.md).

The primary objectives across 5 focused, bounded phases are:
1. **Bundle & Tooling Pruning (Phase 1)**: Prune dead and redundant dependencies (`@dnd-kit`, `recharts`, unreferenced Radix primitives), clean brittle `package.json` overrides, and make Serwist PWA production-only in `next.config.mjs` to unblock Turbopack development (`next dev --turbo`).
2. **Map Engine Bundle Isolation & Dynamic Fallback (Phase 2)**: Isolate Mapbox GL CSS imports to map boundaries and dynamically load fallback Google Maps components via `next/dynamic` to prevent dual map engine bundle leaks.
3. **App Router & Server Component Boundaries (Phase 3)**: Enforce proper Server/Client boundaries across `/friends/[id]` and `/forgot-password`, lift heavy modals out of root `app/layout.tsx` into a dedicated `AuthenticatedModalHost` loaded lazily via `next/dynamic({ ssr: false })`, and ensure deterministic SSR date rendering with `formatDateLocal()`.
4. **React 19 Adherence: State Derivation & Form Actions (Phase 4)**: Standardize authentication and trip forms on React 19 `useActionState`, fix React Compiler violations (render-time `setState` and effect-based resets) via component keying, and eliminate all `react-hooks/set-state-in-effect` lint suppressions.
5. **Service Worker Auth Hygiene & Quality Verification (Phase 5)**: Enforce network-only caching for Supabase Auth (`/auth/v1/`), bridge `userStore.logout()` to purge CacheStorage, and execute a full production quality audit.

---

## 2. Scope & Technical Findings Addressed
- **FE-01 & FE-02 (Dependency Pruning - Phase 1)**: Remove unused libraries (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `recharts`, `react-resizable-panels`, `input-otp`, `sonner`, and ~11 unused `@radix-ui/react-*` primitive packages).
- **FE-03 (Map Engine Isolation - Phase 2)**: Dynamically load fallback Google Maps components and isolate Mapbox GL CSS to prevent initial bundle bloat.
- **FE-04 (Service Worker Auth Hygiene - Phase 5)**: Enforce network-only caching for Supabase Auth (`/auth/v1/`) and purge CacheStorage upon user sign-out in [app/sw.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/sw.ts) bridged to `userStore.ts`.
- **FE-06 (Turbopack Unblocking - Phase 1)**: Refactor [next.config.mjs](file:///home/byrnesjd4821/Git/finger-lakes-app-57/next.config.mjs) and scripts so Serwist activates exclusively in production (`process.env.NODE_ENV === 'production'`), allowing `next dev --turbo`.
- **FE-07 (Server Component Auth Guard - Phase 3)**: Convert [app/friends/[id]/page.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/friends/[id]/page.tsx) to an async Server Component with server-side auth validation and metadata export, delegating interactive UI to a Client Component.
- **FE-08 (React 19 Actions - Phase 4)**: Standardize authentication forms ([login-form.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/login-form.tsx), [forgot-password-form.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/forgot-password-form.tsx)) and trip CRUD forms ([trip-form.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-form.tsx)) on React 19 Server Actions using `useActionState`.
- **FE-09 (React Compiler Violations - Phase 4)**: Fix render-time `setState` calls in [use-winery-modal-state.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/use-winery-modal-state.ts) and [WineryQnA.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/WineryQnA.tsx); eliminate `react-hooks/set-state-in-effect` lint suppressions by deriving state during render and using `key` props for resets.
- **FE-10 (Deterministic SSR Dates - Phase 3)**: Enforce `formatDateLocal()` and static date constants across SSR components to eliminate client hydration mismatches.
- **FE-11 (Root Layout Decoupling - Phase 3)**: Extract heavy modals (`VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, `GlobalModalRenderer`) from root [app/layout.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/layout.tsx) into a lazy `AuthenticatedModalHost`.
- **FE-12 (Dependency Override Cleanup - Phase 1)**: Audit and prune blanket major-version overrides in `package.json#overrides`.
- **FE-13 (Auth Page Architecture - Phase 3)**: Split [app/forgot-password/page.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/forgot-password/page.tsx) into a Server Component exporting static `Metadata` and a Client Form component.

---

## 3. Functional Requirements

### Phase 1: Dependency Pruning, Tooling Optimization & Turbopack Unblocking
1. **Audit & Remove Dead Packages**:
   - Prune `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `recharts`, `react-resizable-panels`, `input-otp`, `sonner`, and unreferenced `@radix-ui/react-*` packages (`accordion`, `aspect-ratio`, `collapsible`, `context-menu`, `hover-card`, `menubar`, `navigation-menu`, `progress`, `radio-group`, `scroll-area`, `slider`) from `package.json`.
   - Audit imports across `components/`, `app/`, and `lib/` to verify zero residual usages.
2. **Clean Dependency Overrides**:
   - Streamline `package.json` overrides to minimal required security resolutions; verify `npm install` runs cleanly without dependency conflicts.
3. **Make Serwist Production-Only & Enable Turbopack**:
   - In `next.config.mjs`, wrap Serwist plugin activation so it only attaches when `process.env.NODE_ENV === 'production'`.
   - Update `npm run dev` to support Turbopack (`next dev --turbo`), verifying dev startup without Serwist build hooks. Keep `npm run build` using Webpack for production PWA compilation.

### Phase 2: Map Engine Bundle Isolation & Dynamic Fallback Loading
1. **Isolate Mapbox CSS**:
   - Remove `import 'mapbox-gl/dist/mapbox-gl.css'` from root `app/layout.tsx`.
   - Move Mapbox CSS imports to map-specific container components (`components/map/MapView.tsx`, `components/WineryMap.tsx`).
2. **Lazy-Load Google Maps Fallback**:
   - Ensure the `GoogleMapFallback` loader is dynamically imported via `next/dynamic({ ssr: false })` in `MapView.tsx`.
   - Ensure `@googlemaps/js-api-loader` is only evaluated when Mapbox initialization fails or Google Maps is explicitly requested, preserving DOM stability (`data-state="loading"`).

### Phase 3: Server Component Boundaries, SSR Date Determinism & Modal Host Modularization
1. **Authenticated Modal Host Decoupling (Expand-and-Contract)**:
   - *(Expand)* Create `components/modals/authenticated-modal-host.tsx` dynamically importing `VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`, and `GlobalModalRenderer` with `ssr: false`.
   - *(Migrate)* Mount `AuthenticatedModalHost` inside `components/app-shell.tsx` and standalone authenticated routes (`app/settings/page.tsx`, `app/friends/[id]/page.tsx`).
   - *(Contract)* Remove modal components and imports from root `app/layout.tsx`, ensuring public routes (`/login`, `/signup`, `/privacy`, `/terms`) mount without modal trees.
2. **Server Auth Guard & Metadata for `/friends/[id]`**:
   - Convert `app/friends/[id]/page.tsx` into an async Server Component.
   - Perform server-side auth verification via `getUser()`; redirect unauthenticated users to `/login`.
   - Export route `Metadata`.
   - Delegate friend details presentation and interactive state to a client component (`components/friends/friend-detail-view.tsx`).
3. **Modularize `/forgot-password` Page**:
   - Convert `app/forgot-password/page.tsx` into a Server Component exporting route `Metadata`.
   - Extract form interactions to a client component `components/forgot-password-form.tsx`.
4. **Deterministic SSR Dates**:
   - Audit `app/` and `components/` for non-deterministic `new Date().toLocaleDateString()` or dynamic timestamps rendered in Server Components.
   - Enforce `formatDateLocal()` and static fallback date constants to guarantee 100% hydration match between SSR and client.

### Phase 4: React 19 Adherence: State Derivation & Form Actions
1. **Fix React Compiler Memoization & `setState` Violations**:
   - In `components/winery/use-winery-modal-state.ts`, eliminate direct `setState` calls in the hook execution body. Replace effect-based state synchronization with derived state and component keying (`key={activeWineryId}`).
   - In `components/WineryQnA.tsx`, refactor question submission and state resets to eliminate render-time state modifications and `useEffect` resets by keying review sub-components on `activeQuestionId`.
   - Remove all ESLint suppressions (`eslint-disable-next-line react-hooks/set-state-in-effect`).
2. **Modernize Forms with React 19 `useActionState`**:
   - Refactor authentication forms (`login-form.tsx`, `forgot-password-form.tsx`) to use React 19 Server Actions with `useActionState` and pending indicators.
   - Refactor `trip-form.tsx` submission with `useActionState` while preserving `react-hook-form` / Zod validation and store mutations.

### Phase 5: Service Worker Auth Hygiene, CacheStorage Eviction & Quality Verification
1. **Service Worker Auth Cache Eviction**:
   - In `app/sw.ts`, remove `StaleWhileRevalidate` matcher for `/auth/v1/user` and `/auth/v1/session`.
   - Configure explicit `NetworkOnly` runtime caching strategy for all Supabase Auth requests matching `/auth/v1/*`.
2. **Logout CacheStorage Purge Bridge**:
   - Add a message listener in `app/sw.ts` for `{ type: 'PURGE_AUTH_CACHE' }`.
   - Update `lib/stores/userStore.ts#logout` to purge `window.caches` (deleting `supabase-auth` and `pages`) and dispatch `PURGE_AUTH_CACHE` to `navigator.serviceWorker.controller`.
3. **Full Verification & Build Audit**:
   - Run `npm run lint`, `npm run type-check`, and `npm run build` to verify clean compilation with zero warnings and reduced bundle chunk sizes.

---

## 4. Non-Functional & Operational Requirements (AGENTS.md)
- **Date Handling**: Always use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts`.
- **UI Architecture**: Maintain Container/Presentational pattern with Tailwind CSS v4 utility classes.
- **DOM Stability**: Keep critical UI containers (`map-container`, `trip-list-container`, `map-view-canvas`) in the DOM across loading/error states using `data-state="loading|error|ready"`.
- **Adaptive 3-Tier Layout**: Respect responsive tier transitions across Mobile (< 768px), Tablet Portrait (768px–1024px), and Desktop (≥ 1024px).
- **Zero Regressions**: All existing unit tests (`npm test`) and E2E tests must continue to pass.

---

## 5. Acceptance Criteria
- [ ] Dead dependencies (`@dnd-kit`, `recharts`, unused Radix packages) removed from `package.json` with clean lockfile.
- [ ] Dev server launches with Turbopack (`npm run dev`) with Serwist active only in production builds.
- [ ] Mapbox CSS is isolated and Google Maps fallback loader is lazy-loaded via `next/dynamic`.
- [ ] Root `app/layout.tsx` does not mount interactive modals on public landing or auth routes.
- [ ] `AuthenticatedModalHost` dynamically mounts modals only across authenticated routes.
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
