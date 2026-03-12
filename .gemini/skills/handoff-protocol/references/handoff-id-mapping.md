---
title: ID System & Data Mapping
impact: HIGH
impactDescription: Prevents 404 RPC errors and foreign key violations
tags: ids, types, mapping, data-integrity
---

## ID System & Data Mapping

Mixing up `GooglePlaceId` (string) and `WineryDbId` (number) is a common source of 404 RPC errors. You MUST explicitly map these in the Handoff Brief.

**Incorrect (Vague ID references):**
> "Test the `toggleFavorite` action using the winery ID."
> *Result: Next agent uses a string ID for a numeric database column, causing a 404.*

**Correct (Explicit ID mapping):**
> **Data Types for [Feature Name]:**
> - **`GooglePlaceId` (string):** Used for Map markers and Places API lookups.
- **`WineryDbId` (number):** Used for all relational database actions (RPCs).
- **Collaborative Rule:** The `TripMember` type is now a structured object (ID, Name, Email, Role, Status). LEGACY string arrays for members are DEPRECATED.
- **Nested Data:** The `get_trip_details` RPC now includes nested `visits` from all trip members. Tests MUST verify that visits from other members are visible if they meet privacy requirements.
- **Constraint:** Use `ensureInDb(googleId)` to resolve the `WineryDbId` before calling `logVisit`.

**Success Rule:** The brief must identify the exact type (string vs. number) for every ID passed between the UI and the backend.

Reference: [Supabase RPC Types](https://supabase.com/docs/guides/database/functions)
