# Entity Relationship Diagram (ERD) - Social Infrastructure

This document describes the database schema for the Winery Visit Planner, focusing on the normalized social infrastructure and privacy-aware relationships.

## Core Entities

### `profiles`
Central user profile table linked to `auth.users`.
- `id` (uuid, PK): Matches Auth UID.
- `name` (text): Display name.
- `email` (text, Unique): User email.
- `privacy_level` (enum): `public`, `friends_only`, or `private`.

### `wineries`
Cached winery data from Google Places.
- `id` (int, PK): Internal DB ID.
- `google_place_id` (text, Unique): Primary identifier for external API.
- `name`, `address`, `latitude`, `longitude`, `google_rating`, etc.

## Social & Collaborative Planning

### `trips`
- `id` (int, PK)
- `user_id` (uuid, FK -> profiles.id): The creator/owner.
- `name` (text)
- `trip_date` (date)

### `trip_members`
Join table for collaborative trips.
- `id` (uuid, PK)
- `trip_id` (int, FK -> trips.id)
- `user_id` (uuid, FK -> profiles.id)
- `role` (text): `owner` or `member`.
- `status` (text): `joined`, `invited`.

### `trip_wineries`
Wineries assigned to a specific trip.
- `trip_id` (int, FK -> trips.id)
- `winery_id` (int, FK -> wineries.id)
- `visit_order` (int)
- `notes` (text)

## Activity & Social Interactions

### `visits`
- `id` (int, PK)
- `user_id` (uuid, FK -> profiles.id)
- `winery_id` (int, FK -> wineries.id)
- `visit_date` (date)
- `rating` (int, 1-5)
- `user_review` (text)
- `photos` (text[])
- `is_private` (boolean): Item-level privacy override.
- `metadata` (jsonb): Extensible data for social features.

### `favorites` & `wishlist`
- `user_id` (uuid, FK -> profiles.id)
- `winery_id` (int, FK -> wineries.id)
- `is_private` (boolean)
- `metadata` (jsonb)

### `activity_ledger`
Centralized social feed log populated by triggers.
- `id` (uuid, PK)
- `user_id` (uuid, FK -> profiles.id)
- `activity_type` (text): `visit`, `favorite`, `wishlist`.
- `object_id` (text): Link to the source record ID.
- `privacy_level` (text): Cached privacy state for efficient feed generation.
- `metadata` (jsonb): Snippet of activity data (e.g., winery name, rating).

## Social Relationships

### `friends` (Symmetric)
- `user1_id`, `user2_id` (uuid, FK -> profiles.id)
- `status` (text): `pending`, `accepted`, `declined`.

### `follows` & `follow_requests` (Asymmetric)
- `follower_id` (uuid, FK -> profiles.id)
- `following_id` (uuid, FK -> profiles.id)
- `status` (text, in requests): `pending`, `accepted`.

## Security & Privacy Logic
All social visibility is enforced via the `is_visible_to_viewer(p_target_user_id, p_is_item_private)` RPC, which evaluates:
1. Ownership (always visible).
2. Item-level `is_private` flag.
3. Profile-level `privacy_level`.
4. Social connection status (Friendship or Following).
