# Plan: Track 4 - Social Visit Tagging & Shared History

## Phase 1: Visit Tagging UI
Objective: Allow users to tag friends in visits.

- [ ] Task 1: Create a `FriendPicker` component using `popover` and `input` search.
- [ ] Task 2: Integrate `FriendPicker` into the `VisitForm` (log/edit).
- [ ] Task 3: Update `visitStore.ts` to manage the list of tagged friends.
- [ ] Task 4: Connect the `VisitForm` submit to the `log_visit_with_friends` RPC.

## Phase 2: User Shared History
Objective: Display tagged visits on profile pages.

- [ ] Task 1: Add a "With Friends" section to the `VisitHistoryView`.
- [ ] Task 2: Update `get_paginated_visits_with_winery_and_friends` to include tagging metadata.
- [ ] Task 3: Create a `TaggedVisits` list for the `UserProfile` showing visits the user was tagged in.

## Phase 3: Notification & Acceptance
Objective: Manage tagging privacy.

- [ ] Task 1: Implement a "Tag Approval" flow in the `friendStore.ts`.
- [ ] Task 2: Create a notification banner for "New Pending Tag."
- [ ] Task 3: Add user settings for "Auto-accept Tags" or "Require Review."

## Phase 4: Validation
- [ ] Task 1: Add E2E tests for the "Tag Friend in Visit" flow.
- [ ] Task 2: Add E2E tests for the "Remove Self from Tagged Visit" flow.
- [ ] Task 3: Verify that tags on private visits only appear to the tagger and tagged friend.
