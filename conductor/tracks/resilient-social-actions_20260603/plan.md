# Implementation Plan: Resilient Social Actions

### Phase 0: Infrastructure & Idempotency [checkpoint: 6e306d9]
- [x] **Task: Add Idempotency Columns to Schema** [18169be]
    - [x] Create a database migration to add `idempotency_key` (UUID) with a `UNIQUE` constraint to `public.visits` and `public.trips`.
- [x] **Task: Update Database Write RPCs** [bf06825]
    - [x] Update `public.log_visit` to accept `p_idempotency_key` (UUID). In the insert block, handle uniqueness conflicts: check if the key already exists and, if so, return the existing visit ID and winery ID.
    - [x] Update `public.update_visit` to accept `p_idempotency_key` (UUID). If the key already exists, return the updated record directly.
    - [x] Update `public.create_trip` and `public.create_trip_with_winery` to accept `p_idempotency_key` (UUID). Check if the key already exists and, if so, return the existing trip ID and associated information.
    - [x] Regenerate database types: `npm run db:gen-types`.

### Phase 1: Asynchronous Side-Effects (Edge Functions & Webhooks) [checkpoint: 6641741]
- [x] **Task: Implement AI Gemini Summary Edge Function** [b138b83]
    - [x] Create `supabase/functions/update-gemini-summary` to process webhook payloads, extract detailed reviews, generate summaries via Gemini API (using a cache-first 30-day check), and update `public.wineries`.
    - [x] Write unit tests for the summary Edge Function.
- [x] **Task: Configure Gemini Update Database Webhook** [6b195f6]
    - [x] Create a database webhook on `public.visits` AFTER INSERT OR UPDATE.
    - [x] Set filter conditions to only fire when `user_review` is not null and `length(user_review) > 100`.
- [x] **Task: Implement Social Notification Edge Function** [768b020]
    - [x] Create `supabase/functions/send-social-notification` to process webhook payloads from `public.activity_ledger`.
    - [x] Enforce privacy checks inside the function using `is_visible_to_viewer` and send notifications (badges, push notifications) to friends.
    - [x] Write unit tests for the notification Edge Function.
- [x] **Task: Configure Social Notification Database Webhook** [877e1c2]
    - [x] Create a database webhook on `public.activity_ledger` AFTER INSERT to trigger `send-social-notification` asynchronously.

### Phase 2: Client-Side PWA Resilience
- [x] **Task: Implement Image Compression** [1198a9c]
    - [ ] Create `lib/utils/image.ts` to compress and resize photos (max 2048px on long edge) client-side using browser Canvas APIs before Base64 serialization.
- [x] **Task: Update Store Actions and Payload Idempotency** [688488b]
    - [ ] Generate a UUID `idempotencyKey` at the start of `saveVisit`, `updateVisit`, and `createTrip` actions.
    - [ ] Pass `idempotencyKey` directly to direct online RPC invocations.
    - [ ] Update `useSyncStore.addMutation` to accept an optional `id` parameter so that `SyncItem.id` can be set to the client-generated `idempotencyKey`.
    - [ ] Update `SyncService.ts` to call the updated RPCs with `item.id` as the `idempotency_key` parameter.
- [x] **Task: Implement IndexedDB Quota Safeguards** [9482270]
    - [ ] Intercept quota errors inside `idbStorage.setItem` and `syncStore.ts`'s `persistToIdb`.
    - [ ] Run `checkAndCleanupQuota(0.8)` on failure and retry the write once.
    - [ ] Dispatch a `quota-exceeded-warning` custom event to `window` if the write continues to fail.
- [ ] **Task: Decouple Quota Warnings to Toast UI**
    - [ ] Set up a listener for the `quota-exceeded-warning` custom event inside `components/pwa-handler.tsx`.
    - [ ] Trigger a Shadcn toast warning notification when the event fires, advising the user that offline changes cannot be saved.
- [ ] **Task: Secure Logout Store Reset**
    - [ ] Update `useUserStore.logout` to first await the asynchronous `useSyncStore.getState().reset()` call to guarantee deletion of the IndexedDB offline queue.
    - [ ] Reset all other 8 Zustand stores (`useVisitStore`, `useTripStore`, `useFriendStore`, `useWineryStore`, `useWineryDataStore`, `useMapStore`, `useUIStore`, and `useUserStore` itself) immediately after.

### Phase 3: Verification & Testing
- [ ] **Task: E2E Test Suite Verification**
    - [ ] Update E2E mocks in `e2e/utils.ts` to reflect the updated RPC contracts (accepting `idempotency_key`).
    - [ ] Run `visit-flow.spec.ts` and `trip-flow.spec.ts` in the E2E container simulating offline sync.

## Phase: Review Fixes
- [x] Task: Apply review suggestions [b1485a5]

