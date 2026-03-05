# Specification: Track collaborative-trip-sharing - Collaborative Trip UI & Sharing

## Objective
Build the user interface and frontend logic to support collaborative trip planning, allowing users to invite friends and manage shared itineraries. This leverages the normalized `trip_members` architecture implemented in Track 1.

## Dependencies
- **Track 1:** Must have `trip_members` join table and related RPCs (`add_trip_member_by_email`, `get_trip_details`, `create_trip_with_winery`).

## Scope

### 1. Share UI
- **TripShareDialog:** A modal/drawer using Radix/shadcn `Dialog` to search for friends by email or select from a friend list.
- **Invitation Logic:** Integration with `add_trip_member_by_email` RPC to securely add members to `trip_members`.
- **Entry Points:** "Share" buttons added to `TripCard` (list view) and `TripPlanner` header (detail view).

### 2. Collaborative Visibility
- **Member Avatars:** Update `TripCard` and `TripPlanner` to display avatars of all members fetched via `get_trip_details`.
- **Members List:** A dedicated section in the `TripPlanner` sidebar to view all participants and their roles (Owner/Member).

### 3. Real-time Collaboration
- **Real-time Sync:** Enable Supabase Realtime subscriptions for `trip_members` and `trip_wineries` tables in `tripStore.ts`.
- **UI Responsiveness:** Implement optimistic updates for member additions and itinerary changes (reordering, notes).

### 4. Permissions & Security
- **Role Enforcement:** Ensure that only authorized members can edit the trip (winery reordering, adding/removing wineries, updating notes).
- **Owner-Only Actions:** Restrict trip deletion and member removal (of others) to the trip owner.

## Success Criteria
1. Users can successfully invite a friend to a trip via email.
2. Multiple users can see and edit the same trip itinerary simultaneously.
3. Trip owner can successfully remove a member from a trip.
4. All itinerary updates (reordering, notes) are synced in real-time across all active members.
5. Unauthorized users (non-members) are blocked from viewing or editing private trips.
