# Specification: Track 2 - Collaborative Trip UI & Sharing

## Objective
Build the user interface and frontend logic to support collaborative trip planning, allowing users to invite friends and manage shared itineraries.

## Dependencies
- **Track 1:** Must have `trip_members` join table and related RPCs (`add_trip_member_by_email`).

## Scope
- **Share UI:** A modal/drawer to search for friends and invite them to a trip.
- **Collaborative List:** Visual indicators in `TripList` and `TripPlanner` showing who is on the trip (user avatars).
- **Role Management:** Ability for the owner to manage member roles (Admin/Viewer) and remove members.
- **Real-time Sync:** Ensuring all members see updates to the trip itinerary in real-time.

## Success Criteria
1. Users can invite a friend to a trip via email or friend selection.
2. Multiple users can see and edit the same trip itinerary.
3. Trip owner can successfully remove a member from a trip.
