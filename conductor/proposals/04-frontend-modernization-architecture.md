# Track Proposal: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization

## Track Metadata
- **Proposed Track ID**: `frontend-modernization-architecture_20260901`
- **Track Name**: Frontend Modernization, React 19 / App Router Architecture & Bundle Optimization
- **Track Type**: `refactor`
- **Target Milestone**: [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1)
- **Parent Epic**: [#39 (Sprint 4: Frontend Modernization, Bundle Optimization & QA Architecture)](https://github.com/jarredb9/finger-lakes-app-57/issues/39)
- **Referenced Issues**: [#36 (Next.js 16, React 19, PWA & Dependency Architecture)](https://github.com/jarredb9/finger-lakes-app-57/issues/36)

---

## 1. Overview & Context
An audit of the frontend architecture revealed significant bundle bloat, React 19 compiler violations, and inconsistent Next.js 16 App Router patterns:
1. Dead libraries (`@dnd-kit`, `recharts`, unused Radix primitives) and dual map engines (`mapbox-gl` + `@googlemaps/js-api-loader`) inflate production bundle size.
2. Root `app/layout.tsx` unconditionally mounts heavy interactive dialogs on public landing and authentication pages.
3. React 19 Compiler memoization is broken by components calling `setState` directly inside the render body (e.g. `useWineryModalState`).
4. Pages like `app/friends/[id]/page.tsx` and `app/forgot-password/page.tsx` improperly mix Server and Client Component boundaries, omitting static metadata and server-side auth guards.
5. Non-deterministic date generation in Server Components risks React hydration mismatch warnings.
6. Serwist forces `--webpack` across all modes, blocking modern Turbopack development.

This track represents the **Frontend Modernization** phase of Milestone v3.6.0, streamlining bundle size, unlocking Turbopack, and bringing all UI components into full React 19 and App Router compliance.

---

## 2. Guardrails & Operational Constraints (AGENTS.md)
- **Date Handling**: Always use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts`.
- **UI Architecture**: Container/Presentational pattern with Tailwind CSS v4 utilities.
- **DOM Stability**: Critical UI containers (`map-container`, `trip-list-container`) must remain mounted in the DOM across loading and error states using `data-state="loading|error|ready"`.
- **Adaptive 3-Tier Layout**: Respect responsive tier transitions across Mobile (< 768px), Tablet Portrait (768px–1024px), and Desktop (≥ 1024px).

---

## 3. Detailed Technical Requirements

### 3.1 Bundle Pruning & Tooling
- **[FE-01 & FE-02] Prune Dead & Redundant Dependencies**:
  - *Location*: [`package.json`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/package.json)
  - *Problem*: Dead dependencies (`@dnd-kit/core`, `@dnd-kit/sortable`, `recharts`) and 10 unused `@radix-ui/react-*` primitive packages bloat bundle and install size.
  - *Remediation*: Remove unused packages; audit imports to ensure clean uninstalls.
- **[FE-03] Isolate Mapbox CSS & Dynamically Load Google Maps Fallback**:
  - *Location*: [`app/layout.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/layout.tsx), [`components/map/`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/)
  - *Problem*: Both Mapbox and Google Maps loaders are bundled into the initial client bundle.
  - *Remediation*: Dynamically import fallback map engines via `next/dynamic` and scope CSS imports.
- **[FE-06] Unblock Turbopack in Development**:
  - *Location*: [`next.config.mjs`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/next.config.mjs), [`package.json`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/package.json)
  - *Problem*: Serwist configuration forces `--webpack` flag in dev scripts.
  - *Remediation*: Condition Serwist plugin exclusively on `process.env.NODE_ENV === 'production'`, enabling fast Turbopack development via `next dev --turbo`.
- **[FE-12] Clean Brittle Dependency Overrides**:
  - *Location*: [`package.json#L139-L147`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/package.json#L139-L147)
  - *Problem*: Blanket major-version overrides force conflicting transitive dependencies.
  - *Remediation*: Prune overrides to minimal required security patches.

### 3.2 App Router & Server Component Boundaries
- **[FE-07] Server Component Auth Guard on `/friends/[id]`**:
  - *Location*: [`app/friends/[id]/page.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/friends/[id]/page.tsx)
  - *Problem*: Declared as a client component fetching data post-hydration, bypassing server-side auth validation.
  - *Remediation*: Convert `page.tsx` into an async Server Component with `await createClient().auth.getUser()` server redirect, delegating presentation to a client component.
- **[FE-10] Deterministic SSR Dates**:
  - *Location*: Across `app/` and `components/`
  - *Problem*: `new Date().toLocaleDateString()` called during server render causes client hydration mismatch warnings.
  - *Remediation*: Standardize on `formatDateLocal()` and static date constants for server components.
- **[FE-11] Lazy-Load Modals Out of Root Layout**:
  - *Location*: [`app/layout.tsx#L56-L70`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/layout.tsx#L56-L70)
  - *Problem*: Heavy dialogs (`VisitFormModal`, `WineryNoteModal`, `TripShareDialogWrapper`) are rendered on unauthenticated pages (`/login`, `/privacy`).
  - *Remediation*: Move modals into an authenticated App Shell wrapper and load them lazily with `next/dynamic`.
- **[FE-13] Inconsistent App Router Architecture on Auth Pages**:
  - *Location*: [`app/forgot-password/page.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/forgot-password/page.tsx)
  - *Problem*: Marked `"use client"` at root, preventing static Next.js metadata export.
  - *Remediation*: Separate into server `page.tsx` (exporting `metadata`) and client `forgot-password-form.tsx`.

### 3.3 React 19 Adherence & PWA Hygiene
- **[FE-08] Standardize Form Handling on React 19 Actions**:
  - *Location*: [`components/login-form.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/login-form.tsx), [`components/trip-form.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-form.tsx)
  - *Problem*: Fragmentation between `react-hook-form` and manual `useState` form handlers without React 19 `useActionState`.
  - *Remediation*: Migrate standard auth and CRUD forms to React 19 Server Actions with `useActionState`.
- **[FE-09] Resolve React Compiler Violations**:
  - *Location*: [`components/winery/use-winery-modal-state.ts#L33-L42`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/use-winery-modal-state.ts#L33-L42), [`components/WineryQnA.tsx#L392`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/WineryQnA.tsx#L392)
  - *Problem*: `setState` called in render body; lint rules suppressed for effect state synchronization.
  - *Remediation*: Derive state during render, reset component state via `key` props, and remove lint suppressions.
- **[FE-04] Service Worker Auth Cache Eviction**:
  - *Location*: [`app/sw.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/sw.ts)
  - *Problem*: Service worker can retain cached Supabase Auth endpoints, causing stale session tokens.
  - *Remediation*: Add network-only cache rules for `/auth/v1/` and purge CacheStorage upon user sign-out.

---

## 4. Acceptance Criteria
- [ ] Dead packages (`@dnd-kit`, `recharts`, unused Radix primitives) pruned from `package.json`.
- [ ] Next.js development server launches successfully with Turbopack (`npm run dev`).
- [ ] Root `app/layout.tsx` does not include interactive feature dialogs on unauthenticated routes.
- [ ] `app/friends/[id]/page.tsx` and `app/forgot-password/page.tsx` are async Server Components exporting static metadata.
- [ ] Zero `setState` calls occur during render cycles; ESLint reports zero `react-hooks/set-state-in-effect` suppressions.
- [ ] Hydration mismatch console errors are eliminated on all core routes.
- [ ] Service worker never caches `/auth/v1/` requests and clears caches on sign-out.
- [ ] Production build (`npm run build`) completes cleanly with reduced JavaScript chunk sizes.

---

## 5. Proposed Phased Implementation Plan

### Phase 1: Dependency Pruning & Turbopack Unblocking
- [ ] Task: Audit and remove unused dependencies (`@dnd-kit`, `recharts`, unused Radix packages)
- [ ] Task: Clean `package.json` overrides and verify `npm install` runs cleanly
- [ ] Task: Refactor `next.config.mjs` so Serwist is production-only and verify Turbopack dev launch
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Dependency Pruning & Turbopack' (Protocol in workflow.md)

### Phase 2: Server Component Boundaries & App Layout Modularization
- [ ] Task: Refactor `app/layout.tsx` to move heavy modals into an authenticated App Shell with `next/dynamic`
- [ ] Task: Convert `app/friends/[id]/page.tsx` and `app/forgot-password/page.tsx` into Server Components with metadata
- [ ] Task: Replace non-deterministic dates with static constants / `formatDateLocal()`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Server Boundaries & App Layout' (Protocol in workflow.md)

### Phase 3: React 19 Adherence & Service Worker Hygiene
- [ ] Task: Fix render-time `setState` violations in `use-winery-modal-state.ts` and `WineryQnA.tsx`
- [ ] Task: Modernize auth forms to use React 19 `useActionState`
- [ ] Task: Update `app/sw.ts` cache rules to exclude auth routes and purge CacheStorage on logout
- [ ] Task: Run full build and lint checks (`npm run lint && npm run build`)
- [ ] Task: Conductor - User Manual Verification 'Phase 3: React 19 & Service Worker Hygiene' (Protocol in workflow.md)
