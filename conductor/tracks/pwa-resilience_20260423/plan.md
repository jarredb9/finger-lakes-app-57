# Implementation Plan: PWA Resilience & Offline Integrity

### Phase 0: Foundations & Stability (TDD)
- [ ] Task: Configure Service Worker Update Policy & Fix Update Loop
    - [ ] Change `skipWaiting: true` to `false` in `app/sw.ts`.
    - [ ] Implement `usePWAUpdate` hook with explicit `controllerchange` guarding to stop the popup loop.
- [ ] Task: Audit Hydration Stability (The DnD Rule)
    - [ ] Verify all `DragDropContext` uses are wrapped in a `mounted` state check.
    - [ ] Fix any components causing hydration mismatches in Next.js 16.
- [ ] Task: Implement The Modal Reset Rule
    - [ ] Update `useUIStore` and feature stores to explicitly nullify state (e.g., `activeVisitWinery`) on "Close" actions.
- [ ] Task: Strengthen E2E Store Bypass (The Nuclear Rule)
    - [ ] Update `wineryDataStore` and `visitStore` to strictly respect `globalThis._E2E_ENABLE_REAL_SYNC` and provide reliable fallback mocks in E2E mode.
- [ ] Task: Conductor - User Manual Verification 'Phase 0: Foundations & Stability' (Protocol in workflow.md)

### Phase 1: Cryptographic Foundation (TDD)
- [ ] Task: Implement Web Crypto Wrapper
    - [ ] Create `lib/utils/crypto.ts` for AES-GCM encryption/decryption.
    - [ ] Write unit tests for encrypting/decrypting JSON payloads.
    - [ ] Implement secure key derivation from user session/UID.
- [ ] Task: Implement Reconstitution Utilities
    - [ ] Create `lib/utils/binary.ts` with `fileToBase64` and `base64ToFile`.
    - [ ] Write unit tests for converting large image blobs to strings and back.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Cryptographic Foundation' (Protocol in workflow.md)

### Phase 2: Offline Mutation Queue (TDD)
- [ ] Task: Implement `MutationStore` with Encryption
    - [ ] Create `lib/stores/syncStore.ts` using `idb-keyval` for persistence.
    - [ ] Write failing test for storing a mutation in an encrypted state.
    - [ ] Implement `addMutation` and `getPendingMutations` with AES encryption.
- [ ] Task: Implement Sync Bridge Logic
    - [ ] Create `lib/services/syncService.ts`.
    - [ ] Write failing test for the "Upload First" replay logic.
    - [ ] Implement queue drainage logic that replays mutations to Supabase RPCs.
    - [ ] Implement network status listeners (online/offline) and background sync triggers.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Offline Mutation Queue' (Protocol in workflow.md)

### Phase 3: Store Integration & Photo Reconstitution (TDD)
- [ ] Task: Integrate Sync Bridge into Entity Stores
    - [ ] Refactor `wineryDataStore` and `visitStore` to use the `syncStore` when offline.
    - [ ] Write failing test for offline visit creation.
    - [ ] Implement optimistic UI updates that reflect pending local mutations.
- [ ] Task: Implement Photo Reconstitution in Uploader
    - [ ] Update `PhotoUploader.tsx` to use `binary.ts` for offline storage.
    - [ ] Write failing E2E test for offline photo upload verification.
    - [ ] Implement automatic Base64-to-File reconstitution during sync replay.
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
