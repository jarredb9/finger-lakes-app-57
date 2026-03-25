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
- **Rule:** Never use strict `===` for ID comparison in UI filters or search logic.
- **Standard:** Always cast to string and lowercase before comparing.
- **Implementation:**
```typescript
const isMember = members.some(m => String(m.id).toLowerCase() === String(friend.id).toLowerCase());
```

Reference: [Playwright Multi-Context](https://playwright.dev/docs/auth#multi-step-auth)
