# Changelog

## [2.2.5] - 2025-12-31

**PWA Support, Search Caching & Exploration Stability**

Version 2.2.5 transforms the application into an installable **Progressive Web App (PWA)** and significantly optimizes the winery discovery experience. We have implemented a robust database caching layer for searches, reducing API costs while improving speed, and refined the map behavior to ensure seamless exploration.

### 🚀 Features
*   **Progressive Web App (PWA):**
    *   **Installability:** The app is now fully installable on mobile and desktop devices via Serwist.
    *   **Smart Caching:** Implemented a precise Service Worker strategy to cache static assets while avoiding `QuotaExceededError` on constrained devices.
    *   **Offline Capability:** Core app shell and static resources are now available offline.
*   **Search Caching & Optimization:**
    *   **Database Caching:** Search results are now cached in Supabase, reducing Google Maps API calls and speeding up repeat searches.
    *   **Smart Zoom:** The map now intelligently forces a new search when zooming into clusters, revealing wineries that Google hides at lower zoom levels.
    *   **Stable UX:** Eliminated UI "blinking" by seamlessly merging cached data with live API results in the background.
*   **Winery Details:**
    *   **Dynamic Hours:** Implemented real-time "Open/Closed" status calculation based on current winery hours.

### 🐛 Bug Fixes
*   **Data Persistence:** Resolved a critical issue where searching would temporarily overwrite local user data (Favorites/Visited status) with raw API data.
*   **Map Interaction:**
    *   Fixed the "Results in View" list failing to update when panning.
    *   Fixed map middleware blocking PWA static assets (manifest, icons).
*   **Test Data Pollution:** Implemented automatic cleanup for integration tests to prevent mock wineries from persisting in the live database and appearing on the map.
*   **Global Branding:** Removed regional specific branding to support a broader global scope.

## [2.2.4] - 2025-12-29

**Industrial-Strength Testing & Mobile UX Stability**

Version 2.2.4 introduces a professional-grade testing infrastructure and resolves critical mobile interaction issues. We have implemented comprehensive logical, functional, visual, and accessibility safeguards while streamlining the mobile user experience.

### 🚀 Features
*   **Comprehensive Testing Suite:**
    *   **Visual Regression Testing:** Established baseline snapshots for core views with "Ghost Tiles" mocking for deterministic map backgrounds.
    *   **Automated Accessibility (A11y):** Integrated `@axe-core/playwright` to automatically catch accessibility violations in CI.
    *   **RPC Integration Tests:** New suite verifying core PostgreSQL business logic using authenticated clients against live data.
    *   **Unhappy Path Testing:** Verified UI resilience and error surfacing for network failures and server errors.
    *   **Standardized Fixtures:** Centralized all mock data factory functions, ensuring type safety and maintainability across all test types.
*   **Mobile UX Improvements:**
    *   Implemented conditional rendering for the **Interactive Bottom Sheet**, ensuring it is fully unmounted when closed to prevent invisible click-blocking.
    *   Optimized **Toast notifications** by moving the viewport to the top on mobile and enabling click-through on the container.
    *   Automated the "Create Trip" modal closure upon successful submission.

### 🛡 Security & Reliability
*   **State Isolation:** Enforced global Zustand store resets between every unit test to eliminate state bleed and ensure deterministic results.
*   **Robust Synchronization:** Replaced fragile timeouts in E2E tests with high-fidelity network-bound synchronization (`waitForResponse`) and logical state transitions.
*   **Automated Pre-commit Checks:** Re-enabled Husky and `lint-staged` to enforce linting and type-checking before every commit.

### 🐛 Bug Fixes
*   **Accessibility:** Resolved critical violations including missing `aria-labels` on buttons, missing `alt` text on images, and landmark nesting issues.
*   **CI/CD:** Fixed pipeline failures by correctly mapping repository secrets to the integration test environment.
*   **UI Stability:** Resolved a "detached from DOM" race condition in the visit history list on mobile.

## [2.2.3] - 2025-12-23

**Supabase Native Architecture & Enhanced Security**

Version 2.2.3 marks the completion of our "Supabase Native" transition. We have eliminated almost all internal API routes in favor of high-performance, atomic PostgreSQL functions (RPCs). This release also significantly hardens database security, streamlines the CI/CD pipeline with automated schema linting, and stabilizes our end-to-end testing suite.

### 🚀 Features
*   **Supabase Native Refactor:**
    *   Migrated **Friends** management (requests/responses) to atomic RPCs, removing the `/api/friends` route.
    *   Migrated **Trip Management** (creation, sharing by email, reordering, and deletion) to a consolidated RPC layer, eliminating complex client-side merging logic.
    *   Migrated **Visit Mutations** (updates and deletions) to secure RPCs, ensuring transactional integrity.
    *   Migrated **Wishlist & Favorites** toggles to atomic RPCs.
    *   Migrated **Winery Browsing** to a rich RPC that includes user-specific state (favorites/wishlist) directly in the list fetch.
