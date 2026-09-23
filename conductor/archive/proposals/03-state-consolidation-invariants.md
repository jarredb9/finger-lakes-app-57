# Track Proposal: Zustand 5 State Consolidation, Domain Invariants & Sync Integrity

## Track Metadata
- **Proposed Track ID**: `state-consolidation-invariants_20260901`
- **Track Name**: Zustand 5 State Consolidation, Domain Invariants & Sync Integrity
- **Track Type**: `refactor`
- **Target Milestone**: [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1)
- **Parent Epic**: [#39 (Sprint 3: State Architecture Consolidation & Domain Invariants)](https://github.com/jarredb9/finger-lakes-app-57/issues/39)
- **Referenced Issues**: [#37 (Zustand 5 State Management & Domain Invariants Integrity)](https://github.com/jarredb9/finger-lakes-app-57/issues/37)

---

## 1. Overview & Context
The technical debt audit revealed that the state management architecture in `lib/stores/` suffers from split-brain duplication, domain invariant breaches, and offline sync vulnerabilities:
1. Two divergent winery stores (`wineryStore.ts` and `wineryDataStore.ts`) manage overlapping state, forcing UI components to perform manual deduplication.
2. Visits are duplicated across `useVisitStore.visits` and `useWineryDataStore.persistentWineries[].visits`.
3. Relational IDs are inconsistently stored as strings or numbers, causing `===` lookup failures.
4. The ghost visit prevention rule fails when APIs return camelCase `userVisited: false`.
5. Non-serializable DOM map objects and React nodes are placed in Zustand, causing memory retention.
6. The offline mutation queue in `syncService.ts` executes tight retry loops on 5xx errors and stalls on permanent 4xx errors without a Dead Letter Queue (DLQ).

This track serves as **Sprint 3** of Milestone v3.6.0, establishing a clean, unified Zustand 5 store architecture adhering strictly to domain invariants.

---

## 2. Guardrails & Operational Constraints (AGENTS.md)
- **Relational IDs**: Zustand stores must normalize relational IDs to `Number()` upon retrieval.
- **Coordinate Standardization**: All winery data sources must pass through `standardizeWineryData` in `lib/utils/winery.ts`. Access coordinates strictly via `location.latitude` and `location.longitude` (no `.lat()` calls, strip legacy `lat`/`lng` keys).
- **Ghost Visit Prevention**: If a source reports `user_visited: false` or `userVisited: false`, clear the `visits` array in the standardizer.
- **Store Serializability**: Zustand state must contain only serializable JSON data. Map SDK instances belong in React refs or external contexts.

---

## 3. Detailed Technical Requirements

### 3.1 Store Consolidation & Slice Architecture
- **[ST-02] Merge Split-Brain Winery Stores**:
  - *Location*: [`lib/stores/wineryStore.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryStore.ts), [`lib/stores/wineryDataStore.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryDataStore.ts)
  - *Problem*: `wineryStore` handles UI selection and filters, while `wineryDataStore` caches wineries with non-reactive getters, leading to UI de-synchronization.
  - *Remediation*: Consolidate into a single canonical `wineryStore.ts` with explicit reactive state and actions; deprecate `wineryDataStore.ts`.
- **[ST-03] Single Source of Truth for Visits**:
  - *Location*: [`components/winery/use-winery-modal-state.ts#L82-L85`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/winery/use-winery-modal-state.ts#L82-L85), [`lib/stores/visitStore.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/visitStore.ts)
  - *Problem*: Visits are stored both in `visitStore.visits` and embedded inside `persistentWineries[].visits`.
  - *Remediation*: Designate `visitStore` as the sole entity store for visits; winery objects reference visit IDs only.
- **[ST-01] Decompose Monolithic Stores into Slices**:
  - *Location*: [`lib/stores/tripStore.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/tripStore.ts) (1,225 lines), [`lib/stores/visitStore.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/visitStore.ts) (656 lines)
  - *Problem*: Massive files mixing offline mutation queueing, REST calls, Realtime channels, and UI dialog states.
  - *Remediation*: Refactor into composable Zustand slices (`createTripDataSlice`, `createTripUISlice`, `createTripRealtimeSlice`) with each file < 300 lines.

### 3.2 Domain Invariants & Standardization
- **[ST-04] Enforce Numeric Relational IDs**:
  - *Location*: Across `lib/stores/`, `lib/types.ts`
  - *Problem*: Mix of `string` and `number` for `trip_id`, `winery_id`, `user_id` causes missed equality matches.
  - *Remediation*: Enforce `Number(id)` on ingress across all store actions and normalize TypeScript interfaces.
- **[ST-05] Enforce `standardizeWineryData` on Map Clicks**:
  - *Location*: [`components/map/map-container.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/map-container.tsx), [`lib/utils/winery.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/utils/winery.ts)
  - *Problem*: Raw map click handlers construct partial winery objects and invoke deprecated `.lat()`/`.lng()` methods.
  - *Remediation*: Route all marker events through `standardizeWineryData` and use `location.latitude`/`location.longitude`.
- **[ST-06] Fix Ghost Visit Purge on camelCase `userVisited: false`**:
  - *Location*: [`lib/utils/winery.ts#L80-L95`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/utils/winery.ts#L80-L95)
  - *Problem*: The standardizer checks snake_case `user_visited: false`, missing converted camelCase `userVisited: false` properties.
  - *Remediation*: Update guard to evaluate `raw.user_visited === false || raw.userVisited === false`, ensuring `visits` is cleared to `[]`.
- **[ST-12] Remove Non-Serializable DOM Map Instances & JSX**:
  - *Location*: [`lib/stores/mapStore.ts#L5`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/mapStore.ts#L5), [`lib/stores/uiStore.ts#L19-L34`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/uiStore.ts#L19-L34)
  - *Problem*: Map instances and `ReactNode` elements stored in state prevent serialization and retain memory.
  - *Remediation*: Move map instances to React refs; store string modal IDs in `uiStore`.

### 3.3 Offline Sync Resilience & Lifecycle Hygiene
- **[ST-08] Optimistic Concurrency Control on Offline Reconnect**:
  - *Location*: [`lib/services/syncService.ts#L173-L297`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/syncService.ts#L173-L297)
  - *Problem*: Blind last-write overwrite without `updated_at` verification overwrites newer remote edits.
  - *Remediation*: Compare `updated_at` timestamps on replay and flag conflicts when remote versions are newer.
- **[ST-09] Exponential Backoff & Dead Letter Queue (DLQ)**:
  - *Location*: [`lib/services/syncService.ts#L112-L115`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/syncService.ts#L112-L115)
  - *Problem*: Rapid retry loop on 503/504 errors; permanent 4xx errors block queue execution indefinitely.
  - *Remediation*: Implement exponential backoff with jitter (1s, 2s, 4s, 8s... max 60s) and route unrecoverable 4xx mutations to an IndexedDB Dead Letter Queue (DLQ).
- **[ST-10] Selector Granularity & `useShallow` Adoption**:
  - *Location*: Across `components/`
  - *Problem*: Components subscribe to entire stores, triggering re-renders on unrelated property changes.
  - *Remediation*: Convert component store subscriptions to fine-grained selectors and `useShallow`.
- **[ST-11] Realtime Channel Unsubscribe on Reset/Logout**:
  - *Location*: [`lib/stores/tripStore.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/tripStore.ts), [`lib/stores/socialStore.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/socialStore.ts)
  - *Problem*: WebSocket channels remain open in memory after user logout.
  - *Remediation*: Ensure `store.reset()` cleans up all active Supabase Realtime channels.
- **[ST-13] Atomic Offline Storage Transaction Wrapping**:
  - *Location*: [`lib/stores/idb-persist-storage.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/idb-persist-storage.ts)
  - *Problem*: Non-atomic write operations risk partial state persistence during abrupt tab closes.
  - *Remediation*: Wrap multi-key persistence in single IndexedDB readwrite transactions.

---

## 4. Acceptance Criteria
- [ ] Only one canonical `wineryStore.ts` exists; `wineryDataStore.ts` is deleted or aliased without duplicate memory storage.
- [ ] `visitStore` is the single source of truth for visits; no duplicate arrays stored in winery caches.
- [ ] Relational IDs across trips, visits, and wineries strictly evaluate as numbers.
- [ ] `standardizeWineryData` correctly clears `visits = []` when passed `userVisited: false` or `user_visited: false`.
- [ ] Zero DOM map instances or React JSX elements are present in Zustand state.
- [ ] Offline sync retry implements exponential backoff and isolates failed 4xx items into a DLQ.
- [ ] Logging out cleanly closes all Supabase Realtime WebSocket connections.
- [ ] Unit test coverage on stores exceeds 85% (`npm test`).

---

## 5. Proposed Phased Implementation Plan

### Phase 1: Winery Store Unification & Domain Invariants
- [ ] Task: Write failing unit tests verifying single winery store reactivity, camelCase ghost visit purge, and numeric ID normalization
- [ ] Task: Merge `wineryDataStore.ts` into canonical `wineryStore.ts` and update consumer components
- [ ] Task: Update `lib/utils/winery.ts` ghost visit guard to support camelCase and remove legacy `.lat()`/`.lng()` calls
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Winery Store Unification & Domain Invariants' (Protocol in workflow.md)

### Phase 2: Trip & Visit Store Slice Decomposition
- [ ] Task: Write unit tests covering `tripStore` and `visitStore` slice boundaries
- [ ] Task: Decompose `tripStore.ts` into discrete slices (`createTripDataSlice`, `createTripUISlice`, `createTripRealtimeSlice`)
- [ ] Task: Decompose `visitStore.ts` and ensure visits are not duplicated inside winery entities
- [ ] Task: Remove map instance and JSX nodes from `mapStore.ts` and `uiStore.ts`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Trip & Visit Store Slice Decomposition' (Protocol in workflow.md)

### Phase 3: Offline Sync Resilience, DLQ & Channel Cleanup
- [ ] Task: Write unit tests for `syncService.ts` simulating 503 retry backoff and 400 Dead Letter Queue routing
- [ ] Task: Implement exponential backoff, DLQ, and atomic IndexedDB transactions in `syncService.ts`
- [ ] Task: Add Realtime channel teardown logic to `store.reset()` across all stores
- [ ] Task: Update component selectors to fine-grained selectors with `useShallow`
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Offline Sync Resilience, DLQ & Channel Cleanup' (Protocol in workflow.md)
