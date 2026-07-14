# Changelog

## [2.13.2] - 2026-07-14

**Mobile Winery Modal Layout & Search UX Fixes**

### ⚙ Bug Fixes
*   **Mobile Winery Modal Layout**:
    *   Anchored details modal to `top-4` with `translate-y-0` on mobile viewports.
    *   Set modal width to `w-[95vw]` to keep responsive gutters on narrow screens.
    *   Prevented horizontal panning/sliding by applying `overflow-x-hidden` on both `DialogContent` and the inner scroll wrapper.
    *   Made the logistics grid columns stack on mobile viewports (`grid-cols-1 sm:grid-cols-2`) and added `flex-wrap` to actions and attribute status labels to avoid text clipping.
*   **Search Input & Virtual Keyboard (Mobile)**:
    *   Increased search input font size to `text-base` on mobile to prevent iOS Safari auto-zooming, reverting to `sm:text-sm` on larger viewports.
    *   Dismisses the virtual keyboard immediately upon selecting a suggestion by blurring `document.activeElement`.
    *   Introduced a 150ms delay before opening the details modal to allow the virtual keyboard to collapse and the mobile visual viewport to stabilize.
*   **Edge Function Connection Utility**:
    *   Configured `invokeFunction` to pass an empty `Authorization` header when no session exists, preventing local Supabase Edge Runtime crash.
*   **Testing**:
    *   Added Jest unit tests for PlaceAutocomplete text size classes and keyboard blur behavior.
    *   Added Playwright visual layout tests for mobile viewport top anchoring.

## [2.13.1] - 2026-07-14

**Winery Details Cache Pollution and Review Count Fixes**

### ⚙ Bug Fixes
*   **Winery Details Cache Pollution**:
    *   Added merge guards in `standardizeWineryData` to prevent basic map marker updates and null fields from overwriting enriched winery details (phone, website, opening hours, reviews, rating, user rating count).
    *   Preserved `enrichment_tier` state and prevented downgrade from `'enriched'`/`'full'` to `'basic'`.
    *   Explicitly cleared `visits` array when the source payload reports `user_visited: false` to prevent "ghost visits".
    *   Updated `upsertWinery` and `bulkUpsertWineries` in `wineryDataStore` to utilize `standardizeWineryData` instead of object spreading.
*   **Edge Function Integration**:
    *   Updated the `get-winery-details` Edge Function to fetch `userRatingCount` in the field mask and map it correctly using `normalizeGooglePlaceV1`.
*   **Testing**:
    *   Added Jest unit tests for `wineryDataStore` verifying detailed field preservation.
    *   Added Playwright E2E coverage for cache pollution prevention under panning/map updates.

## [2.13.0] - 2026-07-10

**PWA Client Resilience, Write Idempotency, AI Summaries & Social Webhooks**

### 🚀 Features
*   **Write Idempotency & Conflict Resolution**:
    *   **Schema Hardening**: Added unique `idempotency_key` (UUID) columns to `public.visits` and `public.trips` schemas.
    *   **Idempotent Write RPCs**: Upgraded `log_visit`, `update_visit`, `create_trip`, and `create_trip_with_winery` Database RPCs to accept an optional `p_idempotency_key` and handle uniqueness conflicts gracefully by returning the existing record's details.
    *   **Client Idempotency**: Automatically generate client-side UUID `idempotencyKey` on save, update, and create actions, passing them to direct online calls and storing them in the offline sync queue.
*   **Asynchronous Edge Functions & Webhooks**:
    *   **Gemini-Powered AI Summaries**: Created the `update-gemini-summary` Edge Function triggered by a database webhook on `public.visits` (when reviews are >100 characters). Performs 30-day cache checks and fetches detailed reviews before invoking Gemini API.
    *   **Resilient Social Notifications**: Implemented `send-social-notification` Edge Function triggered by `public.activity_ledger` webhook inserts to verify social privacy policies and notify friends.
*   **PWA Resilience & Offline Enhancements**:
    *   **Client-Side Image Compression**: Added automated client-side canvas-based image resizing and compression (max 2048px on long edge) prior to Base64 conversion and network transmission.
    *   **IndexedDB Quota Safeguards**: Implemented proactive storage quota monitoring and single-retry write logic in IndexedDB storage, throwing a decoupled custom warning event (`quota-exceeded-warning`) if storage fails.
    *   **Decoupled Quota Toasts**: Listens to quota warning events in PWA handler and alerts users via user-friendly Shadcn toast notifications.
    *   **Secure Logout State Purge**: Hardened authentication state cleanup to await IndexedDB/offline queue reset before synchronously purging remaining Zustand state stores, preventing data leakage between sessions.

