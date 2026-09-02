# Specification: Zustand 5 State Consolidation, Domain Invariants & Sync Integrity

## 1. Overview & Objectives
This track executes **Sprint 3** of Milestone [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1), addressing parent epic [#39](https://github.com/jarredb9/finger-lakes-app-57/issues/39) and detailed issue specifications in [#37](https://github.com/jarredb9/finger-lakes-app-57/issues/37).

The objective is to eliminate state fragmentation, enforce critical domain invariants (`AGENTS.md`), eliminate memory leaks, and harden offline sync resilience across the Zustand 5 state architecture.

## 2. Scope & Technical Findings Addressed
This track covers the 12 remaining tech debt findings from Issue #37:
- **ST-01**: Monolithic multi-domain congestion in [tripStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/tripStore.ts) and [visitStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/visitStore.ts) (slice decomposition < 300 lines).
- **ST-02**: Split-brain duplication and non-reactive getters between [wineryStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryStore.ts) and [wineryDataStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryDataStore.ts).
- **ST-03**: Split-brain duplicate visit caching across [visitStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/visitStore.ts) and winery entities.
- **ST-04**: Mixed `string` vs `number` relational ID normalization failure and `===` equality mismatches.
- **ST-05**: Map click handlers bypassing [standardizeWineryData](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/utils/winery.ts) and calling legacy `.lat()`/`.lng()`.
- **ST-06**: Ghost visit purge failure when receiving camelCase `userVisited: false`.
- **ST-08**: Blind last-write overwrite on offline reconnect without concurrency control.
- **ST-09**: Offline mutation queue deadlock on 4xx errors and tight retry loops on 503/504 errors.
- **ST-10**: Pervasive selector hygiene violations and whole-store subscriptions triggering re-render cascades.
- **ST-11**: Supabase Realtime WebSocket channel leaks on store reset and user logout.
- **ST-12**: Non-serializable DOM map SDK instances and JSX React nodes stored in Zustand.
- **ST-13**: Stale action timestamp hydration causing silent drop of remote server updates; non-atomic IndexedDB transaction wrapping.

*(Note: ST-07 was resolved in Sprint 1 and is verified as complete.)*

## 3. Functional Requirements

### Phase 1: Winery Store Unification & Domain Invariants
1. **Canonical Winery Store Consolidation (ST-02)**:
   - Direct cutover: Merge all data caching, reactive filtering, and selection logic into [wineryStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryStore.ts).
   - Update all consumer components and hooks to use `useWineryStore`.
   - Delete [wineryDataStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryDataStore.ts) cleanly.
2. **Single Source of Truth for Visits (ST-03)**:
   - Make [visitStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/visitStore.ts) the sole owner of visit state and queries.
   - Strip duplicate `visits` arrays from winery caches; wineries reference visit IDs only.
   - Refactor [use-winery-modal-state.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/use-winery-modal-state.ts) to query visits from `visitStore`.
3. **Numeric Relational ID Invariant (ST-04)**:
   - Coerce all incoming relational IDs (`trip_id`, `winery_id`, `user_id`) to `Number(id)` on ingress in all stores and utility helpers.
   - Update TypeScript interfaces in [lib/types.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/types.ts) to type IDs consistently, keeping optimistic client temp IDs explicit.
4. **Winery Data Standardization on Map Events (ST-05)**:
   - Route map clicks in [use-winery-map.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/hooks/use-winery-map.ts) and [map-container.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/map-container.tsx) through [standardizeWineryData](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/utils/winery.ts).
   - Eliminate legacy `.lat()` and `.lng()` invocations in favor of `location.latitude` and `location.longitude`.
5. **Ghost Visit Purge on camelCase (ST-06)**:
   - Update [lib/utils/winery.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/utils/winery.ts) to check `raw.user_visited === false || raw.userVisited === false`.
   - Clear `visits` array to `[]` when either flag indicates not visited.

### Phase 2: Monolithic Store Decomposition & Store Serializability
1. **Trip Store Decomposition (ST-01)**:
   - Decompose [tripStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/tripStore.ts) (1,225 lines) into focused slices: `createTripDataSlice`, `createTripUISlice`, `createTripRealtimeSlice`.
   - Ensure each slice file stays well under 300 lines.
2. **Visit Store Decomposition (ST-01)**:
   - Decompose [visitStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/visitStore.ts) (656 lines) into composable slices under 300 lines each.
3. **Store Serializability (ST-12)**:
   - Remove Map SDK instances from [mapStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/mapStore.ts); retain map instances in React refs or dedicated context.
   - Remove `ReactNode` JSX elements from [uiStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/uiStore.ts); store serializable modal identifiers.
4. **Action Timestamp Hydration Isolation (ST-13)**:
   - Omit `lastActionTimestamps` from IndexedDB `partialize` configuration in trip/visit persistence so action locks remain in-memory with TTL.

### Phase 3: Offline Sync Resilience, DLQ & Channel Cleanup
1. **Exponential Backoff & Jitter (ST-09)**:
   - Replace tight retry loops in [syncService.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/syncService.ts) with exponential backoff and jitter (1s, 2s, 4s, 8s, up to 60s max) for 5xx network errors.
2. **Dead Letter Queue (DLQ) for 4xx Errors (ST-09)**:
   - Route unrecoverable 4xx client errors to an IndexedDB DLQ with a 7-day retention policy, unblocking queue progression.
3. **Optimistic Concurrency Control (ST-08)**:
   - Check `updated_at` timestamps on replay; if remote version is newer, server wins with telemetry/warning, preventing silent overwrite of remote edits.
4. **Atomic Multi-Key Persistence Transactions (ST-13)**:
   - In [idb-persist-storage.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/idb-persist-storage.ts), wrap multi-key write batches in atomic `readwrite` IndexedDB transactions.
5. **Realtime Channel Teardown (ST-11)**:
   - Ensure all Supabase Realtime channels unsubscribe cleanly during `store.reset()` and logout across `tripStore`, `visitStore`, and `socialStore`.
6. **Fine-Grained Selectors & `useShallow` (ST-10)**:
   - Refactor whole-store subscriptions across components to fine-grained atomic selectors and `useShallow`.

## 4. Non-Functional & Operational Requirements
- **Test Coverage**: Store unit tests must achieve > 85% coverage (`CI=true npm test`).
- **Type Safety**: Zero TypeScript errors (`npm run type-check`).
- **Modularity**: All decomposed store slices must strictly remain < 300 lines of code.
- **Backwards Compatibility**: No breaking remote database schema changes; all operations are frontend state and sync engine refinements.

## 5. Acceptance Criteria
- [ ] Only one canonical `wineryStore.ts` exists; `wineryDataStore.ts` is deleted and all call sites updated.
- [ ] `visitStore` is the sole source of truth for visits; zero duplicate arrays in winery caches.
- [ ] Relational IDs strictly evaluate as numbers across stores, eliminating `===` comparison mismatches.
- [ ] `standardizeWineryData` purges visits on both `user_visited: false` and `userVisited: false`.
- [ ] Map clicks route strictly through `standardizeWineryData` using `location.latitude`/`location.longitude`.
- [ ] `tripStore.ts` and `visitStore.ts` are decomposed into composable slices under 300 lines each.
- [ ] Zustand state contains strictly serializable data (zero DOM map instances or JSX nodes).
- [ ] Action timestamps are not hydrated from IndexedDB across reloads.
- [ ] `syncService.ts` applies exponential backoff on 5xx errors and routes permanent 4xx failures to an IndexedDB DLQ.
- [ ] Stale offline updates do not silently overwrite newer remote server edits on reconnect.
- [ ] Logging out cleanly closes all active Supabase Realtime WebSocket channels.
- [ ] Component store subscriptions utilize fine-grained selectors and `useShallow`.
- [ ] All unit and integration tests pass cleanly with `CI=true npm test`.

## 6. Downstream Track Boundaries & Deconfliction
To prevent overlap and ensure smooth sequencing with upcoming milestone tracks:
- **Proposal 04 (Frontend Modernization & React 19 Architecture / Sprint 4)**:
  - `use-winery-modal-state.ts`: This track modifies data ingestion only (migrating from `wineryDataStore` and embedded `persistentWineries[].visits` to canonical `wineryStore` and `visitStore`). It deliberately leaves render-time `setState` restructuring and React compiler lint suppression cleanup to Proposal 04 (FE-09).
  - App Layout & Shell: This track does NOT alter `app/layout.tsx` modal mounting or Server Component boundaries (reserved for FE-07, FE-11, FE-13 in Proposal 04).
  - Dependencies & Turbopack: This track does NOT prune `@dnd-kit`, `recharts`, or Radix packages, nor modify `next.config.mjs` for Turbopack (reserved for FE-01, FE-02, FE-06, FE-12 in Proposal 04).
  - Service Worker: This track touches only IndexedDB sync/persistence, NOT `app/sw.ts` auth caching (reserved for FE-04 in Proposal 04).
- **Proposal 05 (Test Infrastructure & E2E Suite Stabilization / Sprint 4 QA)**:
  - Window Store Attachments: When decomposing `tripStore.ts` into slices, the composed store export MUST retain `(window as any).useTripStore = useTripStore` for backwards compatibility so existing E2E tests remain green until Proposal 05 (QA-03/QA-04) refactors test helpers away from store poking.
  - Test Runner & Config: This track writes standard unit tests using local cleanups (`store.reset()`), but does NOT modify `jest.config.mjs` (`workerIdleMemoryLimit`, `clearMocks`) or runner scripts (reserved for QA-05, QA-06, QA-07 in Proposal 05).
  - E2E Playwright Suites: This track does NOT touch `e2e/` test helpers, mocks, or `waitForTimeout` calls (reserved for QA-01, QA-08, QA-09, QA-10 in Proposal 05).

## 7. Out of Scope
- ST-07: Phantom mutation handling (already completed and verified in Sprint 1).
- Visual component redesigns and decomposition (scheduled for Sprint 4 / Issue #31).
- Database migrations / DDL changes (purely client-side state architecture).
- React 19 compiler / `useActionState` migrations (Proposal 04).
- E2E Playwright fixture architecture & test runner modernization (Proposal 05).
