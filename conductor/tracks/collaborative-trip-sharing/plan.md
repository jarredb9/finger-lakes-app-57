# Plan: Track collaborative-trip-sharing - Collaborative Trip UI & Sharing

## Phase 1: Share UI & Invitation Logic
Objective: Allow users to invite friends to a trip.

- [x] Task 1: Create a `TripShareDialog` component using Radix/shadcn `Dialog`. (b873faa)
- [x] Task 2: Implement a friend selection list inside the dialog (pulling from `friendStore`). (69f57a3)
- [x] Task 3: Add an email invitation input for adding members not yet in the friend list. (eb929f8)
- [x] Task 4: Connect the "Invite" button to `TripService.addMemberByEmail` (calls `add_trip_member_by_email` RPC). (7275a69)
- [x] Task 5: Add a "Share" button trigger to the `TripCard` and `TripPlanner` header. (4719822)

## Phase 1.5: Architectural Cleanup & Stability
Objective: Harden the sharing flow for E2E reliability and eliminate hydration bugs.

- [x] Task 1: Refactor `uiStore.ts` to remove UI visibility flags (`isShareDialogOpen`, etc.) from persistence. **Verification:** Confirm dialog state does not survive page reload.
- [x] Task 2: Move `TripShareDialogWrapper` and other root-level singletons in `app/layout.tsx` outside of the `AuthProvider`'s loading boundary. **Verification:** Dialog remains visible during "Loading..." flashes.
- [x] Task 3: Standardize the invitation button state to ensure the loading spinner is detectable by Playwright without unmounting the parent.
- [x] Task 4: Refactor `TripCard.test.tsx` to verify global store triggers for the sharing dialog instead of local DOM elements. (fc89a21)
- [x] Task 5: Sync `friendStore.ts` with updated `get_friends_and_requests` RPC return keys (`pending_incoming`/`pending_outgoing`) to restore social E2E reliability. (d3e12a4)

## Phase 1.6: System Hardening & Reactivity
Objective: Align the codebase with the project's architectural mandates before implementing real-time features.

- [x] Task 1: Remove `selectedTrip` from `tripStore.ts` persistence to prevent "Dead ID" bugs. **Verification:** Confirm active trip is cleared on reload. (fff3b60)
- [x] Task 2: Refactor `TripPlannerSection.tsx` to use direct state subscriptions for `tripsForDate` instead of getter functions. **Verification:** Confirm UI re-renders when store updates. (00c8cc7)
- [x] Task 3: Move `VisitForm` and `WineryNoteEditor` triggers in `TripCard.tsx` to the `useUIStore` singleton pattern. **Verification:** Confirm only one modal instance exists in DOM. (07d65dc)
- [x] Task 4: Audit `is_trip_member` usage in all migrations and ensure explicit `public.` schema prefixing for security. (6294a60)
- [x] Task 5: Update `e2e/smoke.spec.ts` to use robust multi-option selectors from `helpers.ts`. **Verification:** Pass smoke test in WebKit. (51d5c21)
- [x] Task 6: Update `login` helper in `e2e/helpers.ts` to include `useTripStore` in the mandatory hydration guard. **Verification:** Login fails if tripStore fails to hydrate. (51d5c21)
- [x] Task 7: Implement `new File()` reconstitution logic in `visitStore.ts` (`syncOfflineVisits`) to handle Base64 photo uploads. **Verification:** Successfully sync an offline visit with photos. (51d5c21)
- [x] Task 8: Remove legacy `members?: string[]` field from the `Trip` interface in `lib/types.ts`. **Verification:** Zero "members" references found in codebase via grep. (51d5c21)

## Phase 2: Collaborative Trip Views
Objective: Visualize members and their contributions.

- [x] Task 1: Update `TripCardSimple` and `TripCard` to display a row of member avatars. **Verification:** Confirm avatars appear in both sidebar and detail view in browser. (afae40e)
- [x] Task 2: Update `TripCard` (detail view) header to show member avatars and a "Manage Members" button. **Verification:** Button is clickable and correctly targets the singleton dialog. (9245a4a)
- [x] Task 3: Implement a `TripMembersList` component to display all participants with their roles. **Verification:** Correctly distinguish between Owner/Member roles in UI. (0000001)
- [x] Task 4: Ensure `get_trip_details` data is correctly hydrated into `tripStore` for all members. **Verification:** Inspect store state via `page.evaluate` in Playwright. (afae40e)

## Phase 3: Real-time & Synchronization
Objective: Keep the UI in sync across members.

- [x] Task 1: Implement Supabase Realtime subscription in `tripStore.ts` for the `trip_members` table. **Verification:** Change data in DB and confirm UI updates without reload. (439eaa8)
- [x] Task 2: Implement Supabase Realtime subscription in `tripStore.ts` for the `trip_wineries` table. **Verification:** Add winery to trip and confirm it appears for other members instantly. (439eaa8)
- [x] Task 3: Add optimistic updates to `addMembersToTrip` in `tripStore.ts`. **Verification:** UI reflects change before RPC returns. (439eaa8)
- [x] Task 4: Add optimistic updates for itinerary changes (reordering wineries, updating notes) that sync via Realtime. **Verification:** Simultaneous editing results in zero lost updates. (439eaa8)

## Phase 4: Permissions & Validation
Objective: Secure the collaborative experience and verify functionality.

- [x] Task 1: Update `TripCard` and `TripPlanner` UI to disable edit controls for non-authorized users. **Verification:** Log in as non-member and confirm "Edit" buttons are hidden/disabled. (439eaa8)
- [ ] Task 2: Add E2E tests for the "Invite Friend" flow (`e2e/trip-sharing.spec.ts`). **Verification:** Full pass on Chromium and WebKit.
- [ ] Task 3: Add E2E tests for "Collaborative Editing" between two users. **Verification:** Pass using multi-context Playwright tests.
- [ ] Task 4: Verify RLS security by attempting unauthorized RPC calls from a non-member account. **Verification:** Confirm 403/Access Denied errors in console logs.
