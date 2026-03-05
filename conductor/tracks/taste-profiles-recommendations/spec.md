# Specification: Track taste-profiles-recommendations - Taste Profiles & Smart Recommendations

## Objective
Enrich the social experience with intelligent recommendations based on friend activities and shared "Taste" markers. This leverages JSONB metadata columns to store structured user preferences and tasting notes.

## Dependencies
- **Track 1:** Must have `metadata` JSONB columns in `visits`, `favorites`, and `wishlist`.
- **Infrastructure:** Need to add `metadata` JSONB column to the `profiles` table for persistent user preferences.

## Scope

### 1. Taste Profile Schema
- **Profile Metadata:** Extend the `profiles` table with a `metadata` JSONB column to store user-selected taste markers (e.g., "Favorite Varietals", "Vibe Preferences").
- **Visit Metadata:** Utilize the existing `metadata` column in `visits` to capture specific tasting notes per visit.

### 2. Taste Profile UI
- **Settings Integration:** A new "Taste Profile" section in the `/settings` page for users to manage their global preferences.
- **Taste Tags:** A set of standardized tags (e.g., "Dry White", "Bold Red", "Dog Friendly", "Live Music") that users can select.
- **Visit Enrichment:** Update the `VisitForm` to allow users to tag specific visits with taste markers.

### 3. Smart Recommendations (Backend)
- **get_taste_matches RPC:** A new PostgreSQL function to identify wineries that "match" a user's profile based on:
  - Their own taste preferences.
  - Friend activities (favorites/visits) at wineries with matching markers.
  - Global trends among users with similar taste profiles.

### 4. Social Proof & Badges
- **Recommended by Friends:** Visual badges on winery cards indicating when multiple friends have favorited or highly rated a winery.
- **Friend Rating Average:** Display an aggregated "Friend Rating" alongside the global Google rating.

## Success Criteria
1. Users can successfully save and update their taste markers in their profile settings.
2. Winery cards and details display social proof badges based on friend activity.
3. Users see a "Recommended for You" section on the map or explore view driven by the `get_taste_matches` logic.
4. Privacy is strictly respected: private visits and favorites never contribute to social proof for others.