*   **Direct SDK Integration:** Refactored Auth flows (Sign-up, Logout, Session retrieval) to use the Supabase SDK directly on the client, removing redundant intermediary API "wrapper" routes.

### 🛡 Security & Reliability
*   **Database Hardening:** Implemented a security patch across all `SECURITY DEFINER` functions to enforce `search_path = public`, resolving "Function Search Path Mutable" vulnerabilities.
*   **Automated Linting:** Integrated `supabase db lint` into the CI/CD pipeline to catch security and performance issues automatically.
*   **Test Suite Stabilization:** 
    *   Introduced a dedicated **Wishlist Flow** E2E test.
    *   Refactored E2E mocks to support the new RPC-based architecture.
    *   Implemented robust response waiting and auto-retrying assertions to eliminate flakiness in high-latency CI environments.

### ⚙ Refactoring & Cleanup
*   **API Deletion:** Removed 7+ redundant API routes (`/api/auth/me`, `/api/auth/logout`, `/api/auth/signup`, `/api/wishlist`, `/api/friends`, etc.), significantly reducing technical debt.
*   **Service Layer Cleanup:** Streamlined `TripService.ts` and Zustand stores by removing obsolete data transformation logic.

## [2.2.2] - 2025-12-22

**Streamlined Trips & Unified Visit Management**

Version 2.2.2 focuses on UX refinement and data consistency. We have completely refactored the Trips tab to prioritize immediate relevance, centralized the visit management system for real-time synchronization across all views, and squashed a suite of persistent UI bugs to provide a smoother, more reliable experience.

### 🚀 Features
*   **Trips Tab Overhaul:**
    *   Consolidated the "Plan a Trip" and "My Trips" views into a unified, high-performance interface.
    *   Introduced a **"Happening Today"** section at the top of the Trips tab for immediate relevance.
    *   Simplified navigation by removing the legacy calendar view in favor of a chronological "Upcoming" list.
    *   Optimized the mobile layout by moving secondary actions (like "View Past Trips") to the bottom of the drawer.
*   **Centralized Visit Management:**
    *   Implemented a global visit store to ensure 100% data consistency across the Map, History tab, and full table views.
    *   Added comprehensive **Optimistic UI updates** for visit creation, editing, and deletion, ensuring the UI feels instantaneous.
    *   Refactored visit data structures to a unified `VisitWithWinery` type, improving reliability and type safety.

### 🐛 Bug Fixes
*   **UI/UX Stability:**
    *   Resolved multiple race conditions in the **Winery Modal scrolling**; the modal now consistently opens at the top regardless of previous interactions.
    *   Fixed a bug where the winery modal opened as a blank skeleton when accessed from the History table.
    *   Fixed the "Edit Visit" feature in the winery modal which previously failed to populate existing review data.
    *   Corrected an issue where the winery counter on trip cards incorrectly displayed "0".
*   **Data Integrity:**
    *   Fixed a critical bug where deleted visits persisted on map pins and in history lists due to ID type mismatches.
    *   Resolved an issue where selecting a future date in the "New Trip" form would accidentally clobber the current "Happening Today" view.
*   **Accessibility & Technical Debt:**
    *   Eliminated "aria-hidden" console warnings by resolving duplicate modal rendering on mobile devices.
    *   Removed redundant "X" buttons and aligned focus management across all dialogs.
    *   Fixed several TypeScript and Lint errors, including "setState in render" patterns in the history views.
    *   Cleaned up the codebase by removing the legacy `TripPlanner` calendar component.

### ⚙ Refactoring
*   **Architecture:** Completed the transition to "Supabase Native" for all Visit and Trip operations, communicating directly with the database for better performance.
*   **Testing:** Enhanced the Playwright E2E suite with robust zero-cost mocking for Google Maps API and Supabase RPCs.

## [2.2.1] - 2025-12-17

### 🚀 Features
*   **Testing Infrastructure:**
    *   Introduced comprehensive **Playwright E2E Testing** suite covering Auth, Friends, and Trip planning flows.
    *   Implemented **Dynamic Test User** isolation, allowing tests to run in parallel without race conditions.
    *   Added GitHub Actions workflow for automated Playwright testing in CI.
    *   Enabled `.env.local` support for Playwright.

### 🐛 Bug Fixes
*   **Database & Security:**
    *   Refactored `toggleFavorite` and `toggleWishlist` to use the `ensure_winery` RPC, successfully bypassing RLS `UPDATE` restrictions for wineries not yet in the database.
    *   Fixed data fetching in `app/api/friends` to support sent requests and improve reliability.
    *   Fixed `get_friends` RPC to correctly handle friend request statuses.
*   **UI/UX:**
    *   Improved login reliability for Mobile Safari (WebKit) by prioritizing `Enter` key submission and robust UI assertions.
    *   Fixed TypeScript interface error in `InteractiveBottomSheet`.
    *   Resolved responsive layout logic issues in `AppShell` for better mobile navigation.
*   **State Management:**
    *   Cleaned up unused `createClient` imports to resolve type-check errors.

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
