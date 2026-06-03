# Implementation Plan: Resilient Social Actions Migration

## Phase 0: Infrastructure & Shared Logic (Backend)
- [ ] Task: Extend Shared Normalization Utility
    - [ ] Update `@supabase/functions/_shared/normalization.ts` to support user-submitted winery data.
- [ ] Task: Create Activity & Privacy Helpers (Deno)
    - [ ] Create `@supabase/functions/_shared/privacy.ts` to encapsulate `is_visible_to_viewer` logic for social triggers.

## Phase 1: Visit Migration (`log-visit`)
- [ ] Task: Implement `log-visit` Edge Function (Red)
    - [ ] Write Deno tests for visit logging and data normalization.
- [ ] Task: Implement `log-visit` Edge Function (Green)
    - [ ] Implement the handler calling the existing `log_visit` RPC via service role.
- [ ] Task: Implement Gemini Summary Trigger
    - [ ] Add background orchestration to call Gemini API if review length > 100 chars.

## Phase 2: Trip Migration (`manage-trips`)
- [ ] Task: Implement `manage-trips` Edge Function (Red)
    - [ ] Write Deno tests for trip creation and winery association.
- [ ] Task: Implement `manage-trips` Edge Function (Green)
    - [ ] Implement consolidated handler for `create_trip` and `add_winery_to_trip`.

## Phase 3: Privacy-Aware Social Notifications
- [ ] Task: Implement Social Notification Logic (Red)
    - [ ] Write tests ensuring private visits do NOT trigger notifications.
- [ ] Task: Implement Social Notification Logic (Green)
    - [ ] Integrate privacy-checked activity ledger entries into the `log-visit` flow.

## Phase 4: Frontend Integration & Resilience
- [ ] Task: Refactor `visitStore` to use Edge Functions
    - [ ] Replace `supabase.rpc('log_visit')` with `invokeFunction('log-visit')`.
- [ ] Task: Refactor `tripStore` to use Edge Functions
    - [ ] Replace trip creation RPCs with `invokeFunction('manage-trips')`.
- [ ] Task: Verify Offline Queueing
    - [ ] Manual verification that actions are queued in `idb-keyval` when offline.

## Phase 5: Finalization & Verification
- [ ] Task: Cross-Browser E2E Verification
    - [ ] Run `visit-flow.spec.ts` and `trip-flow.spec.ts` in the E2E container.
- [ ] Task: Conductor - User Manual Verification 'Social Actions Migration' (Protocol in workflow.md)
