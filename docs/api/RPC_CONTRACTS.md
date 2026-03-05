# Supabase RPC Contracts - Social Infrastructure

This document outlines the primary PostgreSQL functions (RPCs) used by the client application to manage social data and collaborative planning.

## Trip Management

### `create_trip_with_winery`
Atomically creates a trip, adds the creator as owner, and adds the first winery.
- **Parameters:**
  - `p_trip_name` (varchar)
  - `p_trip_date` (date)
  - `p_winery_data` (jsonb): Complete winery object.
  - `p_notes` (text, optional)
- **Returns:** `{"trip_id": int, "winery_id": int}`

### `get_trip_details`
Fetches a single trip with its members and wineries.
- **Parameters:** `trip_id` (int)
- **Returns:** JSON object with nested wineries and members.

### `add_trip_member_by_email`
Adds a member to a trip via email lookup.
- **Parameters:**
  - `p_trip_id` (int)
  - `p_email` (text)
- **Returns:** `{"success": true, "user_id": uuid}`

## Social & Privacy

### `is_visible_to_viewer`
Central logic engine for all social visibility.
- **Parameters:**
  - `p_target_user_id` (uuid)
  - `p_is_item_private` (boolean, default: false)
- **Returns:** `boolean`

### `get_friend_activity_feed`
Pull-based social feed from the `activity_ledger`.
- **Parameters:** `limit_val` (int, default: 20)
- **Returns:** JSONB array of activity objects.

### `toggle_favorite_privacy` / `toggle_wishlist_privacy`
Toggles the `is_private` flag for a specific item.
- **Parameters:** `p_winery_id` (int)
- **Returns:** `void`

## Visit Lifecycle

### `log_visit`
Atomically ensures winery existence and logs a visit.
- **Parameters:**
  - `p_winery_data` (jsonb)
  - `p_visit_data` (jsonb): Includes `rating`, `user_review`, `photos`, `is_private`.
- **Returns:** `{"visit_id": int, "winery_id": int}`

### `update_visit`
Updates an existing visit and returns the updated winery context.
- **Parameters:**
  - `p_visit_id` (int)
  - `p_updates` (jsonb)
- **Returns:** `jsonb` (Full winery object with visits)

## Asymmetric Relationships

### `send_follow_request`
Sends a follow request or follows immediately if target is public.
- **Parameters:** `target_id` (uuid)
- **Returns:** `{"status": "following" | "requested"}`

### `respond_to_follow_request`
Accepts or declines a pending follow request.
- **Parameters:**
  - `follower_id` (uuid)
  - `accept` (boolean)
- **Returns:** `void`
