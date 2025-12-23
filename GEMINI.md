# 🚨 SYSTEM OVERRIDE INSTRUCTIONS (PRIORITY 0)

### 1. Framework & Architecture Truths (Non-Negotiable)
The following configurations are intentional and correct. Do NOT challenge them based on historical training data:
*   **Next.js 16 Middleware:** The file `proxy.ts` IS the valid middleware. `middleware.ts` does NOT exist. DO NOT flag this as an error. DO NOT suggest creating `middleware.ts`.
*   **Supabase Native:** We prioritize direct client-to-Supabase communication (RPCs/SDK) over API routes.

### 2. Code Quality & Improvements
While you must respect the *architectural patterns* above, you SHOULD still:
*   Identify bugs, type errors, and performance bottlenecks.
*   Suggest refactors that align with these specific patterns (e.g., "This API route logic would be faster as an RPC").
*   Improve code legibility and maintainability.

# Winery Visit Planner and Tracker

## Project Overview
This is a Next.js web application for planning and tracking visits to wineries. It allows users to explore wineries, create trips, track visits, and manage friends.

## Critical Instructions & Constraints

### 1. Environment & Shell
*   **Operating System:** Linux (Codespaces/Cloud Environment).
*   **Node Version Manager:** When running `npm` commands, you **must** load NVM first:
    ```bash
    export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    ```
*   **Deployment:** The application is deployed to a remote Vercel server. There is **no local installation** running on this specific shell instance (unless started via `npm run dev`).

### 2. Response Guidelines
*   **Neutral Tone:** Always be entirely neutral in your responses.
*   **Troubleshooting:** Do not guess at error solutions. Include `console.log` statements to troubleshoot issues properly before attempting fixes.
*   **Caching:** **Never** change the caching strategy for the application.

### 3. Database Management (Supabase)
*   **Source of Truth:** The `supabase/migrations` folder is the **single source of truth** for the database schema.
*   **Forbidden Actions:**
    *   Do NOT manually edit the database via the Supabase Dashboard.
    *   Do NOT edit `scripts/consolidated-schema.sql`.
    *   **Do NOT edit existing migration files.** Once a migration file is created and committed, it is immutable.
*   **Migration Workflow:**
    *   ALWAYS create a **new** migration file for ANY database change.
    *   Preferred command: `npx supabase migration new <description_of_change>`
    *   If the command fails (e.g., due to missing Docker), create a new file manually in `supabase/migrations/` with the format `YYYYMMDDHHMMSS_description.sql`, ensuring the timestamp is strictly sequential.
    *   **Edit SQL:** Write the specific SQL changes (e.g., `CREATE TABLE`, `ALTER POLICY`) in the newly generated file.
    *   **Deploy:** `npx supabase db push`

### 4. Middleware Configuration
*   **File:** `proxy.ts` is used instead of `middleware.ts`.
*   **Context:** This project uses Next.js 16+. The standard `middleware.ts` convention is replaced by `proxy.ts` for handling middleware logic (auth checks, session updates). Do not create a `middleware.ts` file.

## Tech Stack

