# Specification: Track community-activity-feed - Global Discovery & Activity Feed

## Objective
Implement a "Community" tab that showcases a real-time feed of public activities (visits, photos, favorites) across the platform. This leverages the `activity_ledger` table and `is_visible_to_viewer` privacy engine.

## Dependencies
- **Track 1:** Must have `activity_ledger` table and automated triggers to populate it.
- **Track 1:** Must have `is_visible_to_viewer` RPC for privacy filtering.

## Scope

### 1. Community Feed Backend
- **get_community_activity RPC:** A new PostgreSQL function to fetch activities from the `activity_ledger` where the privacy level is 'public' or the user's profile is public.
- **Performance:** Ensure efficient querying and pagination for the global community feed.

### 2. Community Feed UI
- **CommunityFeedView:** A new tab or section in the application showing a reverse-chronological list of public activities.
- **Rich Activity Cards:** Reusable components to display different activity types (Visit, Photo, Favorite, Wishlist) with associated metadata.
- **Navigation:** Deep linking to winery profiles and public user profiles from the feed.

### 3. Real-time & Engagement
- **Real-time Updates:** Push notifications or automatic feed refreshes for new community activity using Supabase Realtime.
- **Engagement Actions:** Ability to "Favorite" or "Wishlist" a winery directly from a community feed item.

### 4. Privacy Enforcement
- **Privacy Filtering:** Strict enforcement that "Friends Only" or "Private" content never appears in the global community feed.
- **Public Profiles:** Only activities from users with `privacy_level = 'public'` should be visible to the general community.

## Success Criteria
1. Users see a reverse-chronological feed of public winery activities from the entire community.
2. Clicking an activity item leads to the correct winery or public user profile.
3. Private and "Friends Only" visits never appear in the community feed.
4. The community feed updates in real-time as new public activities are logged.
