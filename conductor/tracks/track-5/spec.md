# Specification: Track 5 - Taste Profiles & Smart Recommendations

## Objective
Enrich the social experience with intelligent recommendations based on friend activities and shared "Taste" markers.

## Dependencies
- **Track 1:** Must have `metadata` JSONB columns and `get_taste_matches` RPC.

## Scope
- **Taste Profile UI:** A section in the user profile to manage their "Taste" preferences (e.g., "Favorite Varietals," "Preferred Regions").
- **Social Proof:** Adding "Recommended by Friends" badges to winery cards and details.
- **Smart Matching:** An "Explore" feature showing "Wineries you and [Friend Name] both love."
- **Privacy Awareness:** Ensuring individual taste markers only contribute to anonymous friend-based recommendations if requested.

## Success Criteria
1. Users can select and save their "Taste" markers in their profile.
2. Winery cards show badges for friends who favorited or wishlisted the winery.
3. Personalized recommendation feed shows wineries that "Friends who love Riesling" also enjoyed.
