# Plan: Track 3 - Global Discovery & Activity Feed

## Phase 1: Community Feed Foundation
Objective: Build the base feed view.

- [ ] Task 1: Create a `CommunityFeed` component, similar to `FriendActivityFeed` but pulling from the new `activity_ledger` table.
- [ ] Task 2: Implement the `get_community_activity` RPC in Supabase (respecting `is_visible_to_viewer`).
- [ ] Task 3: Create a new "Explore Community" tab or section in the `AppShell`.

## Phase 2: Feed UI & Interaction
Objective: Enhance the feed with rich activities.

- [ ] Task 1: Update the feed items to display photos, ratings, and favorites from the ledger's metadata.
- [ ] Task 2: Implement "Quick Actions" in the feed (e.g., "Add to Wishlist" directly from a community item).
- [ ] Task 3: Add "Discover Users" feature to the community view, showing recently active public profiles.

## Phase 3: Engagement & Sync
Objective: Real-time and notifications.

- [ ] Task 1: Enable Realtime for the `activity_ledger` table to push live community activity.
- [ ] Task 2: Implement "Follow" functionality directly from a community activity item.
- [ ] Task 3: Add notification badges when new community activity is available.

## Phase 4: Privacy & Validation
- [ ] Task 1: Add automated tests to ensure private and "Friends Only" activities never appear in the community feed.
- [ ] Task 2: Verify that users who have `privacy_level = 'private'` are entirely excluded from the ledger.
- [ ] Task 3: Audit feed performance for large volumes of data.
