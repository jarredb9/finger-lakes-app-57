# Changelog

## [2.0.0] - 2025-12-02

### ⚠ BREAKING CHANGES
*   **Framework Upgrade:** Upgraded core framework to **Next.js 16** and **React 19**, incorporating modern React Server Components and async request handling patterns.
*   **Architecture Overhaul:** Shifted data fetching strategy from standard REST API routes to high-performance **Supabase RPCs** (Remote Procedure Calls). This includes `get_user_dashboard` and `get_user_winery_data_aggregated` which consolidate multiple queries into single database calls.
*   **Database Schema:** Consolidated database schema and migrations, enforcing stricter RLS (Row Level Security) policies.

### 🚀 Features
*   **Trip Planning:**
    *   Implemented live winery search directly within the trip details page.
    *   Added optimistic UI updates for creating and deleting trips to improve perceived performance.
    *   Added Skeleton loaders for better loading states.
*   **Winery Details:**
    *   Added **Q&A Section** for user-driven winery questions.
    *   Integrated **Business Hours** display in winery modals.
    *   Added reservation app links.
*   **Photo Management:**
    *   Complete overhaul of the photo upload flow.
    *   Added ability to delete photos and stage deletions before saving.
*   **Social:**
    *   New `FriendActivity` and improved friend management interface.
    *   Optimized friend request fetching via RPC.

### 🐛 Bug Fixes
*   **Realtime/Websockets:** Fixed persistent issues with Supabase Realtime connections causing crashes and websocket errors on the Trip Card and Details pages.
*   **Performance:**
    *   Resolved N+1 query issues in winery fetching.
    *   Added missing database indexes on foreign keys.
    *   Fixed Supabase Performance Advisor warnings regarding RLS policies.
*   **Map & UI:**
    *   Fixed map clustering and marker rendering issues.
    *   Resolved scrolling issues in the Winery Modal.
    *   Fixed "Create Trip" button selectability issues.

### ⚙ Refactoring
*   **Codebase:**
    *   Extracted trip logic into a dedicated `TripService` class.
    *   Decomposed monolithic stores into `visitStore`, `wineryStore`, and `tripStore`.
    *   Modularized map logic into `useWineryMap`, `WineryMapContainer`, and related sub-components.
*   **Testing:**
    *   Added comprehensive unit and integration tests for stores and hooks.
    *   Configured Jest with React Testing Library for the new React 19 environment.
