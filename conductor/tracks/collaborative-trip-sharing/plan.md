# Plan: Track collaborative-trip-sharing - Collaborative Trip UI & Sharing

## Phase 1: Share UI & Invitation Logic
Objective: Allow users to invite friends to a trip.

- [x] Task 1: Create a `TripShareDialog` component using Radix/shadcn `Dialog`. (b873faa)
- [x] Task 2: Implement a friend selection list inside the dialog (pulling from `friendStore`). (69f57a3)
- [x] Task 3: Add an email invitation input for adding members not yet in the friend list. (eb929f8)
- [x] Task 4: Connect the "Invite" button to `TripService.addMemberByEmail` (calls `add_trip_member_by_email` RPC). (7275a69)
- [ ] Task 5: Add a "Share" button trigger to the `TripCard` and `TripPlanner` header.

## Phase 2: Collaborative Trip Views
Objective: Visualize members and their contributions.

- [ ] Task 1: Update `TripCard` to display a row of member avatars.
- [ ] Task 2: Update `TripPlanner` header to show member avatars and a "Manage Members" button.
- [ ] Task 3: Implement a `TripMembersList` component to display all participants with their roles.
- [ ] Task 4: Ensure `get_trip_details` data is correctly hydrated into `tripStore` for all members.

## Phase 3: Real-time & Synchronization
Objective: Keep the UI in sync across members.

- [ ] Task 1: Implement Supabase Realtime subscription in `tripStore.ts` for the `trip_members` table.
- [ ] Task 2: Implement Supabase Realtime subscription in `tripStore.ts` for the `trip_wineries` table.
- [ ] Task 3: Add optimistic updates to `addMembersToTrip` in `tripStore.ts`.
- [ ] Task 4: Add optimistic updates for itinerary changes (reordering wineries, updating notes) that sync via Realtime.

## Phase 4: Permissions & Validation
Objective: Secure the collaborative experience and verify functionality.

- [ ] Task 1: Update `TripCard` and `TripPlanner` UI to disable edit controls for non-authorized users.
- [ ] Task 2: Add E2E tests for the "Invite Friend" flow (`e2e/trip-management.spec.ts`).
- [ ] Task 3: Add E2E tests for "Collaborative Editing" between two users.
- [ ] Task 4: Verify RLS security by attempting unauthorized RPC calls from a non-member account.
