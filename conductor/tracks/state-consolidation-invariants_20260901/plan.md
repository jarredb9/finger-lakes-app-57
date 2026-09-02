# Implementation Plan: Zustand 5 State Consolidation, Domain Invariants & Sync Integrity

Establishing a unified Zustand 5 state architecture adhering strictly to `AGENTS.md` domain invariants, decomposing monolithic stores, hardening offline sync resilience, and eliminating memory leaks.

## Phase 1: Winery Store Unification & Domain Invariants
Focus: Consolidate split-brain winery stores, establish single source of truth for visits, normalize relational IDs, standardize map click events, and fix ghost visit purge.

- [x] Task: Write failing unit tests for canonical winery store, ghost visit purge, and numeric ID normalization 3db0e73
    - [x] Unit tests for `wineryStore` verifying caching, reactivity, and full deprecation of `wineryDataStore`
    - [x] Unit tests in `lib/utils/__tests__/winery.test.ts` for camelCase `userVisited: false` ghost visit purge and coordinate access
    - [x] Unit tests for relational ID normalization `Number(id)` on store ingress
- [x] Task: Update winery data standardizer and map click handlers dd05d44
    - [x] Update `lib/utils/winery.ts` to check `user_visited === false || userVisited === false` and clear `visits`
    - [x] Update `hooks/use-winery-map.ts` and `components/map/map-container.tsx` to pass place clicks through `standardizeWineryData` and remove `.lat()`/`.lng()` calls
- [ ] Task: Consolidate `wineryDataStore.ts` into canonical `wineryStore.ts`
    - [ ] Merge persistent caching and reactive state into `lib/stores/wineryStore.ts`
    - [ ] Migrate all consumer components (`use-winery-modal-state.ts`, etc.) from `wineryDataStore` to `wineryStore`
    - [ ] Delete `lib/stores/wineryDataStore.ts`
- [ ] Task: Enforce single source of truth for visits in `visitStore.ts`
    - [ ] Strip duplicated visit caches from winery objects so wineries reference visit IDs only
    - [ ] Enforce `Number(id)` normalization across ingress in `visitStore`, `tripStore`, `wineryStore`, and `lib/types.ts`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Winery Store Unification & Domain Invariants' (Protocol in workflow.md)

## Phase 2: Monolithic Store Decomposition & Store Serializability
Focus: Decompose `tripStore.ts` and `visitStore.ts` into composable slices (< 300 lines each), enforce store serializability, and isolate action timestamps.

- [ ] Task: Write failing unit tests for store slice decomposition, serializability, and action timestamps
    - [ ] Unit tests covering `tripStore` sliced architecture (`dataSlice`, `uiSlice`, `realtimeSlice`)
    - [ ] Unit tests covering `visitStore` slice boundaries
    - [ ] Unit tests verifying `mapStore` and `uiStore` serializability (rejecting DOM instances/React nodes)
    - [ ] Unit tests verifying `lastActionTimestamps` is excluded from persistence hydration
- [ ] Task: Decompose `tripStore.ts` into modular slices
    - [ ] Create `lib/stores/slices/tripDataSlice.ts` (< 300 lines)
    - [ ] Create `lib/stores/slices/tripUISlice.ts` (< 300 lines)
    - [ ] Create `lib/stores/slices/tripRealtimeSlice.ts` (< 300 lines)
    - [ ] Compose slices into unified `tripStore.ts` (preserving `(window as any).useTripStore` backwards compatibility until Proposal 05) and exclude `lastActionTimestamps` from IndexedDB `partialize`
- [ ] Task: Decompose `visitStore.ts` into modular slices
    - [ ] Create modular slices for visit data, UI, and sync operations (< 300 lines each)
    - [ ] Compose slices into unified `visitStore.ts`
- [ ] Task: Clean up store serializability in `mapStore.ts` and `uiStore.ts`
    - [ ] Refactor `mapStore.ts` to remove map SDK DOM instances (delegate to React refs/context)
    - [ ] Refactor `uiStore.ts` to store serializable modal identifiers instead of `ReactNode` JSX elements
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Monolithic Store Decomposition & Store Serializability' (Protocol in workflow.md)

## Phase 3: Offline Sync Resilience, DLQ & Channel Cleanup
Focus: Implement exponential backoff with jitter on 5xx errors, an IndexedDB Dead Letter Queue for 4xx errors, optimistic concurrency control, atomic transactions, and Realtime channel teardown.

- [ ] Task: Write failing unit tests for offline sync backoff, DLQ, concurrency control, and channel cleanup
    - [ ] Unit tests in `lib/services/__tests__/syncService.test.ts` for exponential backoff with jitter on 5xx errors
    - [ ] Unit tests for routing 4xx errors to IndexedDB Dead Letter Queue (DLQ)
    - [ ] Unit tests for optimistic concurrency control (`updated_at` check on reconnect)
    - [ ] Unit tests for Realtime channel unsubscription on `store.reset()` and logout
    - [ ] Unit tests for atomic multi-key persistence in `idb-persist-storage.ts`
- [ ] Task: Implement sync resilience and Dead Letter Queue in `syncService.ts`
    - [ ] Implement exponential backoff with jitter (1s, 2s, 4s... max 60s) for 5xx network errors
    - [ ] Create IndexedDB DLQ store with 7-day retention for unrecoverable 4xx mutation errors
    - [ ] Implement optimistic concurrency control comparing remote vs local `updated_at` timestamps on replay
- [ ] Task: Implement atomic persistence and Realtime channel teardown
    - [ ] Wrap multi-key write batches in single `readwrite` IndexedDB transactions in `idb-persist-storage.ts`
    - [ ] Add teardown logic in `store.reset()` across `tripStore`, `visitStore`, and `socialStore` to cleanly close Realtime WebSocket channels on logout
- [ ] Task: Convert component store subscriptions to fine-grained selectors and `useShallow`
    - [ ] Audit and refactor whole-store subscriptions in `components/map/`, `components/trip-card.tsx`, etc. to fine-grained selectors and `useShallow`
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Offline Sync Resilience, DLQ & Channel Cleanup' (Protocol in workflow.md)
