# Plan: Track social-visit-tagging - Social Visit Tagging & Shared History

## Phase 1: Visit Tagging UI & Logic
Objective: Allow users to tag friends in visits.

- [ ] Task 1: Create a `FriendPicker` component (reusable for tagging).
- [ ] Task 2: Integrate `FriendPicker` into the `VisitForm` modal.
- [ ] Task 3: Update `visitStore.ts` to manage a `selectedParticipants` state slice during visit logging.
- [ ] Task 4: Implement the `log_visit_with_friends` RPC in Supabase (atomically handling winery, visit, and participants).
- [ ] Task 5: Connect `VisitForm` submission to the new `log_visit_with_friends` RPC.

## Phase 2: Shared History & Participant Display
Objective: Display tagged visits and participants across the UI.

- [ ] Task 1: Update `VisitCardHistory` to display avatars of all tagged participants.
- [ ] Task 2: Update `get_paginated_visits_with_winery_and_friends` (or equivalent) to include participant metadata.
- [ ] Task 3: Implement a "Tagged in" filter or section in the user's global visit history view.
- [ ] Task 4: Ensure `visitStore` correctly hydrates participant data into the local cache.

## Phase 3: Tag Management & Privacy
Objective: Allow users to manage their tags and privacy.

- [ ] Task 1: Create a "Pending Tags" section in the Friends/Social manager.
- [ ] Task 2: Implement the `respond_to_visit_tag(visit_id, accept)` RPC.
- [ ] Task 3: Add user settings for "Visit Tagging Privacy" (Auto-accept vs. Review required).
- [ ] Task 4: Implement "Untag Me" functionality for users to remove their participation record.

## Phase 4: Validation
Objective: Verify social tagging lifecycle and privacy.

- [ ] Task 1: Add E2E tests for the "Tag Friend in Visit" flow using two browser contexts.
- [ ] Task 2: Add E2E tests for "Declining a Tag" and verify the visit is removed from the user's history.
- [ ] Task 3: Verify that participants in a private visit can see the visit, but non-participants cannot.
- [ ] Task 4: Audit database for orphaned `visit_participants` records after visit deletions.
