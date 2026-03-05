# Plan: Track 5 - Taste Profiles & Smart Recommendations

## Phase 1: Taste Profile & Metadata
Objective: Capture and store user preferences.

- [ ] Task 1: Create a `TastePreferences` component in the `/settings` page.
- [ ] Task 2: Implement a multi-select list of "Taste Tags" (e.g., "Dry White," "Heavy Red," "Dog Friendly").
- [ ] Task 3: Connect `TastePreferences` to the `userStore.ts` and `profiles` metadata JSONB column.
- [ ] Task 4: Add taste metadata selection to the `VisitForm` and `WineryModal` (for favorites).

## Phase 2: Social Proof & Badges
Objective: Visualize friend activity as "Social Proof."

- [ ] Task 1: Create a `FriendSocialProof` component showing avatars/badges for friends who favorited or wishlisted a winery.
- [ ] Task 2: Integrate `FriendSocialProof` into the `WineryCardThumbnail` and `WineryDetails`.
- [ ] Task 3: Add "Friend Rating Average" to the winery card alongside the Google rating.

## Phase 3: Recommendation Engine (Frontend/UI)
Objective: Display personalized social recommendations.

- [ ] Task 1: Create a `SocialRecommendations` component showing wineries that "Taste Matches" enjoy.
- [ ] Task 2: Implement the `get_taste_matches` RPC in Supabase (respecting privacy).
- [ ] Task 3: Add "Recommended for You" section to the Map Explore view.

## Phase 4: Validation
- [ ] Task 1: Add automated tests to verify "Friend Badges" correctly display for friends but not for non-friends.
- [ ] Task 2: Verify that "Private" favorites never contribute to social proof calculations.
- [ ] Task 3: Audit performance for users with large social circles.
