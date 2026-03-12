---
title: State Sync & Proactive Refresh
impact: CRITICAL
impactDescription: Prevents "Stale Data" bugs after database mutations
tags: handoff, zustand, sync, hydration
---

## State Sync & Proactive Refresh

Updating the database via RPC does NOT automatically update all client-side stores. You MUST map which stores need a "Proactive Sync" in the brief.

**Incorrect (Assuming automatic sync):**
> "I added the `addMember` RPC. The UI will show the new member."
> *Result: User A adds a member, but the sidebar `TripList` doesn't update until a hard reload.*

**Correct (Explicit Sync Mapping):**
> **State Sync Requirements:**
> - **Primary Store:** `tripStore` (Call `fetchTripDetails()` after RPC).
> - **Secondary Store:** `wineryDataStore` (Uses **"Merge on Hydrate"** pattern).
> - **Pattern:** Use `page.evaluate(() => useTripStore.getState().fetchTrips())` in Playwright instead of `page.reload()`.

**Success Rule:** The brief must identify the exact method call needed to refresh the UI for all affected features.

Reference: [Zustand State Management](https://docs.pmnd.rs/zustand/getting-started/introduction)
