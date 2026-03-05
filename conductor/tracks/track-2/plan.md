# Plan: Track 2 - Collaborative Trip UI & Sharing

## Phase 1: Share UI & Invitation Logic
Objective: Allow users to invite friends to a trip.

- [ ] Task 1: Create a `TripShareDialog` component using Radix/shadcn `Dialog`.
- [ ] Task 2: Implement a friend search/selection list inside the dialog.
- [ ] Task 3: Connect the "Invite" button to the `add_trip_member_by_email` RPC.
- [ ] Task 4: Add a "Share" button to the `TripCard` and `TripPlanner` header.

## Phase 2: Collaborative Trip Views
Objective: Visualize members and their contributions.

- [ ] Task 1: Update `TripCard` and `TripPlanner` to display avatars of all members (using the `members` data from `get_trip_details`).
- [ ] Task 2: Implement a "Members List" in the `TripPlanner` sidebar showing member roles.
- [ ] Task 3: Ensure `TripPlanner` updates (winery reordering, notes) work correctly for all members.

## Phase 3: Real-time & Synchronization
Objective: Keep the UI in sync across members.

- [ ] Task 1: Enable Supabase Realtime subscriptions for the `trip_members` and `trip_wineries` tables in `tripStore.ts`.
- [ ] Task 2: Implement optimistic updates for member additions/removals.
- [ ] Task 3: Validate that "Viewer" roles cannot modify the trip itinerary.

## Phase 4: Validation
- [ ] Task 1: Add E2E tests for the "Invite Friend" flow.
- [ ] Task 2: Add E2E tests for "Collaborative Editing" (two users editing the same trip).
- [ ] Task 3: Verify RLS security by attempting unauthorized edits from a non-member account.
