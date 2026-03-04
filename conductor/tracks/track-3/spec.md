# Specification: Track 3 - Global Discovery & Activity Feed

## Objective
Implement a "Community" tab that showcases a real-time feed of public activities (visits, photos, favorites) across the platform.

## Dependencies
- **Track 1:** Must have `activity_ledger` table and `get_community_activity` RPC.

## Scope
- **Community Feed:** A new tab or section showing a reverse-chronological list of public activities.
- **Privacy Filtering:** Ensure "Friends Only" or "Private" content never appears in the global view.
- **Engagement:** Ability to navigate to winery profiles or user profiles (if public) directly from the feed.
- **Real-time Updates:** Push notifications or automatic feed refreshes for new community activity.

## Success Criteria
1. Users see a feed of public visits and favorites from the entire community.
2. Clicking an activity item leads to the correct winery or public user profile.
3. Private visits never appear in the community feed.