*   **Framework:** Next.js 16 (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS, Radix UI (via shadcn/ui)
*   **State Management:** Zustand (`lib/stores/`)
*   **Database/Auth:** Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
*   **Maps:** Google Maps Platform (`@vis.gl/react-google-maps`)
*   **Forms:** React Hook Form + Zod
*   **Testing:** Jest + React Testing Library + Playwright E2E

## System Architecture & Patterns

### 1. State Management & Data Flow
*   **Zustand Stores (`lib/stores/`):** The primary source of truth for client-side state.
    *   **`wineryStore`:** (UI Store) Manages UI state (modal open/close, loading), filtering, and delegates data operations to `wineryDataStore`.
    *   **`wineryDataStore`:** (Data Store) Manages the global cache of `Winery` objects, handles hydration, CRUD operations, and syncs with Supabase.
    *   **`tripStore`:** Manages trip creation, updates, and the "Active Trip" state (`selectedTrip`) for the map overlay.
    *   **`visitStore`:** Manages the global `visits` list, handles creation/editing/deletion with optimistic updates across all history views.
    *   **`friendStore`:** Manages friend list, requests, and activity.
*   **Service Layer (`lib/services/`):** Static classes that encapsulate API calls. Stores call Services; Components call Stores.

### 2. "Supabase Native" Architecture (Mobile-First)
**⚠️ ARCHITECTURE STATE:** The application uses a **Hybrid Architecture**.
*   **API Routes (`app/api/*`):** These are **ACTIVE and CRITICAL**. They handle Authentication, Friend management, and complex server-side logic that requires middleware processing or third-party integrations. Do NOT delete these.
*   **RPCs & Server Actions:** These are the **preferred method for Data Fetching** and simple user interactions (e.g., toggles) to ensure performance and type safety.

We enforce a "Thick Client, Thin Server" architecture to support future mobile development.

*   **Authentication:** **Hybrid State.** Core flows (Login, Signup, Logout) rely on standard API routes (`app/api/auth/*`). Some newer interactions use Server Actions (`app/actions.ts`). Both are valid.
*   **Data Fetching:**
    *   **Preference:** Client-side stores should communicate **directly** with Supabase using `@supabase/supabase-js` or RPCs for read operations to minimize latency.
    *   **Usage:** `app/api/*` is used for logic-heavy operations (e.g., Auth, syncing Wineries from Google).
    *   **Rule:** Do not migrate logic from `app/api` to RPCs unless there is a clear performance benefit. Do NOT delete `app/api/*`.
*   **RPCs:** We rely heavily on PostgreSQL functions (RPCs) for complex joins and logic.
*   **Type Safety:** `lib/database.types.ts` is the generated source of truth for DB types. `lib/types.ts` imports from it.

### 3. ID System (Strict Typing)
To prevent "Dual-ID" confusion, we use branded types in `lib/types.ts`:
*   **`GooglePlaceId` (string):** Used for API lookups and Map markers.
*   **`WineryDbId` (number):** The Supabase Primary Key. Used for relational data.
*   **Rule:** Always cast explicit IDs to these types. Never assume `string | number`.

### 4. Optimistic Updates Strategy
We use a comprehensive optimistic update strategy to ensure UI responsiveness.
*   **Pattern:** Update Zustand store immediately -> Call API/RPC -> Revert store on error -> (Optional) Refetch/Confirm on success.
*   **Key Implementations:**
    *   **`visitStore`:** Manages a global `visits` list. Optimistically adds/removes visits from both the global list and the specific winery in `wineryDataStore`.
    *   **`tripStore`:** Optimistically appends wineries to trips and updates both 'Upcoming' and 'Date-specific' lists.

### 5. Navigation & Map Context Logic
*   **Active Trip (`selectedTrip`):**
    *   **Activation:** Occurs when a user selects a trip from the dropdown on the Map controls OR clicks the "On Trip" badge in a `WineryModal`.
    *   **Persistence:** This state is global (Zustand) and persists across client-side navigation.
    *   **Reset Rule:** To prevent the map from getting "stuck" on a trip, navigating to or away from a **Trip Details Page** (`/trips/[id]`) **MUST** explicitly clear the active trip (`setSelectedTrip(null)`).

### 6. Trips Tab Architecture
The Trips tab is consolidated into a single view managed by `TripList`.
*   **Happening Today:** Priority section for trips occurring on the current date.
*   **Upcoming:** Chronological list of future trips.
*   **Past:** Toggleable view for historical data.
*   **New Trip:** Integrated modal trigger in the header.

### 7. Friend Request Notifications
*   **Immediate Fetch:** Friend data, including pending requests, is fetched immediately upon user authentication to ensure notification badges are up-to-date.
*   **Notification Badges:** Visual indicators (red circles with counts) are displayed on the "Friends" tab.

## Key References (Maps & Tools)

### UI Architecture (Layout)
*   **Responsive Controller:** `AppShell` (`components/app-shell.tsx`) is the central orchestrator. It manages the state for switching between the **Desktop Sidebar** (`AppSidebar`) and the **Mobile Bottom Drawer** (`InteractiveBottomSheet`).
*   **Modals:** `WineryModal` and `VisitHistoryModal` are rendered at the root level in `AppShell` to prevent duplicate mounting and ARIA conflicts.

### Key Database RPCs (Power Tools)
*   **Data Fetching:**
    *   `get_map_markers(user_id_param)`: Lightweight fetch for initial map load. Accepts explicit user ID to ensure flags (`is_favorite`) are correct.
    *   `get_winery_details_by_id(id)`: Lazy-loads full details (reviews, hours).
    *   `get_paginated_visits_with_winery_and_friends`: Fetches visit history efficiently.
*   **Logic & Transactions:**
    *   `create_trip_with_winery`: Atomically creates a trip and adds the first winery.
    *   `add_winery_to_trip`: Handles upsert logic for wineries.
    *   `ensure_winery(p_winery_data)`: Security-definer RPC used to safely insert/get a winery ID, bypassing RLS `UPDATE` restrictions during favorite/wishlist toggles.
*   **Social:**
    *   `get_friends_activity_for_winery`: Returns JSON of friends who favorited/wishlisted a winery.

### Core Custom Hooks
*   **`useWineryMap`:** The "Brain" of the map view. Aggregates store data, handles map clicks, and manages the Google Maps instance.
*   **`useTripActions`:** Encapsulates trip-specific logic like "Export to Google Maps".

## Project Structure

```
/
├── app/                 # Next.js App Router pages and API routes
│   ├── actions.ts       # Server Actions (Auth, Favorites)
│   ├── api/             # Active API Routes (Auth, Wineries)
│   ├── (routes)/        # Page routes
│   └── layout.tsx       # Root layout
├── components/          # React components
│   ├── ui/              # Reusable UI components (shadcn/ui)
│   ├── VisitCardHistory.tsx # Reusable history list
│   ├── VisitHistoryView.tsx # Full page history view
│   └── [feature].tsx    # Feature-specific components
├── e2e/                 # Playwright E2E tests
├── lib/                 # Core logic
│   ├── stores/          # Zustand stores (Logic Hub)
│   ├── services/        # Service layer (API Wrappers)
│   ├── utils/           # Utility functions (winery.ts data standardization)
│   ├── database.types.ts # Generated Supabase types
│   └── types.ts         # TypeScript interfaces (Branded types)
└── supabase/            # Database configuration
```

## Common Pitfalls & "Gotchas"

### 1. The Dual-ID System (Solved but Dangerous)
*   **Concept:** Wineries have `id` (Google String) and `dbId` (Supabase Integer).
*   **The Trap:** Mixing these up causes foreign key constraints to fail.
*   **The Fix:** Use `GooglePlaceId` and `WineryDbId` types. RPCs for *actions* (like adding a visit) usually require the `dbId`.

### 2. Derived State in Optimistic Updates
*   **Concept:** Zustand stores often have derived arrays (e.g., `trips` vs `tripsForDate`).
*   **The Trap:** Updating the "main" array (`trips`) during an optimistic update **does not** automatically re-compute the derived array (`tripsForDate`) if the logic is manual.
*   **The Fix:** When writing optimistic logic, update **all** relevant state arrays.

### 3. Testing Zustand with Mocks
*   **Concept:** We use `jest.mock` to bypass the actual Zustand store.
*   **The Trap:** Tests will crash if you add a new action to the Store but forget to add a mock implementation for it.
*   **The Fix:** Always check the `beforeEach` block in the test file.

### 4. Zustand Reactivity & `useMemo` Dependencies
*   **Concept:** When a Zustand store provides data through getter *functions* (e.g., `getWineries: () => useWineryDataStore.getState().persistentWineries`), the function reference itself remains stable.
*   **The Trap:** Including such a getter function in a `useMemo` dependency array (e.g., `[getWineries]`) will NOT cause `useMemo` to re-evaluate when the underlying data (`persistentWineries`) changes. The `useMemo` will only re-run if the *function reference* itself changes, which it typically does not. This leads to stale data being used by components.
*   **The Fix:** Always subscribe directly to the specific reactive state from the Zustand store you need. For example, instead of `const { getWineries } = useWineryStore();`, use `const persistentWineries = useWineryDataStore((state) => state.persistentWineries);` and include `persistentWineries` in your `useMemo` dependency array. This ensures components re-render when the data truly changes.

### 5. Map Lifecycle & `idle` Events in E2E
*   **Concept:** The winery list relies on the map's `idle` event to trigger initial search.
*   **The Trap:** In mocked E2E environments where map tiles are blocked, the `idle` event may not fire, resulting in an empty winery list.
*   **The Fix:** Use a manual "Search This Area" trigger in E2E tests to bypass the map's lifecycle dependency.

### 6. Radix UI & Pointer Events in Playwright Mobile
*   **Concept:** Radix UI primitives (like `TabsTrigger`) often rely on complex pointer event sequences (`pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`) to handle focus and state changes correctly.
*   **The Trap:** In Playwright mobile emulation (especially with touch enabled), a simple `page.click()` or `element.evaluate(el => el.click())` may fail to trigger the state change because it lacks the full event sequence Radix expects.
*   **The Fix:** Manually dispatch the full pointer event sequence using `element.dispatchEvent` in an `evaluate` block. See `e2e/helpers.ts` -> `navigateToTab` for the implementation.

### 7. Temporary IDs and Interaction Guards
*   **Concept:** Newly created trips use negative temporary IDs until saved to Supabase.
*   **The Trap:** Attempting to add wineries or modify members of a trip with a negative ID will fail at the database level.
*   **The Fix:** Components (like `TripCard`) must disable modification buttons (Edit, Add Member) when `trip.id < 0`.

### 8. Modal Scrolling Race Conditions
*   **Concept:** Hydrating visits after a modal opens can trigger "scroll to history" effects.
*   **The Trap:** Modals may jump to the middle or bottom during initial load.
*   **The Fix:** Use a `hasHydrated` ref to distinguish between initial data load and manual visit additions. Consolidate scroll resets into effects that fire only when `isLoading` is false.

### 9. ARIA Hidden Conflicts (Nesting)
*   **Concept:** Radix `Dialog` applies `aria-hidden` to siblings to enforce modality.
*   **The Trap:** Rendering multiple dialogs or nesting them inside components that are duplicated (like a mobile/desktop sidebar) causes "Blocked aria-hidden" warnings and focus loss.
*   **The Fix:** Render global modals (`WineryModal`, `VisitHistoryModal`) exactly once at the app root (`AppShell`). Decouple modal transitions with small `setTimeout` delays to allow one to start closing before the next opens.

## Future Implementations
*   **Mobile App:** The future desired state for the web application is to have both the web browser capability and an app deployed to mobile app stores. This necessitates ensuring that RPC functions are prioritized over API routes to ensure mobile application functionality. 

### Completed Refactors
1.  Architecture: Moved to "Supabase Native" for Trips. Removed API routes for Trips.
2.  Store Split: wineryStore.ts split into Data/UI stores.
3.  Optimization: Initial load only fetches markers. Visits are lazy-loaded.
4.  Testing: Implemented comprehensive Playwright E2E suite covering Auth, Trips, and Friends. Removed navigation workarounds after stabilizing hydration.
5.  Stability: Fixed critical hydration error in TripPlanner by implementing client-side mounting guards for date rendering, resolving mobile navigation state failures.
6.  UI Stability: Fixed DatePicker popover persistence in Tablet/Desktop viewports which was obstructing interactions (checkboxes/inputs) during E2E tests. Implemented controlled state to auto-close on selection.
7.  **Edit Visit Bug Fixed:** Resolved a bug where the 'Edit' button in the global history view failed to open the winery modal. Created migration `20251219132855_fix_get_paginated_visits_return_fields.sql` to add `google_place_id` to the RPC and refactored `VisitHistoryModal` for type safety.
8.  **E2E Test Suite Refactor & Stabilization:** 
    *   Centralized helpers in `e2e/helpers.ts` to ensure 100% consistency across `friends`, `trip`, and `visit` flows.
    *   Implemented robust mobile navigation: helpers now automatically handle expanding the `InteractiveBottomSheet` and account for animation delays.
    *   Resolved strict-mode violations by ensuring locators disambiguate between mobile and desktop UI instances.
9.  **Zero-Cost E2E Infrastructure:**
    *   Implemented a **Strict Blocking & Mocking** policy in `e2e/utils.ts`. 
    *   All costly Google Maps API requests (Places, Search, Details) are intercepted or aborted at the network level, ensuring **$0 API spend** during testing.
    *   **Ghost Tiles:** Map tile requests are fulfilled with transparent PNGs to maintain Map SDK functionality without hitting Google servers.
    *   **RPC Mocking:** The `get_map_markers` RPC is mocked to provide stable, name-agnostic data for testing.
    *   **Full Integrity Toggle:** Added `E2E_REAL_DATA=true` flag to bypass all mocks for periodic real-world verification.
10. **Test Environment Reliability:** Implemented automated cleanup of stale `.next` lock files and zombie `next dev` processes to resolve runner stalling issues.
11. **Hydration Error Fix:** Resolved a React hydration error in `WineryDetails.tsx` by replacing an invalid nested `DialogDescription` (rendered as `p`) with a standard `div`.
12. **Mobile Test Fixes:** Resolved `visit-flow` failures on mobile by implementing robust pointer event dispatching for Radix UI `TabsTrigger` in `e2e/helpers.ts`.
13. **Supabase Native Refactor (Visits):** Refactored `visitStore` and `VisitHistoryView` to use the Supabase SDK directly, eliminating dependency on `app/api/visits`.
14. Dead Code Removal:** Deleted obsolete `app/api/visits` directory and unused handlers in `app/api/friends`.
15. **v2.2.2 UX & Data Overhaul:**
    *   **Centralized Visit Management:** Unified visit state in a global store with cross-component optimistic updates.
    *   **Trips UI Refactor:** Consolidated trip views, removed legacy calendar, and implemented a mobile-optimized chronological layout.
    *   **Modal Stability:** Resolved race conditions in modal scrolling and ARIA hidden conflicts by moving modals to the app root and implementing hydration guards.
    *   **Type Safety:** Implemented `VisitWithWinery` type and resolved ID type mismatches in store mutations.
    *   **Hydration Fixes:** Ensured winery details are always fetched when opening modals from history or table views.
16. **React 19 / Next.js 16 Alignment:**
    *   **Type Safety:** Replaced deprecated `React.ElementRef` with `React.ComponentRef` across all UI components.
    *   **Context Refactor:** Updated `<Context.Provider>` to the new direct `<Context>` usage pattern.
    *   **Verification:** Validated changes with full TypeScript check and E2E test suite.
17. **Supabase Native Refactor (Friends):** Refactored friend request and response logic to use Supabase RPCs (`send_friend_request`, `respond_to_friend_request`), eliminating dependency on `app/api/friends`. Verified via multi-user E2E tests.
18. **Supabase Native Refactor (Wishlist & Favorites):** Refactored `toggleWishlist` and `toggleFavorite` logic to use Supabase RPCs (`toggle_wishlist`, `toggle_favorite`), streamlining database interactions and removing "Thick Server" logic from `app/actions.ts`. Verified with E2E tests.

## End-to-End Testing (Playwright)

We have established a robust E2E testing infrastructure using **Playwright**.

### 1. Key Test Suites (`e2e/`)
*   **`smoke.spec.ts`:** Verifies basic app health, routing, and auth redirection.
*   **`trip-flow.spec.ts`:** Tests the core "Trip Planning" value loop.
*   **`visit-flow.spec.ts`:** Tests visit logging, editing, and deletion (name-agnostic).
*   **`friends-flow.spec.ts`:** Tests complex **Multi-User / Real-Time** interactions using two distinct browser contexts.

### 2. Testing Environment & Concurrency
*   **Dynamic User Isolation (`e2e/utils.ts`):** We use a "Fresh User" strategy. Every test creates one or more unique ephemeral users via the Supabase Admin API and deletes them after the test completes. 
*   **Parallel Execution:** Because tests are fully isolated by user, we run tests in **parallel** (multiple workers) in CI to minimize build times.
*   **Secrets (GitHub Actions):**
    *   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    *   `SUPABASE_SERVICE_ROLE_KEY` (CRITICAL for dynamic user creation/deletion)
    *   `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

### 3. Best Practices & Stability
*   **Selectors:** Use `data-testid` to distinguish between responsive duplicates (Mobile Sheet vs Desktop Sidebar).
*   **Mobile Safari (WebKit) Stability:**
    *   **Login:** Use `page.keyboard.press('Enter')` instead of clicking the "Sign In" button, which can be flaky in WebKit.
    *   **Assertions:** Use mobile-aware assertions (e.g., checking for the bottom navigation bar `div.fixed.bottom-0`) to verify successful login on small screens.
*   **Idempotency:** Tests are self-cleaning via the `afterEach` user deletion hook.
*   **Hydration Awareness:** The `login` helper explicitly waits for the `AuthProvider` "Loading..." screen to disappear and for network stability.

### 4. Execution Scripts
*   **Zero-Cost (Daily):** `npm run test:e2e` (Mocks Google/Supabase Reads)
*   **Full Integrity (Monthly):** `npm run test:e2e:real` (Uses real Google/Supabase data)
*   **Manual Runner:**
    ```bash
    export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && npm run test:e2e
    ```
