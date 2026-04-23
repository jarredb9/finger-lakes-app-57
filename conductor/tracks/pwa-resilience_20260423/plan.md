# Implementation Plan: PWA Resilience & Offline Integrity

### Phase 0: Foundations & Stability (TDD)
- [ ] Task: Configure Service Worker Update Policy & Fix Update Loop
    - [ ] Change `skipWaiting: true` to `false` in `app/sw.ts`.
    - [ ] Implement `usePWAUpdate` hook with explicit `controllerchange` guarding and `globalThis._PWA_UPDATING` flag to stop the popup loop.
    - [ ] Implement "Graceful Transition" messaging in SW to notify clients before reload.
- [ ] Task: Validate Hydration Stability & Fix Date Bugs
    - [ ] Verify all `DragDropContext` uses (e.g., `TripCardPresentational.tsx`, `TripListPresentational.tsx`) are wrapped in a `mounted` state check.
    - [ ] **FIX**: Replace `toISOString().split('T')[0]` with `formatDateLocal()` in `TripPlanner.tsx` (Direct violation of Local Date Stability Rule).
- [ ] Task: Implement Decoupled Modal Resets
    - [ ] Update `uiStore` to support an `onClose` callback registry to decouple UI state from feature logic.
    - [ ] **ORCHESTRATION**: Ensure `useTripStore.getState().setSelectedTrip(null)` is registered on trip-related modal closure to prevent stale UI flashes.
- [ ] Task: Enforce ID Normalization
    - [ ] Audit `visitStore.ts`, `tripStore.ts`, and `wineryDataStore.ts` to ensure `Number()` is used for all `WineryDbId` conversions during fetch/ingestion.
- [ ] Task: Accessibility Audit (axe-core)
    - [ ] Run `axe-core` via `browser_eval` on main routes (Explore, Trips, History).
    - [ ] Add `aria-label` to all identified icon-only buttons in `WineryMap.tsx`, `WineryActionsPresentational.tsx`, and `winery-card-thumbnail.tsx`.
    - [ ] **FIX**: Update `Pagination` in `TripListPresentational.tsx` to use accessible `Button` primitives instead of `href="#"`.
- [ ] Task: Strengthen E2E Store Bypass (The Nuclear Rule)
    - [ ] Update `wineryDataStore`, `visitStore`, and `tripStore` to strictly respect `globalThis._E2E_ENABLE_REAL_SYNC` and provide reliable fallback mocks in E2E mode.
- [ ] Task: Conductor - User Manual Verification 'Phase 0: Foundations & Stability' (Protocol in workflow.md)

### Phase 1: Cryptographic Foundation (TDD)
- [ ] Task: Implement Hardened Web Crypto Wrapper
    - [ ] Create `lib/utils/crypto.ts` for AES-GCM encryption/decryption.
    - [ ] Write unit tests for encrypting/decrypting JSON payloads.
    - [ ] **SECURITY**: Implement secure key derivation (PBKDF2) using `user.id`, a salt, and **100,000 iterations** to protect data-at-rest.
- [ ] Task: Implement Reconstitution Utilities
    - [ ] Create `lib/utils/binary.ts` with `fileToBase64` and `base64ToFile` (returning a proper `File` object for network compatibility).
    - [ ] Write unit tests for converting large image blobs to strings and back.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Cryptographic Foundation' (Protocol in workflow.md)

### Phase 2: Offline Mutation Queue (TDD)
- [ ] Task: Create `SyncStore` (Zustand)
    - [ ] Create `lib/stores/syncStore.ts` using `idb-keyval` and the crypto wrapper for persistence.
    - [ ] Write failing test for storing a mutation in an encrypted state.
    - [ ] Implement `addMutation` and `getPendingMutations` with AES encryption and reactive status (pending count).
- [ ] Task: Implement Centralized `SyncService` with Concurrency Locking
    - [ ] Create `lib/services/syncService.ts`.
    - [ ] Write failing test for the "Upload First" replay logic.
    - [ ] **LOCKING**: Implement an atomic `isSyncing` flag/lock to prevent duplicate sync triggers from simultaneous `online` and `focus` events.
    - [ ] Implement error classification: **Transient** (Network/5xx) vs **Permanent** (403/404/Validation).
    - [ ] Implement exponential backoff for transient errors and queue drainage logic.
    - [ ] Integrate with `navigator.serviceWorker.ready` and `registration.sync` for Background Sync where supported.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Offline Mutation Queue' (Protocol in workflow.md)

### Phase 3: Store Integration & Photo Reconstitution (TDD)
- [ ] Task: Integrate `SyncService` into Entity Stores
    - [ ] Refactor `wineryDataStore`, `visitStore`, and `tripStore` to utilize `SyncService` for all mutations.
    - [ ] Write failing test for offline visit creation.
    - [ ] Implement optimistic UI updates that reflect pending local mutations via `SyncStore` state.
- [ ] Task: Implement Photo Reconstitution in Uploader
    - [ ] Update `PhotoUploader.tsx` to use `binary.ts` for offline storage.
    - [ ] Write failing E2E test for offline photo upload verification.
    - [ ] Implement automatic Base64-to-File reconstitution during sync replay.
- [ ] Task: Visual Sync Indicators
    - [ ] Update `TripCardPresentational.tsx` and `VisitCardHistory.tsx` to show `opacity-50` and a "Pending" badge for items with `syncStatus === 'pending'`.
    - [ ] Show an "Error" indicator with a retry button for `syncStatus === 'error'`.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Store Integration & Photo Reconstitution' (Protocol in workflow.md)

### Phase 4: Quota Management & Verification (TDD)
- [ ] Task: Implement Proactive Quota Cleanup
    - [ ] Update `sw.ts` to include a `storage.estimate` listener.
    - [ ] Write unit test for the 80% usage threshold trigger.
    - [ ] Implement silent `google-maps-tiles` cache deletion when quota is pressured.
- [ ] Task: Final E2E Validation
    - [ ] Write exhaustive E2E tests in `e2e/pwa-resilience.spec.ts` covering:
        - [ ] Offline Visit creation with photo.
        - [ ] Update UX toast and navigation refresh.
        - [ ] Quota cleanup trigger (mocked).
        - [ ] Queue persistence across browser restarts.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Quota Management & Verification' (Protocol in workflow.md)
