# Plan: Track community-activity-feed - Global Discovery & Activity Feed

## Phase 1: Community Feed Foundation
Objective: Build the base backend and feed view.

- [ ] Task 1: Create the `get_community_activity` RPC in Supabase (filtering `activity_ledger` for public content).
- [ ] Task 2: Create a `CommunityFeed` component, adapting the logic from `FriendActivityFeed`.
- [ ] Task 3: Add the "Community" tab to the `AppShell` and mobile bottom bar.
- [ ] Task 4: Implement a basic activity fetch in a new `communityStore.ts` (or extend `friendStore.ts`).

## Phase 2: Feed UI & Interaction
Objective: Enhance the feed with rich activities and navigation.

- [ ] Task 1: Implement deep linking for community feed items (navigating to `WineryModal` or `FriendProfile`).
- [ ] Task 2: Update activity cards to display photos and ratings from the `metadata` JSONB column.
- [ ] Task 3: Implement "Quick Actions" (Add to Wishlist/Favorite) directly from a community feed item.
- [ ] Task 4: Add "Discover Users" section showing recently active public profiles.

## Phase 3: Engagement & Sync
Objective: Real-time and notifications.

- [ ] Task 1: Enable Supabase Realtime subscription for the `activity_ledger` in the community feed view.
- [ ] Task 2: Implement "Follow" functionality directly from a community activity item.
- [ ] Task 3: Add notification badges or "New Activity" banners when the community feed receives updates.

## Phase 4: Privacy & Validation
Objective: Ensure privacy integrity and system performance.

- [ ] Task 1: Add automated tests to verify that private and "Friends Only" items are strictly excluded from the community feed.
- [ ] Task 2: Verify that users with global private settings are never featured in the "Discover Users" section.
- [ ] Task 3: Perform load testing on the `get_community_activity` RPC to ensure performance with large datasets.