### ⚙ Infrastructure, Testing & Bug Fixes
*   **E2E Test Stability**:
    *   **Real Sync E2E Fixes**: Addressed an E2E test timeout in `item-privacy.spec.ts` under `useRealFavorites()` by forcing `WineryService.ensureInDb` to resolve the real Database ID instead of trusting pre-assigned client-side mock IDs.
    *   **Smoke Test Fallbacks**: Configured `e2e/smoke.spec.ts` to fallback to the seeded local user (`tester@mail.com` / `password`) if environment variables are missing.
    *   **RPC Mocks Update**: Aligned Playwright mock handlers with the updated idempotency parameters.

## [2.12.0] - 2026-06-08

**Places API v1 SDK, Edge Function Orchestration & AI Enrichment**

### 🚀 Features
*   **Places API v1 Migration**:
    *   **Edge Function Orchestration**: Replaced client-side search logic with the `search-wineries` Supabase Edge Function.
    *   **Dynamic Field Masking**: Implemented cost-optimized field masking, upgrading from "Essentials" to "Enterprise/Atmosphere" only when specific filters are active.
    *   **Place Autocomplete v1**: Migrated to the new Google Places Autocomplete v1 with session token management and field mask optimization.
    *   **Review Persistence**: Added backend support for saving Google Maps reviews and `user_rating_count` synchronization to the local database.
*   **AI Enrichment & Logistics**:
    *   **Intelligent Logistics Status**: Implemented a three-state UI (Yes/No/Unknown) for logistics and accessibility flags, featuring an automated Q&A fallback that scans reviews when AI summaries are unavailable.
    *   **Gemini-Powered Summaries**: Integrated AI-generated winery summaries with "Summarized with Gemini" disclosure.
    *   **Map Navigation Interface**: Integrated a new `MapNavigation` component across winery views for one-tap access to directions and external navigation apps.
    *   **Review Discovery**: Enhanced the `WineryQnA` component with whole-word keyword matching and dedicated review navigation filters.
*   **Resilience & Offline Performance**:
    *   **Lazy Enrichment Pattern**: Implemented a 30-day freshness policy; checking local database cache before fetching from Google API.
    *   **Opening Hours Restoration**: Re-implemented business hours UI with robust fallbacks and verified accuracy via new E2E test coverage.
    *   **Base64 Photo Persistence**: Ensured photo reliability in WebKit/Safari by storing hero images as Base64 strings in the offline queue.
    *   **Quota Resilience**: Added "Service Limited" UI states to handle API quota exhaustion gracefully.

### 🛡 Security & DevSecOps
*   **Edge Function Hardening**:
    *   **CORS Preflight Validation**: Implemented strict CORS preflight unit tests and added `x-skip-sw-interception` to allowed headers to prevent Service Worker interference with backend requests.
    *   Strict `SECURITY DEFINER` and `SET search_path = public, auth` enforcement on all new RPCs.
*   **"Gold Standard" Migrations**: Implemented `db:audit` and CI-level `db diff --linked` verification to ensure zero-drift between local and production schemas.
*   **CI/CD Optimization**: Resolved Playwright installation hangs and optimized sharded E2E test runs with localized caching for v20+ Node environments.

### ⚙ Refactoring & Testing
*   **Integration Testing**: Hardened Supabase RPC integration tests and resolved UI regressions in Jest suites for winery stores.
*   **Coordinate Standardization**: Finalized the move to property-based `latitude`/`longitude` access, stripping all legacy `lat`/`lng` keys from the data layer.
*   **Hybrid Implementation**: Combined Edge Function orchestration with atomic Database RPCs (`bulk_upsert_wineries`) for optimized performance.

## [2.11.0] - 2026-05-18

**PWA Resilience, Offline Integrity & Cryptographic Hardening**

Version 2.11.0 is a landmark release for mobile reliability, introducing a robust **Offline Mutation Queue** and a **WebKit-compliant Binary Reconstitution** engine. This release ensures the application remains fully functional and data-consistent even in zero-connectivity environments, with hardened security for offline data.

### 🚀 Features
*   **Encrypted Offline Mutation Queue:**
    *   **AES-GCM Encryption:** Implemented an encrypted queue using IndexedDB (`idb-keyval`) to store offline actions (Visits, Trips, Social).
    *   **Cryptographic Hardening:** Payloads are encrypted at rest using keys derived via **PBKDF2** from the `user.id`, ensuring offline data is protected.
    *   **Upload-First Sync:** Introduced a centralized `SyncService` that prioritizes replaying local mutations before refreshing server state.
