# Implementation Plan: Resilient Social Actions

### Phase 0: Infrastructure & Idempotency
- [ ] **Task: Add Idempotency Columns to Schema**
    - [ ] Create a database migration to add `idempotency_key` (UUID) with a `UNIQUE` constraint to `public.visits` and `public.trips`.
- [ ] **Task: Update Database Write RPCs**
    - [ ] Update `public.log_visit` to accept `p_idempotency_key` (UUID). In the insert block, handle uniqueness conflicts: on conflict return the existing visit ID and winery ID.
    - [ ] Update `public.update_visit` to accept `p_idempotency_key` (UUID).
    - [ ] Update `public.create_trip` and `public.create_trip_with_winery` to accept `p_idempotency_key` (UUID) and handle uniqueness conflicts.
    - [ ] Regenerate database types: `npm run db:gen-types`.

### Phase 1: Asynchronous Side-Effects (Edge Functions & Webhooks)
- [ ] **Task: Implement AI Gemini Summary Edge Function**
    - [ ] Create `supabase/functions/update-gemini-summary` to process webhook payloads, extract detailed reviews, generate summaries via Gemini API, and update `public.wineries`.
    - [ ] Write unit tests for the summary Edge Function.
- [ ] **Task: Configure Gemini Update Database Webhook**
    - [ ] Create a database webhook on `public.visits` AFTER INSERT OR UPDATE.
    - [ ] Set filter conditions to only fire when `user_review` is not null and `length(user_review) > 100`.
- [ ] **Task: Implement Social Notification Edge Function**
    - [ ] Create `supabase/functions/send-social-notification` to process webhook payloads from `public.activity_ledger`.
    - [ ] Enforce privacy checks inside the function using `is_visible_to_viewer` and send notifications (badges, push notifications) to friends.
    - [ ] Write unit tests for the notification Edge Function.
- [ ] **Task: Configure Social Notification Database Webhook**
    - [ ] Create a database webhook on `public.activity_ledger` AFTER INSERT to trigger `send-social-notification` asynchronously.

### Phase 2: Client-Side PWA Resilience
- [ ] **Task: Implement Image Compression**
    - [ ] Create `utils/image.ts` to compress and resize photos (max 2048px) client-side before Base64 serialization.
- [ ] **Task: Update Sync Store and Payload Idempotency**
    - [ ] Ensure that when enqueueing mutations offline, the client passes `SyncItem.id` as the `idempotency_key` in the payload.
    - [ ] Update `SyncService.ts` to call the updated RPCs with the `idempotency_key`.
    - [ ] Retain and verify photo-to-Base64 serialization in the offline queue, uploading to Supabase Storage before calling the RPC.
- [ ] **Task: Implement IndexedDB Quota Safeguards**
    - [ ] Wrap Zustand persistent storage and `syncStore` queue writes in try/catch blocks; handle `QuotaExceededError` by calling cache cleanup (`checkAndCleanupQuota(0.8)`).
    - [ ] Trigger a UI toast notification warning if storage space remains insufficient to save offline changes.
- [ ] **Task: Secure Logout Store Reset**
    - [ ] Update `useUserStore.logout` to reset all Zustand stores: `useSyncStore`, `useVisitStore`, `useTripStore`, `useFriendStore`, `useWineryStore`, `useWineryDataStore`, `useMapStore`, and `useUIStore`.
    - [ ] Explicitly await the asynchronous `await useSyncStore.getState().reset()` call in the logout process to guarantee deletion of the IndexedDB offline queue.

### Phase 3: Verification & Testing
- [ ] **Task: E2E Test Suite Verification**
    - [ ] Update E2E mocks in `e2e/utils.ts` to reflect the updated RPC contracts (accepting `idempotency_key`).
    - [ ] Run `visit-flow.spec.ts` and `trip-flow.spec.ts` in the E2E container simulating offline sync.
