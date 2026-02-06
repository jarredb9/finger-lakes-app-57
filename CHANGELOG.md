# Changelog

## [2.3.1] - 2026-02-06

**Core Library Upgrades & Supabase SSR Refinement**

Version 2.3.1 is a maintenance and stability release that upgrades several core libraries to their latest major versions, refines the Supabase SSR cookie handling, and ensures full compatibility with the new component APIs in our testing suite.

### 🚀 Features
*   **Major Library Migrations:**
    *   **React Day Picker v9:** Upgraded to the latest version of `react-day-picker`, involving a complete refactor of the `Calendar` component to support the new v9 API and component structure.
    *   **Date-fns v4:** Upgraded to the latest major version of `date-fns` for improved performance and modern ESM support.
    *   **Supabase SSR v0.8.0:** Migrated to the latest `@supabase/ssr` package, refactoring cookie management to use the new `setAll` pattern for better reliability across different environments.
*   **Dependency Modernization:** Updated critical dependencies including `lucide-react`, `zustand`, `tailwind-merge`, and `@vis.gl/react-google-maps` to their latest stable versions.

### 🐛 Bug Fixes
*   **E2E Selector Compatibility:** Resolved failures in Playwright tests caused by breaking changes in `react-day-picker` v9's DOM structure. Updated selectors to accurately target the "Today" marker and active states.
*   **Supabase Type Safety:** Fixed implicit `any` type errors in server-side Supabase utilities by providing explicit types for cookie store operations.
*   **Mobile Interaction:** Fixed a race condition in mobile E2E tests by ensuring the interactive bottom sheet is fully expanded before attempting to click nested elements.

### 🛡 Security
*   **Audit Resolution:** Resolved a high-severity vulnerability in the `tar` dependency by implementing a version override in `package.json`.

### ⚙ Infrastructure & Testing
*   **PWA Cache Refinement:** Updated the Service Worker configuration to optimize resource caching and improve offline startup reliability.
*   **Test Environment Hardening:** Enhanced the Playwright helper suite with more robust mobile navigation guards and updated visual regression targets.

## [2.3.0] - 2026-01-23

**Tailwind CSS v4 Migration & PWA Refinement**

Version 2.3.0 is a major technical milestone that migrates the entire styling engine to **Tailwind CSS v4** and delivers a polished, "Always-On" **PWA installation experience**. This release significantly improves UI performance, reduces technical debt, and enhances mobile accessibility.

### 🚀 Features
*   **Tailwind CSS v4 Migration:**
    *   **CSS-Native Architecture:** Fully migrated from Tailwind v3 to v4, replacing the JavaScript-based `tailwind.config.ts` with a modern, CSS-native `@theme` configuration in `globals.css`.
    *   **Container Queries:** Refactored the `responsive-table` utility to use modern CSS Container Queries (`@container`), ensuring tables adapt perfectly to their parent container's width regardless of the viewport.
    *   **Native Field Sizing:** Implemented `field-sizing-content` in the `Textarea` component, enabling automatic, jump-free height adjustment using native browser capabilities.
    *   **Optimized Engine:** Leveraged the v4 lightning-fast build process and reduced the overall CSS bundle size.
*   **PWA User Experience Refactor:**
    *   **User Menu Integration:** PWA installation and update controls are now integrated directly into the user avatar dropdown menu, providing a clean and consistent way to manage the app on all platforms.
    *   **Smart "Add to Home Screen":** Implemented dynamic logic that switches between "Install App" (native) and "Add to Home Screen" (manual instructions) based on browser capabilities.
    *   **Layout Polish:** Refined the PWA install prompts and Cookie Consent banners to be slimmer and less intrusive on mobile devices, ensuring they don't obstruct critical navigation.
    *   **Standalone Detection:** Enhanced the `usePwa` hook to detect existing installations and automatically hide redundant controls.

### 🐛 Bug Fixes
*   **Mobile Accessibility:** Fixed a critical issue where large banners could obstruct login links on smaller mobile viewports.
*   **UI Consistency:** Updated all shadcn/ui components to use Tailwind v4 compatible utility classes (e.g., `backdrop-blur-xs`, `shadow-xs`, `outline-hidden`).
*   **Navigation Logic:** Resolved responsive state mismatches in `AppShell` that occasionally caused the sidebar and map controls to overlap.

### ⚙ Infrastructure & Testing
*   **PWA Layout Testing:** Introduced `e2e/pwa-install-layout.spec.ts` to ensure PWA and Cookie banners maintain perfect layout across Desktop, Tablet, and Mobile viewports.
*   **Visual Baseline:** Updated all E2E visual regression snapshots to align with the refined rendering and spacing of the Tailwind v4 engine.
*   **Dependency Cleanup:** Removed legacy PostCSS configuration and `tailwind.config.ts`, streamlining the project structure.

## [2.2.8] - 2026-01-22

**Social Activity Feed, PWA 2.0 & Security Hardening**

Version 2.2.8 is a feature-rich release that introduces the **Social Activity Feed**, upgrades the app to a "Rich Install" PWA experience, and hardens security. We have also significantly stabilized the CI/CD pipeline with robust mobile-first E2E testing.

### 🚀 Features
*   **Social Activity Feed:**
    *   **Activity Stream:** Users can now see a real-time feed of their friends' recent visits, wishlist additions, and favorites.
    *   **Signed Photos:** Implemented secure URL signing for private activity feed photos.
    *   **Empty State:** Added a helpful empty state prompt for users with no friend activity.