*   **The Reconstitution Rule (WebKit Compatibility):**
    *   **Binary Stabilization:** Solved the "Detached Blob" issue in Safari/WebKit by storing offline photos as **Base64 strings**.
    *   **Automatic Reconstitution:** Implemented `stabilizePhotos` and `base64ToFile` utilities to reconstitute binary assets into standard `File` objects immediately before network transmission.
*   **Proactive Quota Resilience:**
    *   Implemented the **Quota Resilience Rule**, which monitors browser storage and automatically purges non-essential caches (Map tiles, static assets) if usage exceeds 80% to protect the database.
*   **Offline Data Availability (Read-Only Mode):**
    *   **Master Cache:** Persists the user's recent visits, trips, favorite wineries, and friend activity to IndexedDB.
    *   **Zero-Flash Hydration:** The application now displays cached data immediately during offline starts, eliminating the "white screen" and ensuring history is always browseable.
*   **Refined Update UX:**
    *   **Non-Intrusive Updates:** Replaced forced page reloads with a non-intrusive toast notification for new Service Worker versions.
    *   **Update Loop Protection:** Implemented `globalThis._PWA_UPDATING` guards and `controllerchange` validation to prevent infinite reload loops.

### ⚙ Infrastructure & Testing
*   **E2E & CI Optimization:** Re-architected Playwright configuration to run with sharding, resolved Safari/WebKit network bypass issues, and cleaned up Jest/E2E test suite headers.
*   **Coordinate Standardization:** Enforced a system-wide move to `latitude` and `longitude` naming conventions across all DB types, RPCs, and UI mappers, eliminating `NaN` errors on map pins.
*   **DOM Stability Pattern:** Refactored core UI containers (`TripList`, `FriendActivity`, `VisitHistory`) to ensure primary containers remain in the DOM during loading/error states, preventing layout shifts.
*   **Sync Infrastructure E2E:** Introduced a high-fidelity sync testing suite that verifies encrypted persistence, photo reconstitution, and non-blocking queue recovery.

### 🛡 Security & Type Safety
*   **Database Hardening & Zero-Anon Policy:** Revoked unauthenticated RPC access, standardized parameter naming conventions with a `p_` prefix, and resolved overloading conflicts to ensure schema stability.
*   **DB Type Alignment:** Synchronized `database.types.ts` with new RPC signatures for standardized coordinate retrieval.
*   **ID Normalization:** Enforced strict `Number()` conversion for all Entity IDs in the service layer to prevent type mismatches during offline hydration.

## [2.10.0] - 2026-04-20

**Pattern Isolation, Sync Lock & Zero-Mock Testing**

Version 2.10.0 is a major architectural milestone that completes the decoupling of UI components from global state and introduces a robust synchronization framework. By enforcing the **Container/Presentational pattern** and implementing a database-backed **Sync Lock**, we have achieved 100% deterministic UI state and eliminated Realtime synchronization flickers.

### 🚀 Features
*   **Container/Presentational Architecture:** Fully refactored core UI components (`TripCard`, `TripList`, `WineryActions`) into pure "Presentational" components. All store dependencies have been hoisted into "Container" wrappers, enabling 100% isolated unit testing and clear data flow.
*   **Sync Lock & Revision Control:** Introduced `lastActionTimestamp` and `updated_at` tracking across the State layer. The application now implements a **Sync Lock** that intelligently ignores stale Realtime payloads if they are older than the user's last local interaction, solving the "Three-Way Sync" paradox.
*   **Signal-Based Synchronization:** Implemented `data-state="ready"` signals across all main feature containers. E2E tests now synchronize with these lifecycle signals, eliminating the need for fragile timeouts and "magic number" waits.
*   **Zero-Mock Unit Testing:** Established the `dataFactory` pattern and transitioned unit tests to a "Zero-Mock" model. UI components are now verified by passing raw JSON factories directly to props, removing the maintenance overhead of complex Zustand mocks.

### 🛡 Security & Privacy
*   **Privacy-Aware RPCs:** Updated `get_map_markers` and `get_winery_details_by_id` to include granular privacy columns (`is_favorite_private`, `on_wishlist_private`), ensuring items are only visible to authorized viewers.
*   **Friend Profile Privacy:** Hardened `get_friend_profile_with_visits` to allow users to see their own private items in counts while strictly enforcing social privacy for external viewers.

