---
title: Collaborative & Social Testing
impact: HIGH
impactDescription: Ensures data integrity and privacy across shared trips
tags: collaborative, social, trips, multi-user, privacy
---

## Collaborative & Social Testing

Trips now use a normalized `trip_members` schema. Testing must verify structured member data and cross-user visibility.

### 1. Structured Members
Verify that members are returned as objects, not IDs.
- **Incorrect:** Checking for an array of strings in `get_trip_details`.
- **Correct:** 
```typescript
const members = trip.members;
expect(members[0]).toMatchObject({
  id: expect.any(String),
  name: expect.any(String),
  role: 'owner'
});
```

### 4. Ownership Verification
Verify that the `user_id` (owner) is returned in the trip list and details. UI components that use `isOwner` logic (e.g., `TripCard`) depend on this field to enable or disable features like deletion or editing. 
- **Rule:** If `isOwner` is incorrectly returning `false`, verify that `TripService.getTrips` or the relevant RPC is explicitly selecting the `user_id` column.
- **Relational ID Robustness:** Supabase often serializes IDs as Strings in nested objects but Numbers in top-level records.
- **Standard:** Zustand stores MUST cast all relational IDs to `Number()` upon retrieval to ensure `isOwner` and filter logic is stable across all data sources.
- **Verification:** Log the trip object in a `[DIAGNOSTIC]` block within the test to check for the presence and correctness of `user_id` versus the current user's ID.

### 2. Multi-Member Visibility
A winery in a trip should surface visits from ALL members.
- **Rule:** Use `setupFriendship` helper to create a secondary user and log a visit.
- **Verification:** Verify the winery modal in the trip view shows the secondary member's name and review.
- **Privacy Check:** Verify that "Private" visits from members are NOT visible to others, even if they are on the same trip.

### 3. Shared Mock State
Collaborative tests require a single source of truth for mock data across multiple `BrowserContext` instances.
- **Rule:** Use `static` properties in `MockMapsManager` (e.g., `sharedMockTrips`) to persist changes (invites, edits) across contexts.
- **Stateful RPCs:** RPC interceptors for mutating actions (e.g., `create_trip`, `delete_trip`) MUST update the corresponding static state property. If the mock state is not updated, the UI will not reflect changes after a store refresh, causing locator failures.
- **Cleanup:** Always call `MockMapsManager.resetSharedState()` in the `mockMaps` fixture to prevent cross-test leakage.

### 5. Case-Insensitive ID Matching
UUID strings and relational IDs can exhibit inconsistent casing when transitioning between Supabase (Postgres) and Zustand (JSON).
- **Rule:** Never use strict `===` for ID comparison in UI filters, search logic, or **`isOwner` checks in React components**.
- **Standard:** Always cast to string and lowercase before comparing to ensure administrative buttons (Delete, Share) are consistently rendered across all browsers.
- **Implementation:**
```typescript
const isOwner = user?.id && trip.user_id && String(user.id).toLowerCase() === String(trip.user_id).toLowerCase();
```

### 6. List vs. Detail Data Discrepancy
The trip data structure varies significantly between the summary list and the detail view.
- **Rule:** `TripService.getTrips` (used for the sidebar and main Trips tab) currently returns empty arrays for `members` and `wineries` to optimize payload size.
- **Testing Impact:** Tests verifying sidebar avatars or winery counts MUST account for this discrepancy. Sidebar avatars will only be visible if using the `MockMapsManager` (which includes members in its list mock) or if the specific trip has been hydrated via `get_trip_details`.
- **Proactive Sync:** After a mutation (create/rename), always call `store.fetchTrips(1, 'upcoming', true)` to ensure the list reflects the new state, but be aware that `members` may be empty in the resulting store items.

Reference: [Playwright Multi-Context](https://playwright.dev/docs/auth#multi-step-auth)
