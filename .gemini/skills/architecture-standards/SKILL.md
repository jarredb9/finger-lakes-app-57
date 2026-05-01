---
name: architecture-standards
description: ACTIVATE THIS SKILL if the user mentions: 'Zustand', 'Store', 'Hydration', 'Next.js 16', 'Database', 'ID', 'UUID', 'RPC', 'RLS', 'Supabase', 'Social', 'Privacy', or 'Realtime'.
---

# Core Architectural & Database Standards

## 1. Next.js 16 Hydration & Synchronization
*   **Avoid Hard Reloads:** NEVER use `page.reload()` inside retry loops. It kills hydration.
*   **Proactive Sync:** Trigger store refreshes (e.g., `store.fetchFriends()`) via `page.evaluate` inside retry loops instead.
*   **The DnD Hydration Rule:** Wrap `DragDropContext` in a `mounted` state check for SSR safety in Next.js 16.

## 2. ID System & Database
*   **Dual-ID System:** Distinguish between `GooglePlaceId` (string) and `WineryDbId` (number).
*   **The Numeric ID Normalization Rule:** Zustand stores MUST normalize all relational IDs (Winery, Trip, Visit) to `Number()` upon retrieval.
*   **The Local Date Stability Rule:** **MANDATORY:** Always use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts`. **NEVER** use `toISOString().split('T')[0]`.
*   **RPC Schema Parity:** Reflect all DB changes in `lib/database.types.ts`.
*   **RLS Visibility Rule:** All `SELECT` policies MUST include a direct ownership check (`auth.uid() = user_id`) BEFORE complex function calls.

## 3. State Management (Zustand)
*   **Store Split:** Distinguish between `wineryDataStore` (Persisted Cache) and `wineryStore` (UI State).
*   **Merge on Hydrate:** `hydrateWineries` MUST merge markers with detailed data.
*   **The Ghost Status Rule:** Clear local `visits` if the server reports `user_visited: false`.
*   **The Revision Lock Rule:** Track `lastActionTimestamp` to prevent "Flicker" race conditions in Realtime sync.

## 4. Social & Privacy Logic
*   **Normalization:** All social relations use `trip_members`, `follows`, and `activity_ledger`.
*   **Visibility:** Use the `is_visible_to_viewer` RPC for Public/Friends/Private tiers.