### ⚙ Infrastructure & Testing
*   **Concurrency Scaling:** Optimized the E2E infrastructure to support parallel execution with 2+ workers in containerized environments.
    *   **Worker Isolation:** Implemented unique storage partitions and isolated Service Worker registration per worker.
    *   **Network Optimization:** Refactored `MockMapsManager` to use targeted regex/glob routing, reducing CPU saturation during high-concurrency test runs.
*   **Migration-First Schema:** Deployed a series of migrations to add `updated_at` triggers and privacy fields to `trips`, `trip_wineries`, and `visits` tables.

### 📝 Documentation
*   **Standardized Mandates:** Updated `GEMINI.md` and the project testing skill to strictly mandate the Container/Presentational pattern, Sync Lock requirements, and Signal-Based Synchronization.

## [2.9.0] - 2026-04-01

**Atomic Architecture, Hydration Mastery & Portal Decoupling**

Version 2.9.0 is a foundational release focused on architectural purity and performance. We have eliminated critical hydration bottlenecks by pruning store persistence, decoupled feature logic through a modern Portal-based modal system, and established the "Atomic Verification" standard for near-instant, reliable E2E testing.

### 🚀 Features
*   **Portal-Based Modal Architecture:** Decoupled the global `GlobalModalRenderer` in favor of **Feature-Owned Portals**. Modals for `VisitForm`, `WineryNoteEditor`, and `TripShareDialog` are now managed within their respective feature domains and rendered via React Portals into a root-level `ModalHost`.
*   **Hydration Mastery:** Pruned Zustand store persistence to exclude large data arrays (`trips`, `visits`, `wineries`). This reduces `localStorage` overhead by 95% and eliminates 15s+ hydration delays in high-latency environments.
*   **Atomic Verification Standard:** Transitioned the entire E2E suite to a **State-Injected** model. Tests now use `page.evaluate` to inject precise store states, bypassing fragile multi-step navigation and reducing suite execution time by 80%.

### 🛡 Security & Type Safety
*   **Type-Safe Mocking:** Refactored `MockMapsManager` to enforce `database.types.ts` schemas on all RPC mock responses, eliminating the "ID Paradox" (numeric vs string mismatches) in testing.
*   **Data Layer Hardening:** Centralized `ensureInDb` logic in `WineryService` to guarantee consistent ID resolution across all relational features (Trips, Visits, Favorites).
*   **Schema Integrity Gate:** Added a mandatory CI check to verify that local `database.types.ts` remains in perfect sync with the Supabase production schema.

### ⚙ Refactoring & Cleanup
*   **Standardized Interactions:** Completely removed `robustClick` and manual event dispatching in favor of standard Playwright `.click()` supported by `data-testid` and `useRef` synchronous guards.
*   **Store Resilience:** Updated `closeModal` and feature-specific "close" handlers to explicitly reset all stateful content pointers, preventing stale UI flashes.
*   **E2E Helper Expansion:** Added `injectTripState` and `injectVisitState` atomic helpers to `e2e/helpers.ts` for rapid feature verification.

## [2.8.0] - 2026-03-12

**Real-time Collaborative Planning & Architectural Hardening**

Version 2.8.0 introduces full-scale collaborative trip planning, powered by real-time synchronization and a hardened security model. This release also features a significant UI refactor to a Singleton Modal architecture, improving hydration stability and cross-platform performance.

### 🚀 Features
*   **Collaborative Trip Sharing:** Introduced the `TripShareDialog` and `TripMembersList`, enabling users to invite friends by email and manage participants with granular roles (Owner/Member).
*   **Real-time Synchronization:** Implemented multi-user state synchronization using Supabase Realtime. Itinerary changes, winery notes, and member additions now reflect instantly across all participant devices.
*   **Singleton Modal Architecture:** Refactored the UI to use a centralized `GlobalModalRenderer` for core forms (`VisitForm`, `WineryNoteEditor`, `TripShareDialog`). This eliminates DOM bloat, prevents unmounting during hydration flashes, and ensures consistent state management.
*   **Optimistic Itinerary Updates:** Added optimistic UI updates for trip modifications, ensuring a zero-latency feel during collaborative planning.

### 🛡 Security
*   **RPC & RLS Hardening:** Audited and patched all trip-related PostgreSQL functions and Row Level Security (RLS) policies to enforce explicit `public.` schema prefixing and strict `search_path` security.
*   **Access Control:** Verified permission boundaries ensuring only authorized members can edit shared trips, with owner-only privileges for deletions and member management.