*   **PWA 2.0 (Rich Install):**
    *   **Rich Manifest:** Added mobile and desktop screenshots, categories, and "Explore" / "Trips" shortcuts to the web manifest for a native App Store-like install card.
    *   **Custom Install UI:** Implemented a non-intrusive "Install App" prompt (Bottom Card on Desktop, Slim Banner on Mobile) that reacts to the `beforeinstallprompt` event.
    *   **Reliable Offline Start:** Switched the Service Worker strategy to `StaleWhileRevalidate` for the document shell, resolving iOS "White Screen" issues during cold starts in poor network conditions.
    *   **Infinite Loop Fix:** Resolved a toast notification loop in the PWA handler.

### 🛡 Security
*   **Dependency Hardening:** Resolved high-severity vulnerabilities in the dependency tree via `npm audit fix`, ensuring a secure baseline for production deployments.

### ⚙ Infrastructure & Testing
*   **Mobile PWA Testing:**
    *   **Offline Verification:** Restored and enhanced End-to-End (E2E) tests for PWA offline functionality, optimizing for mobile touch interactions and bottom sheet navigation.
    *   **Store Exposure:** Implemented `E2EStoreExposer` to safely inject state during tests without polluting production code.
*   **CI Stabilization:**
    *   **Error Overlays:** Implemented forceful CSS injection to hide Next.js development error overlays that were intercepting clicks in CI.
    *   **Login Reliability:** Simplified the login helper logic to be unconditional and robust against high-latency environments.

## [2.2.7] - 2026-01-09

**Offline Reliability & Data Consistency**

Version 2.2.7 hardens the application's offline-first capabilities and resolves critical data consistency edge cases. We have implemented a robust mutation queue for offline interactions and added self-healing logic to prevent "Ghost Visits" where local cache could drift from the server state.

### 🚀 Features
*   **Offline Mutation Queue:**
    *   **Full CRUD Support:** Users can now create, edit, and delete visits while offline. Actions are queued locally in IndexedDB and automatically synchronized when the connection is restored.
    *   **Background Sync:** The `visitStore` now actively monitors network status to replay queued mutations without user intervention.
*   **Offline Map Experience:**
    *   **Tile Fallbacks:** Improved map rendering during offline sessions to gracefully handle missing tiles.
    *   **Local Search:** Enhanced the ability to search and interact with previously cached wineries without a network connection.
*   **Debug Tools:**
    *   **Cache Management:** Added a user-facing "Clear Cache" tool in the debug menu, allowing for manual resolution of stuck data states if necessary.

### 🐛 Bug Fixes
*   **Data Consistency (Ghost Visits):**
    *   **Stale Cache Recovery:** Fixed an issue where wineries marked as "Visited" on the server but missing visit details locally would remain in a broken state. The app now forces a fresh fetch to resolve this discrepancy.
    *   **Visit Reversion:** Fixed a bug where clearing all visits for a winery failed to revert its status to "Unvisited" locally. `standardizeWineryData` now explicitly clears the visits array when the server reports `user_visited: false`.
*   **Type Safety:**
    *   **RPC Compatibility:** Relaxed `isWineryDetailsRpc` type guards to correctly handle optional `trip_info` fields, ensuring consistent data merging across different API response shapes.

## [2.2.6] - 2026-01-07

**Supabase Native Architecture Completion & UX Polish**

Version 2.2.6 represents a major architectural milestone, completing the transition to a fully "Supabase Native" backend. We have replaced legacy API routes with high-performance RPCs and Edge Functions, enforced strict database typing across the application, and significantly improved the social and planning user experience.

### 🚀 Features
*   **Supabase Edge Functions:**
    *   **Mobile-Ready Backend:** Replaced the legacy `/api/wineries/details` route with a new `get-winery-details` Edge Function. This ensures full compatibility with Bearer Token authentication used by native mobile apps.
    *   **Direct Invocation:** Updated client-side stores to invoke Supabase Functions directly, bypassing the Next.js server layer for faster response times.
*   **Social & Friends:**
    *   **Sent Requests:** Added a new "Sent Requests" section in the Friends Manager, allowing users to view and cancel pending outgoing requests.
    *   **Notification Badges:** Implemented visual notification badges on the Friends tab for incoming requests.
    *   **Real-time Updates:** Updated `AuthProvider` to fetch friend data immediately on mount, ensuring badges are accurate the moment the user logs in.
*   **Trip Planning:**
    *   **Hydration Stability:** Fixed a critical hydration mismatch in `TripPlanner` date rendering that caused navigation instability on mobile devices.

### 🛡 Security & Type Safety
*   **Strict Database Typing:** Created a manual `database.types.ts` definition to enforce strict schema alignment across the entire codebase, resolving the "Maintenance Nightmare" of loose typing.
*   **Middleware Security:** Fixed a critical logic gap in `proxy.ts` where API routes were inadvertently excluded from the authentication matcher. All `/api/*` endpoints are now properly protected.
*   **RPC Types:** Defined strict return types for `MapMarkerRpc` and `WineryDetailsRpc` to eliminate `any` usage in critical data paths.

### ⚙ Refactoring
*   **Store Architecture:**
    *   **Split Stores:** Refactored the monolithic `wineryStore.ts` into `wineryDataStore.ts` (Data/Caching) and `wineryStore.ts` (UI State). This separation of concerns improves maintainability and performance.
    *   **Standardized Data:** Created `lib/utils/winery.ts` to centralize data standardization logic using the new strict types.
*   **Trip Service Migration:** Refactored `TripService` to use the Supabase JS client directly, allowing for the deletion of the entire `app/api/trips` directory.
*   **Legacy Code Removal:** Completely deleted the obsolete `app/api/wineries` directory and associated routing logic.
*   **Test Infrastructure:** Updated E2E test mocks to intercept Edge Function calls, ensuring zero-cost testing persists with the new architecture.

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
