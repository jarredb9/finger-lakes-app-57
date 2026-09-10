# Implementation Plan: Zustand 5 State Consolidation, Domain Invariants & Sync Integrity

Establishing a unified Zustand 5 state architecture adhering strictly to `AGENTS.md` domain invariants, decomposing monolithic stores, hardening offline sync resilience, and eliminating memory leaks.

## Phase 1: Winery Store Unification & Domain Invariants [checkpoint: fc74800]
Focus: Consolidate split-brain winery stores, establish single source of truth for visits, normalize relational IDs, standardize map click events, and fix ghost visit purge.

- [x] Task: Write failing unit tests for canonical winery store, ghost visit purge, and numeric ID normalization 3db0e73
    - [x] Unit tests for `wineryStore` verifying caching, reactivity, and full deprecation of `wineryDataStore`
    - [x] Unit tests in `lib/utils/__tests__/winery.test.ts` for camelCase `userVisited: false` ghost visit purge and coordinate access
    - [x] Unit tests for relational ID normalization `Number(id)` on store ingress
- [x] Task: Update winery data standardizer and map click handlers dd05d44
    - [x] Update `lib/utils/winery.ts` to check `user_visited === false || userVisited === false` and clear `visits`
    - [x] Update `hooks/use-winery-map.ts` and `components/map/map-container.tsx` to pass place clicks through `standardizeWineryData` and remove `.lat()`/`.lng()` calls
- [x] Task: Consolidate `wineryDataStore.ts` into canonical `wineryStore.ts` 5321e75
    - [x] Merge persistent caching and reactive state into `lib/stores/wineryStore.ts`
    - [x] Migrate all consumer components (`use-winery-modal-state.ts`, etc.) from `wineryDataStore` to `wineryStore`
    - [x] Delete `lib/stores/wineryDataStore.ts`
- [x] Task: Enforce single source of truth for visits in `visitStore.ts` (Pure Normalized Architecture) 9ed1dac
    - [x] Fully decouple winery entities from visits by stripping duplicate visit caches and removing redundant `visit_ids` from `Winery`
    - [x] Implement on-demand visit hydration (`fetchVisitsForWinery`) in `visitStore` and connect modal state
    - [x] Enforce `Number(id)` normalization across ingress in `visitStore`, `tripStore`, `wineryStore`, and `lib/types.ts`
- [x] Task: Conductor - User Manual Verification 'Phase 1: Winery Store Unification & Domain Invariants' (Protocol in workflow.md)

## Phase 2: Monolithic Store Decomposition & Store Serializability [checkpoint: 727139f]
Focus: Decompose `tripStore.ts` and `visitStore.ts` into composable slices (< 300 lines each), enforce store serializability, and isolate action timestamps.

- [x] Task: Write failing unit tests for store slice decomposition, serializability, and action timestamps 9521531
    - [x] Unit tests covering `tripStore` sliced architecture (`dataSlice`, `uiSlice`, `realtimeSlice`)
    - [x] Unit tests covering `visitStore` slice boundaries
    - [x] Unit tests verifying `mapStore` and `uiStore` serializability (rejecting DOM instances/React nodes)
    - [x] Unit tests verifying `lastActionTimestamps` is excluded from persistence hydration
- [x] Task: Decompose `tripStore.ts` into modular slices 950351a
    - [x] Create `lib/stores/slices/tripDataSlice.ts` (< 300 lines)
    - [x] Create `lib/stores/slices/tripUISlice.ts` (< 300 lines)
    - [x] Create `lib/stores/slices/tripRealtimeSlice.ts` (< 300 lines)
    - [x] Compose slices into unified `tripStore.ts` (preserving `(window as any).useTripStore` backwards compatibility until Proposal 05) and exclude `lastActionTimestamps` from IndexedDB `partialize`
- [x] Task: Decompose `visitStore.ts` into modular slices 1797739
    - [x] Create modular slices for visit data, UI, and sync operations (< 300 lines each)
    - [x] Compose slices into unified `visitStore.ts`
- [x] Task: Clean up store serializability in `mapStore.ts` and `uiStore.ts` c4478638
    - [x] Refactor `mapStore.ts` to remove map SDK DOM instances (delegate to React refs/context)
    - [x] Refactor `uiStore.ts` to store serializable modal identifiers instead of `ReactNode` JSX elements
- [x] Task: Conductor - User Manual Verification 'Phase 2: Monolithic Store Decomposition & Store Serializability' (Protocol in workflow.md)

## Phase 3: Offline Sync Resilience, DLQ & Channel Cleanup [checkpoint: daa52ec9]
Focus: Implement exponential backoff with jitter on 5xx errors, an IndexedDB Dead Letter Queue for 4xx errors, optimistic concurrency control, atomic transactions, and Realtime channel teardown.

- [x] Task: Write failing unit tests for offline sync backoff, DLQ, concurrency control, and channel cleanup 6a47b39
    - [x] Unit tests in `lib/services/__tests__/syncService.test.ts` for exponential backoff with jitter on 5xx errors
    - [x] Unit tests for routing 4xx errors to IndexedDB Dead Letter Queue (DLQ)
    - [x] Unit tests for optimistic concurrency control (`updated_at` check on reconnect)
    - [x] Unit tests for Realtime channel unsubscription on `store.reset()` and logout
    - [x] Unit tests for atomic multi-key persistence in `idb-persist-storage.ts`
- [x] Task: Implement sync resilience and Dead Letter Queue in `syncService.ts` df5cfc9c
    - [x] Implement exponential backoff with jitter (1s, 2s, 4s... max 60s) for 5xx network errors
    - [x] Create IndexedDB DLQ store with 7-day retention for unrecoverable 4xx mutation errors
    - [x] Implement optimistic concurrency control comparing remote vs local `updated_at` timestamps on replay
- [x] Task: Implement atomic persistence and Realtime channel teardown 92543be
    - [x] Wrap multi-key write batches in single `readwrite` IndexedDB transactions in `idb-persist-storage.ts`
    - [x] Add teardown logic in `store.reset()` across `tripStore`, `visitStore`, and `socialStore` to cleanly close Realtime WebSocket channels on logout
- [x] Task: Conductor - User Manual Verification 'Phase 3: Offline Sync Resilience, DLQ & Channel Cleanup' (Protocol in workflow.md) daa52ec9

## Phase 4: Component Store Subscriptions & Selector Hygiene
Focus: Eliminate re-render cascades across UI components by migrating whole-store subscriptions to atomic selectors and `useShallow` (ST-10).

- [x] Task: Write component unit tests asserting selective re-rendering and shallow equality 11d1a3b2
- [ ] Task: Refactor store subscriptions in `components/map/` and `components/trip-card.tsx` to fine-grained selectors and `useShallow`
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Component Store Subscriptions & Selector Hygiene' (Protocol in workflow.md)

## Phase: Review Fixes
- [x] Task: Apply review suggestions d453846
- [x] Task: Apply review suggestions (Phase 2 modular decomposition & serializability) 3942aa15
- [x] Task: Apply review suggestions 501d935