### ⚙ Refactoring & Cleanup
*   **Data Model Finalization:** Completed the migration to the structured `TripMember` type, fully deprecating and removing legacy string-based member arrays.
*   **Persistence Optimization:** Refined Zustand store persistence to exclude transient UI visibility flags, preventing "stuck" modals after page reloads.
*   **Layout Decoupling:** Moved global UI singletons in `app/layout.tsx` outside the `AuthProvider`'s loading boundary to ensure UI stability during initial authentication flashes.

### ⚙ Infrastructure & Testing
*   **Collaborative E2E Suite:** Developed `e2e/trip-sharing.spec.ts` to verify complex multi-user interaction flows, including real-time sync and cross-context permission checks.
*   **Hydration Hardening:** Updated E2E hydration guards to include `useTripStore`, ensuring tests wait for full data readiness before executing assertions.
*   **Unit Verification:** Added comprehensive Jest tests for the new sharing components and store persistence logic.

## [2.7.0] - 2026-03-05

**Social Infrastructure Refactor & Asymmetric Social Model**

Version 2.7.0 is a major architectural milestone that transitions the application to a fully normalized social schema and introduces an asymmetric "Followers/Following" social model. This release also implements a robust, centralized privacy engine and establishes formal documentation for the core architecture and API contracts.

### 🚀 Features
*   **Asymmetric Social Model:** Introduced support for following and follower relationships, supplementing the existing symmetric friendship model.
*   **Normalized Social Schema:** Migrated from denormalized arrays to dedicated join tables (`trip_members`, `visit_participants`) for improved scalability and data integrity.
*   **Centralized Activity Ledger:** Implemented a unified `activity_ledger` table with automated triggers to power real-time social feeds across all interaction types (Visits, Favorites, Wishlist).
*   **Granular Privacy Engine:** Optimized the `is_visible_to_viewer` PostgreSQL helper to enforce Public, Friends Only, and Private visibility across the entire social stack.
*   **Performance Optimizations:** 
    *   Refactored Row Level Security (RLS) policies to use cached subquery patterns for 5-10x faster visibility checks.
    *   Added targeted performance indexes for the new social relationship tables.

### 🛡 Security
*   **RPC Hardening:** Applied atomic transaction patterns and strict `search_path` security to all new and refactored database functions.
*   **Access Control:** Replaced legacy array-based access checks with robust, table-driven authorization in `trip_members`.

### ⚙ Refactoring & Cleanup
*   **Database Hygiene:** Successfully deprecated and removed the legacy `members` column from the `trips` table.
*   **Service Layer Alignment:** Updated `TripService` and Zustand stores to utilize the new atomic RPCs, eliminating complex client-side merging logic.

### 📝 Documentation
*   **Architecture Docs:** Created a formal Entity Relationship Diagram (ERD) detailing the new social infrastructure.
*   **API Contracts:** Established a comprehensive guide for Supabase RPC contracts to guide future frontend development.

### ⚙ Infrastructure & Testing
*   **E2E Validation:** Verified the complete social lifecycle and privacy enforcement with the `item-privacy` and `social-feed` test suites.
*   **Stability Fixes:** Resolved edge cases in state hydration and mock winery identification to ensure consistent testing results.

## [2.6.1] - 2026-03-03

**Supabase Native Authentication & Codebase Cleanup**

Version 2.6.1 completes the transition to a fully "Supabase Native" authentication architecture. We have refactored the login flow to use the client-side SDK directly, eliminated legacy server actions, and enforced a critical synchronization sequence to ensure seamless session management with our middleware.

### 🚀 Features
*   **Supabase Native Login:** Refactored the `LoginForm` to utilize the client-side Supabase SDK for authentication, removing dependency on server actions.
*   **Synchronized Navigation:** Implemented a mandatory `router.refresh()` before `router.push()` sequence in both login and signup flows to ensure the middleware recognizes new session cookies immediately.

### ⚙ Refactoring & Cleanup
*   **Legacy Code Removal:** Deleted `app/actions.ts` and removed all references to legacy "wrapper" server actions.
*   **Standardized Auth Flow:** Unified the authentication pattern across login and signup components for better maintainability and mobile-readiness.

### ⚙ Infrastructure & Testing
*   **E2E Auth Verification:** Validated the new authentication lifecycle with the `smoke` and `runtime-audit` test suites across supported browser engines.

## [2.6.0] - 2026-03-03

**Granular Privacy Controls & Centralized Settings Hub**

