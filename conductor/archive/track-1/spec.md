# Specification: Track 1 - Social Infrastructure Refactor (Backend)

## Objective
Refactor the application's social backend from a denormalized personal storage model into a scalable, normalized social graph. This work unblocks features like collaborative trips, social tagging, global activity discovery, and semantic taste matching.

## Scope
This track focuses exclusively on the database schema, Row Level Security (RLS) policies, and Supabase RPC functions.

### 1. Trip Membership Normalization
- **Current:** `trips.members uuid[]` array.
- **Target:** `public.trip_members` join table.
- **Why:** Enables referential integrity (FKs), atomic updates, and membership metadata (roles, invite status).
- **Columns:** `id`, `trip_id (FK)`, `user_id (FK)`, `role (text)`, `status (text)`, `invited_at`, `joined_at`.

### 2. Social Visit Tagging ("With Friends")
- **Target:** `public.visit_participants` join table.
- **Objective:** Support tagging friends in visits to build shared histories.
- **Columns:** `id`, `visit_id (FK)`, `user_id (FK)`, `status (text)`.

### 3. Unified Activity Ledger (Event Sourcing)
- **Target:** `public.activity_ledger` table.
- **Objective:** Consolidate all social-eligible actions (Visits, Favorites, Wishlist, Trips) into a single, high-performance table for feed generation.
- **Why:** Replaces expensive multi-table JOINs with a single-table SELECT, and provides a unified privacy boundary.
- **Columns:** `id`, `user_id (FK)`, `activity_type (text)`, `object_id (uuid/int)`, `privacy_level (text)`, `metadata (jsonb)`, `created_at`.

### 4. Asymmetric Social Model (Follow/Follower)
- **Target:** `public.friends` (or new `public.follows`).
- **Objective:** Support asymmetric relationships where users can follow public profiles without mutual consent.
- **Why:** Lowers friction for social growth and enables global discovery feeds.

### 5. Semantic "Taste" Markers
- **Target:** `metadata jsonb` column added to `visits`, `favorites`, and `wishlist`.
- **Objective:** Store structured, searchable tags (e.g., "Dry Riesling," "Dog Friendly") to enable intelligent social matching and recommendations.

## Success Criteria
1. All existing trip data successfully migrated to the `trip_members` join table.
2. `get_friend_activity_feed` RPC refactored to use `activity_ledger` with no regressions.
3. RLS policies updated to enforce privacy based on the new join tables and ledger.
4. All existing E2E and Jest tests pass.
