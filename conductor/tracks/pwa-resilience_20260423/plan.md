# Implementation Plan: PWA Resilience & Offline Integrity

### Phase 0: Foundations & Stability (TDD)
- [x] Task: Surgical Map Store Cleanup (Priority 0) 71d543d
    - [x] Remove `selectedTrip` and `setSelectedTrip` from `lib/stores/mapStore.ts`.
    - [x] Update all components (e.g., `MapControls.tsx`, `WineryMap.tsx`) to use `useTripStore` instead.
    - [x] Update the `reset` function in `mapStore.ts`.
- [x] Task: Configure Service Worker Update Policy & Fix Update Loop 71d543d
    - [x] Change `skipWaiting: true` to `false` in `app/sw.ts`.
    - [x] Implement `usePWAUpdate` hook with explicit `controllerchange` guarding and `globalThis._PWA_UPDATING` flag.
- [x] Task: Validate Hydration Stability & Fix Date Bugs 71d543d
    - [x] Wrap all `DragDropContext` uses in a `mounted` state check.
    - [x] **FIX**: Replace `toISOString().split('T')[0]` with `formatDateLocal()` in `TripPlanner.tsx`.
- [x] Task: Implement Decoupled Modal Resets (The Modal Reset Rule) 71d543d
    - [x] Update `uiStore` to explicitly reset `selectedTrip`, `activeVisitWinery`, and `activeNoteWineryDbId` on modal closure.
- [x] Task: Enforce ID Normalization 71d543d
    - [x] Audit all entity stores (`visitStore`, `tripStore`, `wineryDataStore`) to ensure `Number()` is used for `WineryDbId` conversions.
- [x] Task: Strengthen E2E Store Bypass (The Nuclear Rule) 6a3f8ee
    - [x] Update stores to strictly respect `globalThis._E2E_ENABLE_REAL_SYNC`.
- [X] Task: Conductor - User Manual Verification 'Phase 0: Foundations & Stability' (45fd614371f187668e5a22a7e52e4cc23192e8d2)

### Phase 1: Cryptographic Foundation & Reconstitution (TDD) [checkpoint: 78afad4]
- [x] Task: Implement Hardened Web Crypto Wrapper 6743724
    - [x] Create `lib/utils/crypto.ts` for AES-GCM encryption with PBKDF2 key derivation from `user.id`.
- [x] Task: Implement Binary Reconstitution Utilities (The Reconstitution Rule) 274fdf8
    - [x] Create `lib/utils/binary.ts` with `fileToBase64` and `base64ToFile`.
    - [x] Write unit tests verifying WebKit-compliant photo storage (Base64 -> File).
- [x] Task: Conductor - User Manual Verification 'Phase 1: Cryptographic Foundation' 78afad4

### Phase 2: Offline Mutation Queue (TDD) [checkpoint: b041c2a]
- [x] Task: Create `SyncStore` (Zustand) 1fac701
    - [x] Create `lib/stores/syncStore.ts` using `idb-keyval` and the crypto wrapper.
- [x] Task: Implement Centralized `SyncService` with Concurrency Locking b70b233
    - [x] Create `lib/services/syncService.ts` with "Upload First" replay logic.
    - [x] Implement an atomic `isSyncing` flag to prevent duplicate sync triggers.
- [x] Task: Infrastructure Verification (E2E)
    - [x] Create `e2e/sync-infrastructure.spec.ts` to verify encrypted persistence and auto-sync triggers.
    - [x] Verify reload/hydration stability in containerized environment.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Offline Mutation Queue' 4650988

### Phase 3: Store Integration & Photo Reconstitution (TDD)
- [x] Task: Establish Sync Helpers for Binary Data (2e69439/6c03d3c) 
    - [x] Create `lib/utils/sync-helpers.ts` to centralize photo stabilization (Blob -> Base64) and reconstitution (Base64 -> File) for the encrypted queue.
- [x] Task: Integrate `SyncService` into Entity Stores f7862e8
    - [x] Refactor stores to utilize `SyncService` for all mutations.
    - [x] Resolve build and type errors in entity stores and tests.
    - [x] Verify encryption and decryption in e2e/sync-infrastructure.spec.ts.
- [x] Task: Conductor - User Manual Verification 'Phase 3: Store Integration' f7862e8
- [x] Task: Implement Photo Reconstitution in Uploader 640a59a
    - [x] Update `PhotoUploader.tsx` to use `binary.ts` (Base64 storage) for offline photos.
- [x] Task: Visual Sync Indicators 1d76a80
    - [x] Update cards to show `opacity-50` and "Pending" badges for items with `syncStatus === 'pending'`.


### Phase 4: Quota Management & Verification (TDD)
- [ ] Task: Implement Proactive Quota Cleanup (The Quota Resilience Rule)
    - [ ] Update `sw.ts` to include a `storage.estimate` listener and 80% usage threshold trigger.
- [ ] Task: Final E2E Validation
    - [ ] Create `e2e/pwa-resilience.spec.ts` covering offline visit creation, photo reconstitution, and queue persistence.
    - [ ] **MANDATORY**: Merge logic from `e2e/pwa-sync-deep.spec.ts` (multiple photos + reconstitution) into this final spec.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Verification'

## Phase: Review Fixes
- [x] Task: Apply review suggestions 6ac8f57
- [x] Task: Normalize string quotes in usePWAUpdate 683eed0
- [x] Task: E2E Stabilization (Hydration & Real-Sync Persistence) 154af76
- [x] Task: Mock window.location.reload in usePWAUpdate for cleaner tests eac1d88
- [x] Task: Apply Phase 2 review suggestions (Indentation & ID standard) 003dbad
- [x] Task: Refactor Deep Sync test for hydration stability & update Phase 4 merge mandate
- [x] Task: Trigger SyncService on initialization if online f7862e8
    - [x] Implemented in app-shell.tsx to trigger on mount and when online event fires.
- [x] Task: Apply Phase 3 review suggestions (TypeScript & E2E fixes) 8f0b864