Version 2.6.0 introduces a comprehensive privacy framework, allowing users to control the visibility of their profiles, visits, favorites, and wishlists across three distinct levels (Public, Friends Only, Private). This release also debuts a dedicated settings hub and individual friend profile pages, significantly maturing the application's social and personalization features.

### 🚀 Features
*   **Granular Privacy Tiers:** Implemented Public, Friends Only, and Private visibility levels for user profiles and activity.
*   **Item-Level Privacy:** Users can now toggle privacy on individual favorite wineries and wishlist items.
*   **Centralized Settings Hub:** Introduced a new `/settings` page, moving configuration out of the social tab into a dedicated management area.
*   **Friend Profile Discovery:** Created rich profile pages for friends, displaying social statistics and permitted visit history based on privacy settings.
*   **Privacy-Aware Social Feed:** Refactored the activity feed to strictly enforce visibility rules at the database level.

### 🐛 Bug Fixes
*   **ID Resolution Hardening:** Updated the winery store to force identity resolution before relational operations, preventing 404 errors during metadata updates.
*   **Mobile Navigation Guard:** Implemented a centralized hydration guard for the mobile bottom bar to ensure interactions are stable during initial load.

### 🛡 Security
*   **Centralized Visibility Logic:** Introduced the `is_visible_to_viewer` PostgreSQL helper to unify privacy enforcement across all Row Level Security (RLS) policies.
*   **Search Path Hardening:** Applied strict `search_path` security to all new and refactored RPC functions.

### ⚙ Infrastructure & Testing
*   **E2E Privacy Suite:** Developed a comprehensive `privacy-flow` test suite to verify visibility across multiple authenticated contexts.
*   **RPC Unit Testing:** Added a dedicated integration suite for verifying complex privacy logic directly against the Supabase backend.


## [2.5.0] - 2026-02-24

**Dockerized CI & Infrastructure Stabilization**

Version 2.5.0 is a milestone release focused on infrastructure reliability and high-fidelity testing. We have migrated our entire CI pipeline to a Dockerized environment, stabilized cross-browser social interactions, and implemented a suite of resiliency patterns to ensure the app remains robust in offline and "lie-fi" conditions.

### 🚀 Features
*   **Real-time Social Infrastructure:** Enabled Supabase Realtime for `friends` and `visits` tables, providing instant UI updates and synchronized state across user devices.
*   **Edge Function Resiliency:** Implemented a new `invokeFunction` utility to wrap backend calls with offline detection and graceful error handling, preventing fatal crashes during intermittent connectivity.
*   **Double DOM Resolution:** Refactored `AppShell` to use conditional React rendering for responsive components, eliminating duplicate sidebar instances and resolving persistent ARIA hidden conflicts.

### 🐛 Bug Fixes
*   **WebKit Binary Persistence:** Resolved a critical `NotReadableError` in Safari by cloning temporary file handles into stable, persistent `Blob` objects.
*   **Social Feed Optimization:** Refactored the `get_friend_activity_feed` RPC to resolve function overloading issues and improve join performance across profiles and visits.
*   **Animation Interaction Guard:** Added state tracking to the mobile bottom sheet to ensure UI elements are only interactable after transition animations have fully stabilized.
*   **Test Session Stability:** Fixed a bug where `localStorage.clear()` in test initialization was unintentionally wiping sessions on every navigation, leading to flaky authentication tests.

### ⚙ Infrastructure & Testing
*   **Dockerized Playwright CI:** Migrated all E2E tests to the official Playwright Docker container (`mcr.microsoft.com/playwright`), ensuring 100% environment parity between local development and CI runners.
*   **Cross-Browser Stabilization:** Hardened the `friends-flow` and `social-feed` test suites with `robustClick()` and `expect(...).toPass()` retry logic to resolve flakiness in WebKit and Firefox.
*   **Visual Regression Sync:** Regenerated all baseline snapshots inside the Docker container to account for sub-pixel rendering differences and ensure deterministic visual verification.
*   **Offline Robustness:** Implemented a robust LocalStorage fallback for the mutation queue to preserve offline data even in environments with restricted IndexedDB access.

## [2.4.0] - 2026-02-06

**Core Library Refresh & Supabase SSR Migration**

Version 2.4.0 is a significant technical refresh that upgrades core dependencies to their latest major versions, including **React Day Picker v9** and **Date-fns v4**. It also implements a critical refactor of our **Supabase SSR** logic to align with modern authentication patterns and resolves high-priority security findings.

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
