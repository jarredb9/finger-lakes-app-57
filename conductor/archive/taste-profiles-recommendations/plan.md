# Plan: Track taste-profiles-recommendations - Taste Profiles & Smart Recommendations

## Phase 1: Taste Profile & Metadata Foundation
Objective: Capture and store user preferences.

- [ ] Task 1: Create a migration to add `metadata` JSONB column to the `profiles` table.
- [ ] Task 2: Create a `TastePreferences` component in the `/settings` page.
- [ ] Task 3: Implement a multi-select list of "Taste Tags" using Radix UI `ToggleGroup` or `Checkbox`.
- [ ] Task 4: Connect `TastePreferences` to `ProfileService.updateMetadata` (to be implemented).
- [ ] Task 5: Add taste metadata selection to the `VisitForm` and `WineryModal` (for favorites).

## Phase 2: Social Proof & Badges
Objective: Visualize friend activity as "Social Proof."

- [ ] Task 1: Create a `FriendSocialProof` component showing avatars/badges for friends who favorited or wishlisted a winery.
- [ ] Task 2: Integrate `FriendSocialProof` into the `WineryCardThumbnail` and `WineryDetails`.
- [ ] Task 3: Implement `get_winery_social_stats` RPC to aggregate friend ratings and engagement.
- [ ] Task 4: Add "Friend Rating Average" to the winery card UI.

## Phase 3: Recommendation Engine (Backend & UI)
Objective: Display personalized social recommendations.

- [ ] Task 1: Implement the `get_taste_matches` RPC in Supabase (calculating matches based on user metadata and friend activity).
- [ ] Task 2: Create a `SocialRecommendations` component to display matching wineries.
- [ ] Task 3: Add "Recommended for You" section to the Map Explore view sidebar.
- [ ] Task 4: Implement a "Taste Match" indicator on winery profiles (e.g., "90% Match based on your love for Riesling").

## Phase 4: Validation & Tuning
Objective: Verify recommendation accuracy and privacy.

- [ ] Task 1: Add automated tests to verify "Friend Badges" correctly display for friends but not for non-friends.
- [ ] Task 2: Verify that "Private" activities never contribute to social proof calculations for other users.
- [ ] Task 3: Audit performance of the `get_taste_matches` RPC for users with high friend counts.
- [ ] Task 4: Refine recommendation weights based on user feedback.
