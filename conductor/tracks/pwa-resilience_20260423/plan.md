# Implementation Plan: PWA Resilience & Offline Integrity

### Phase 0: Foundations & Stability (TDD)
- [ ] Task: Surgical Map Store Cleanup (Priority 0)
    - [ ] Remove `selectedTrip` and `setSelectedTrip` from `lib/stores/mapStore.ts`.
    - [ ] Update all components (e.g., `MapControls.tsx`, `WineryMap.tsx`) to use `useTripStore` instead.
    - [ ] Update the `reset` function in `mapStore.ts`.
- [ ] Task: Configure Service Worker Update Policy & Fix Update Loop
    - [ ] Change `skipWaiting: true` to `false` in `app/sw.ts`.
    - [ ] Implement `usePWAUpdate` hook with explicit `controllerchange` guarding and `globalThis._PWA_UPDATING` flag.
- [ ] Task: Validate Hydration Stability & Fix Date Bugs
    - [ ] Wrap all `DragDropContext` uses in a `mounted` state check.
    - [ ] **FIX**: Replace `toISOString().split('T')[0]` with `formatDateLocal()` in `TripPlanner.tsx`.
- [ ] Task: Implement Decoupled Modal Resets (The Modal Reset Rule)
    - [ ] Update `uiStore` to explicitly reset `selectedTrip`, `activeVisitWinery`, and `activeNoteWineryDbId` on modal closure.
- [ ] Task: Enforce ID Normalization
    - [ ] Audit all entity stores (`visitStore`, `tripStore`, `wineryDataStore`) to ensure `Number()` is used for `WineryDbId` conversions.
- [ ] Task: Strengthen E2E Store Bypass (The Nuclear Rule)
    - [ ] Update stores to strictly respect `globalThis._E2E_ENABLE_REAL_SYNC`.
- [ ] Task: Conductor - User Manual Verification 'Phase 0: Foundations & Stability'

### Phase 1: Cryptographic Foundation & Reconstitution (TDD)
- [ ] Task: Implement Hardened Web Crypto Wrapper
    - [ ] Create `lib/utils/crypto.ts` for AES-GCM encryption with PBKDF2 key derivation from `user.id`.
- [ ] Task: Implement Binary Reconstitution Utilities (The Reconstitution Rule)
    - [ ] Create `lib/utils/binary.ts` with `fileToBase64` and `base64ToFile`.
    - [ ] Write unit tests verifying WebKit-compliant photo storage (Base64 -> File).
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Cryptographic Foundation'

### Phase 2: Offline Mutation Queue (TDD)
- [ ] Task: Create `SyncStore` (Zustand)
    - [ ] Create `lib/stores/syncStore.ts` using `idb-keyval` and the crypto wrapper.
- [ ] Task: Implement Centralized `SyncService` with Concurrency Locking
    - [ ] Create `lib/services/syncService.ts` with "Upload First" replay logic.
    - [ ] Implement an atomic `isSyncing` flag to prevent duplicate sync triggers.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Offline Mutation Queue'

### Phase 3: Store Integration & Photo Reconstitution (TDD)
- [ ] Task: Integrate `SyncService` into Entity Stores
    - [ ] Refactor stores to utilize `SyncService` for all mutations.
- [ ] Task: Implement Photo Reconstitution in Uploader
    - [ ] Update `PhotoUploader.tsx` to use `binary.ts` (Base64 storage) for offline photos.
- [ ] Task: Visual Sync Indicators
    - [ ] Update cards to show `opacity-50` and "Pending" badges for items with `syncStatus === 'pending'`.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Store Integration'

### Phase 4: Quota Management & Verification (TDD)
- [ ] Task: Implement Proactive Quota Cleanup (The Quota Resilience Rule)
    - [ ] Update `sw.ts` to include a `storage.estimate` listener and 80% usage threshold trigger.
- [ ] Task: Final E2E Validation
    - [ ] Create `e2e/pwa-resilience.spec.ts` covering offline visit creation, photo reconstitution, and queue persistence.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Verification'
