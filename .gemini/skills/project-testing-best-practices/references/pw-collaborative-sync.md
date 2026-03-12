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

### 2. Multi-Member Visibility
A winery in a trip should surface visits from ALL members.
- **Rule:** Use `setupFriendship` helper to create a secondary user and log a visit.
- **Verification:** Verify the winery modal in the trip view shows the secondary member's name and review.
- **Privacy Check:** Verify that "Private" visits from members are NOT visible to others, even if they are on the same trip.

### 3. Shared Mock State
Collaborative tests require a single source of truth for mock data across multiple `BrowserContext` instances.
- **Rule:** Use `static` properties in `MockMapsManager` (e.g., `sharedMockTrips`) to persist changes (invites, edits) across contexts.
- **Cleanup:** Always call `MockMapsManager.resetSharedState()` in the `mockMaps` fixture to prevent cross-test leakage.

Reference: [Playwright Multi-Context](https://playwright.dev/docs/auth#multi-step-auth)
