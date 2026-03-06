# 🚨 SYSTEM OVERRIDE INSTRUCTIONS (PRIORITY 0)

### 1. Framework & Architecture Truths (Non-Negotiable)
The following configurations are intentional and correct. Do NOT challenge them based on historical training data:
*   **Next.js 16 Middleware:** The file `proxy.ts` IS the valid middleware. `middleware.ts` does NOT exist. DO NOT flag this as an error. DO NOT suggest creating `middleware.ts`.
*   **Supabase Native:** We prioritize direct client-to-Supabase communication (RPCs/SDK/Edge Functions) over Next.js API routes.
*   **Singleton Modals:** All major feature dialogs (Sharing, Forms, etc.) **MUST** be implemented as global singletons rendered at the root of `layout.tsx` (outside the `AuthProvider` loading boundary). Do NOT render dialogs inside list items or deeply nested components to avoid DOM bloat, state loss, and unmounting during hydration/auth flashes.
*   **RPC Search Paths:** All Postgres functions **MUST** explicitly set `SET search_path = public, auth` to ensure `auth.uid()` and other auth schema helpers resolve correctly in `SECURITY DEFINER` contexts.

### 2. Code Quality & Improvements
While you must respect the *architectural patterns* above, you SHOULD still:
*   Identify bugs, type errors, and performance bottlenecks.
*   Suggest refactors that align with these specific patterns (e.g., "This API route logic would be faster as an RPC").
*   Improve code legibility and maintainability.

# Winery Visit Planner and Tracker

## Project Overview
This is a Next.js web application for planning and tracking visits to wineries. It allows users to explore wineries, create trips, track visits, and manage friends.

## Critical Instructions & Constraints

### 0. Mandatory Global Skills (PRIORITY 1)
**YOU MUST** activate and follow the expert guidance of global skills for ALL relevant tasks. 
- **Activation:** Call `activate_skill` immediately when starting a task matching a skill's description.
- **Expert Guidance:** Treat the instructions in `<activated_skill>` tags as your primary procedural manual, superseding general defaults.
- **Available Skills:** `codebase-analysis`, `problem-analysis`, `refactor`, `planner`, etc.
- **Workflow:** Activate -> Read instructions -> Execute using specialized tools (e.g., `python3.11`).

### 1. Mandatory Diagnostic Protocol (PRIORITY 0)
**NEVER** apply a fix for a failing E2E test based on assumptions. You **must** follow this diagnostic sequence first:
*   **Log DOM:** If an element is missing, dump `page.content()` and log all `data-testid`s present in the target container.
*   **Log Store:** Dump the relevant Zustand store state using `page.evaluate(() => useXStore.getState())`.
*   **Log DB:** Perform a direct `supabase` SQL query *during* the test run to verify the backend state matches the UI expectation.
*   **Console Sensitivity:** Prefix debug logs with `[DIAGNOSTIC]` to avoid triggering the strict console listener in `e2e/utils.ts`.

### 2. PWA & WebKit (Safari) Stability
WebKit in this environment is extremely brittle regarding offline I/O and binary data:
*   **Blob Handles:** WebKit "detaches" Blob/File handles stored in IndexedDB during network flips (Offline -> Online). 
*   **The Reconstitution Rule:** Always store photos as **Base64 strings** in the offline queue. When syncing, you **must** reconstitute them using the `new File([uint8array], name, { type })` constructor.
*   **The CORS Mocking Rule:** **MANDATORY FOR WEBKIT.** Every `context.route()` fulfillment must include `Access-Control-Allow-Origin: '*'` and common headers (`POST, GET, OPTIONS`). Without these, WebKit will trigger `Load failed` or `StorageUnknownError` at the engine level, even if the mock is hit.
*   **Interception:** For PWA tests, always use `page.context().route()` and ensure all mocked responses include `headers: { 'Cache-Control': 'no-store' }`.

### 3. Next.js 16 Hydration & Synchronization
*   **Avoid Hard Reloads:** Do not use `page.reload()` inside `toPass` retry loops. It kills hydration and leads to `Application Error` crashes.
*   **Proactive Sync:** Use the "Proactive Sync" pattern: trigger store refreshes (e.g., `store.fetchFriends()`) via `page.evaluate` inside retry loops instead of reloading the page.
*   **Clean Container Builds:** When modifying core logic (Zustand stores, React components, etc.), you **must** run the E2E script with the `--build` flag to ensure the production build inside the container is updated:
    ```bash
    ./scripts/run-e2e-container.sh --build [project]
    ```

### 4. Environment & Shell
*   **Operating System:** Linux (RHEL 8 AWS EC2 Instance).
*   **Node Version Manager:** When running `npm` commands, you **must** load NVM first:
    ```bash
    export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    ```
*   **Persistent Dev Server (PM2):** In this environment, standard background processes (`&`) are often reaped by the shell agent. Use **PM2** for a stable development environment:
    *   **Start:** `pm2 start npm --name "winery-dev" -- run dev -- -p 3001`
    *   **Logs:** `pm2 logs winery-dev`
    *   **Stop:** `pm2 delete winery-dev`
*   **Playwright Container (RHEL 8):** Local testing **must** use the rootless Podman container.
    *   **Script:** `./scripts/run-e2e-container.sh [--build] [project|all] [test-file]`
    *   **Mandatory Build:** **YOU MUST** use the `--build` (or `-b`) flag if your changes involve core application logic (Zustand stores, services, utility functions, or React components). This ensures the Next.js production build inside the container is updated before the tests run. Failing to do so will result in tests running against stale code.
    *   **Configuration:** Requires `subuid`/`subgid` configured on the host. Bypasses RHEL library protections using `seccomp=unconfined`.
*   **Deployment:** The application is deployed to a remote Vercel server. There is **no local installation** running on this specific shell instance unless managed via PM2.

### 2. Global Agent Skills
This environment has specialized agent skills (e.g., `codebase-analysis`, `problem-analysis`) located in the user's home directory.
*   **Path:** `/home/byrnesjd4821/.gemini/skills`
*   **Python Requirement:** You **must** use `python3.11` to execute skill scripts. The default `python3` (3.6) is too old and will fail with syntax errors (missing walrus operator support).
*   **Invocation Pattern:** Always set the `PYTHONPATH` to include the global scripts directory before running.
    ```bash
    export PYTHONPATH=$PYTHONPATH:/home/byrnesjd4821/.gemini/skills/scripts && python3.11 -m skills.<skill_name>.analyze --step <N>
    ```
*   **Mandatory Usage:** Always check for relevant skills via `activate_skill` before performing complex refactors or deep investigations.

### 3. Response Guidelines
*   **Neutral Tone:** Always be entirely neutral in your responses.
*   **Troubleshooting:** Do not guess at error solutions. Include `console.log` statements to troubleshoot issues properly before attempting fixes.
*   **Caching:** **Never** change the caching strategy for the application.

### 4. Database Management (Supabase)
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

### 5. Middleware Configuration
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
*   **Dates:** date-fns v4, react-day-picker v9
*   **Testing:** Jest + React Testing Library + Playwright E2E

## System Architecture & Patterns

### 1. State Management & Data Flow
*   **Zustand Stores (`lib/stores/`):** The primary source of truth for client-side state.
    *   **`wineryStore`:** (UI Store) Manages UI state (modal open/close, loading), filtering, and delegates data operations to `wineryDataStore`.
    *   **`wineryDataStore`:** (Data Store) Manages the global cache of `Winery` objects, handles hydration, CRUD operations, and syncs with Supabase. It uses the **"Merge on Hydrate"** pattern to prevent detailed data loss when refreshing lightweight map markers.
    *   **`tripStore`:** Manages trip creation, updates, and the "Active Trip" state (`selectedTrip`) for the map overlay.
    *   **`visitStore`:** The **Single Source of Truth** for visit history. Manages the global `visits` list and handles offline queueing/syncing for create/edit/delete operations.
    *   **`friendStore`:** Manages friend list, requests, and activity.
*   **Service Layer (`lib/services/`):** Static classes that encapsulate API calls. Stores call Services; Components call Stores.

### 2. "Supabase Native" Architecture (Mobile-First)
**⚠️ ARCHITECTURE STATE:** The application uses a **Supabase Native Architecture**.
*   **API Routes (`app/api/*`):** These are **EXTREMELY LIMITED**. They primarily handle Authentication flows (reset/confirm).
*   **Supabase Edge Functions:** Used for 3rd party integrations requiring secret keys (e.g., Google Places details) to ensure compatibility with mobile Bearer Tokens.
*   **RPCs & Server Actions:** These are the **primary method for Data Fetching** and all data mutations (toggles, trip management, friends) to ensure atomicity, performance, and type safety.

We enforce a "Thick Client, Thin Server" architecture to support future mobile development.

*   **Authentication:** **Supabase Native.** Sign-up and Sign-in use the Supabase SDK directly on the client. Password reset and confirmation use specific API routes. Logout uses the SDK directly.
*   **Data Fetching:**
    *   **Preference:** Client-side stores communicate **directly** with Supabase using the SDK or RPCs for all read/write operations.
    *   **Rule:** Do not create new API routes for CRUD. Use RPCs or the SDK directly.
*   **RPCs:** We rely heavily on PostgreSQL functions (RPCs) for complex joins, transactional logic (e.g., adding wineries to trips), and security-sensitive lookups (e.g., friend email lookup).
*   **Type Safety:** `lib/database.types.ts` is the generated source of truth for DB types. `lib/types.ts` imports from it.

### 3. PWA & Offline Architecture
The application is a fully offline-capable Progressive Web App (PWA).
*   **Service Worker (`app/sw.ts`):** Uses `@serwist/next` to cache static assets and pages. It includes a custom **Navigation Fallback** that serves `/~offline` when a network request fails for an uncached page.
*   **Store Persistence:** All major stores (`wineryDataStore`, `tripStore`, `visitStore`) use Zustand's `persist` middleware to save state to `localStorage`. This ensures the UI hydrates instantly even in Airplane mode.
*   **Offline Queue (`lib/utils/offline-queue.ts`):** 
    *   Uses **IndexedDB** (`idb-keyval`) to store offline mutations (`create`, `update`, `delete` visits) and large assets (photo Blobs) that exceed LocalStorage limits.
    *   **Background Sync:** The `visitStore` automatically replays queued mutations via `syncOfflineVisits` when the `online` window event fires.
*   **UI Feedback:**
    *   **`OfflineIndicator`:** A translucent yellow banner appears globally when `navigator.onLine` is false.
    *   **Toasts:** Action toasts (e.g., "Visit Saved") change contextually to "Visit Cached" when offline.

### 4. Testing Standards (Industrial Strength)
The project maintains a rigorous multi-layered testing strategy:
*   **Unit Tests (Jest):** Standardized using `lib/test-utils/fixtures.ts`. Stores must implement a `reset()` method.
    *   **Mocking Rule:** Tests involving stores with side-effects (IDB, Supabase) **MUST** use `jest.doMock` and `require` inside `beforeEach` to ensure strict isolation and prevent module hoisting issues.
*   **RPC Integration (Jest):** Critical business logic in Postgres is verified via `lib/services/__tests__/supabase-rpc.test.ts`. These tests require valid credentials and run against live data in CI.
*   **E2E (Playwright):**
    *   **Runtime Audit:** `e2e/runtime-audit.spec.ts` verifies session persistence and hydration health on the live server.
    *   **Synchronization:** Never use `waitForTimeout`. Use `waitForResponse` for network-bound actions or assert on logical UI states (e.g., absence of spinners).
    *   **Visual Regression:** Screenshots are maintained for Chromium. Use `--update-snapshots` only for intentional UI changes.
        *   **Ghost Tiles:** Map backgrounds are mocked with static PNGs in `e2e/utils.ts` for visual stability.
        *   **Self-Cleaning:** Tests must delete created trips/users in `afterEach`. `deleteTestUser` utility is enhanced to recursively purge Supabase Storage files associated with the user to prevent bucket bloat.
        *   **Accessibility:** Every major view is scanned using `@axe-core/playwright`.
### 5. ID System (Strict Typing)
To prevent "Dual-ID" confusion, we use branded types in `lib/types.ts`:
*   **`GooglePlaceId` (string):** Used for API lookups and Map markers.
*   **`WineryDbId` (number):** The Supabase Primary Key. Used for relational data.
*   **Rule:** Always cast explicit IDs to these types. Never assume `string | number`.

### 6. Optimistic Updates Strategy
We use a comprehensive optimistic update strategy to ensure UI responsiveness.
*   **Pattern:** Update Zustand store immediately -> Call API/RPC -> Revert store on error -> (Optional) Refetch/Confirm on success.
*   **Offline Handling:** When offline, the "API/RPC" step is replaced by "Add to Offline Queue", and the optimistic update persists.

### 7. Navigation & Map Context Logic
*   **Active Trip (`selectedTrip`):**
    *   **Activation:** Occurs when a user selects a trip from the dropdown on the Map controls OR clicks the "On Trip" badge in a `WineryModal`.
    *   **Persistence:** This state is global (Zustand) and persists across client-side navigation.
    *   **Reset Rule:** To prevent the map from getting "stuck" on a trip, navigating to or away from a **Trip Details Page** (`/trips/[id]`) **MUST** explicitly clear the active trip (`setSelectedTrip(null)`).

### 8. Trips Tab Architecture
The Trips tab is consolidated into a single view managed by `TripList`.
*   **Happening Today:** Priority section for trips occurring on the current date.
*   **Upcoming:** Chronological list of future trips.
*   **Past:** Toggleable view for historical data.
*   **New Trip:** Integrated modal trigger in the header.

### 9. Friend Request Notifications
*   **Immediate Fetch:** Friend data, including pending requests, is fetched immediately upon user authentication to ensure notification badges are up-to-date.
*   **Notification Badges:** Visual indicators (red circles with counts) are displayed on the "Friends" tab.

### 10. Social Schema (Normalized)
The application has moved from a denormalized "members array" to a fully normalized social schema:
*   **`trip_members`**: The single source of truth for trip participation. Replaces the legacy `members` column in the `trips` table.
*   **`activity_ledger`**: A centralized audit log for social events (visits, favorites, wishlist items). Populated automatically via Postgres triggers (`handle_activity_ledger_entry`).
*   **`follows` / `follow_requests`**: Supports asymmetric social relationships (Following/Followers) alongside traditional mutual friendships.
*   **`is_visible_to_viewer`**: A centralized Postgres RPC that enforces granular privacy (Public, Friends Only, Private) across all social features.

## Key References (Maps & Tools)

### UI Architecture (Layout)
*   **Responsive Controller:** `AppShell` (`components/app-shell.tsx`) is the central orchestrator. It manages the state for switching between the **Desktop Sidebar** (`AppSidebar`) and the **Mobile Bottom Drawer** (`InteractiveBottomSheet`).
*   **Modals:** `WineryModal` and `VisitHistoryModal` are rendered at the root level in `AppShell` to prevent duplicate mounting and ARIA conflicts.

### Key Database RPCs (Power Tools)
*   **Data Fetching:**
    *   `get_map_markers(user_id_param)`: Lightweight fetch for initial map load. Accepts explicit user ID to ensure flags (`is_favorite`) are correct.
    *   `get_winery_details_by_id(id)`: Lazy-loads full details (reviews, hours).
    *   `get_paginated_visits_with_winery_and_friends`: Fetches visit history efficiently.
    *   `get_trip_details(trip_id)`: Fetches full trip data including wineries and nested member visits (via `trip_members`) in one call.
    *   `get_paginated_wineries(page, limit)`: Fetches wineries with user-specific flags and total count for browsing.
    *   `get_friend_activity_feed(limit)`: Centralized social feed pulling from `activity_ledger`.
    *   `get_friend_profile_with_visits(friend_id)`: Fetches rich profile data including privacy-aware stats and history.
*   **Logic & Transactions:**
    *   `create_trip_with_winery`: Atomically creates a trip and populates `trip_members`.
    *   `add_winery_to_trip`: Handles upsert logic for wineries and additions to trips.
    *   `add_winery_to_trips`: Bulk adds a winery to multiple trips using membership-based authorization.
    *   `reorder_trip_wineries`: Updates visit order for multiple wineries in a trip.
    *   `delete_trip`: Atomically deletes a trip and its relationships (members/wineries).
    *   `add_trip_member_by_email`: Securely adds a trip member to `trip_members`.
    *   `update_trip_winery_notes`: Atomically updates notes for a specific winery within a trip.
    *   `log_visit`: Atomically creates/gets a winery and logs a new visit with photo array support.
    *   `update_visit`: Updates an existing visit and returns rich winery data.
    *   `delete_visit`: Securely deletes a visit record.
    *   `ensure_winery(p_winery_data)`: Security-definer RPC used to safely insert/get a winery ID, bypassing RLS `UPDATE` restrictions.
    *   `toggle_wishlist` / `toggle_favorite`: Atomic toggles (automatically synced to `activity_ledger`).
*   **Social:**
    *   `send_friend_request(target_email)`: Securely look up user by email and create/revive symmetric friend requests.
    *   `respond_to_friend_request(requester_id, accept)`: Updates pending symmetric request status.
    *   `send_follow_request(target_id)`: Handles asymmetric follows (instant for public, pending for private).
    *   `respond_to_follow_request(follower_id, accept)`: Manages asymmetric follow requests.
    *   `is_visible_to_viewer(target_id, is_private)`: Centralized privacy policy engine.
    *   `get_friends_activity_for_winery`: Returns JSON of friends who favorited/wishlisted a winery (using ledger).

### Core Custom Hooks
*   **`useWineryMap`:** The "Brain" of the map view. Aggregates store data, handles map clicks, and manages the Google Maps instance.
*   **`useTripActions`:** Encapsulates trip-specific logic like "Export to Google Maps".

### Web Research & Scraping (Firecrawl)
*   **Role:** The primary tool for external research, documentation fetching, and competitive analysis.
*   **Workflows:**
    1.  **Search First:** Use `firecrawl_search` to find relevant pages before scraping.
    2.  **Clean Markdown:** Prefer `firecrawl_scrape` with `formats: ["markdown"]` for LLM-optimized content.
    3.  **Site Mapping:** Use `firecrawl_map` to discover the structure of documentation sites (e.g., Google Maps API docs) before bulk scraping.
*   **Storage:** Large research outputs should be saved to `.firecrawl/` (which is git-ignored) to keep the repository clean.

### CodeGraphContext (CGC)
*   **Purpose:** Provides a Neo4j-backed code graph for architectural analysis and relationship tracking.
*   **Launch Command:** `cgc mcp start` (The server must be running for graph tools to be available in the CLI).
*   **Configuration:** 
    *   **Backend:** Uses native Neo4j (FalkorDB Lite is incompatible with RHEL 8 GLIBC).
    *   **Credentials:** Requires `~/.codegraphcontext/.env` with `NEO4J_URI`, `NEO4J_USERNAME`, and `NEO4J_PASSWORD`.
*   **Performance & Stability (.cgcignore):**
    *   **The Ignore Rule:** ALWAYS maintain a `.cgcignore` file in the root. The server WILL crash or stall (JSONDecodeError) if it attempts to index large ephemeral directories like `.next/` or `node_modules/`.
*   **Indexing Strategy & Limitations:**
    *   **Logic vs. View:** CGC is highly effective for mapping "Business Logic" (functions, stores, services, RPCs). It is currently **limited** in mapping the "View Layer" (React components).
    *   **The Named Export Rule:** To improve component visibility in the graph, **prefer Named Exports** (e.g., `export function MyComponent`) over default exports. CGC's parser often misses `default export` function nodes but successfully maps internal logic within those files.
    *   **The Verification Rule:** When using `find_dead_code` or searching for unused items, ALWAYS verify UI components with a case-insensitive `grep_search` before removal. `default export` and `next/dynamic` patterns frequently result in false positives in the code graph.
    *   **Internal Mapping:** Even if a component node is missing, CGC successfully maps internal helper functions (e.g., `handleSubmit`) and their outbound call chains.
*   **Troubleshooting (The Bypass):**
    *   If the MCP server is unstable or hangs, use **`cypher-shell`** via the CLI to query Neo4j directly. This bypasses the Python MCP layer and is often more reliable for deep symbol lookups.

## Project Structure

```
/
├── app/                 # Next.js App Router pages and API routes
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
    └── functions/       # Supabase Edge Functions (Deno)
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
*   **Concept:** The winery list relies on the map's `idle` event to trigger search results.
*   **The Trap:** In mocked E2E environments where map tiles are blocked or WebKit is used, the `idle` event may fire inconsistently or not at all, resulting in an empty winery list.
*   **The Fix:** Use the **"Force Visibility Pattern"** in spec files. Manually inject map bounds into the `useMapStore` via `page.evaluate`. This immediately triggers the `listResultsInView` calculation, making wineries appear instantly without relying on the Map SDK lifecycle.

### 6. Mock Registration Order (The Silent Killer)
*   **Concept:** Fixtures (like `mockMaps`) and Spec files both register network routes.
*   **The Trap:** Registering a mock in a `beforeEach` block *before* calling a fixture method that uses `unroute()` (e.g., `useRealVisits()`) will result in your custom mock being deleted.
*   **The Fix:** ALWAYS call fixture-state transitions (e.g., `mockMaps.useRealVisits()`) at the very top of your `beforeEach` or test body before registering test-specific routes.

### 7. successSelector Robustness
*   **Concept:** The `login` helper needs a definitive signal that the dashboard has loaded.
*   **The Trap:** Using text-based headings like `h1:has-text("Winery Tracker")` is brittle during React 19 hydration. Elements may briefly detach or the text might not be indexed immediately by the accessibility tree in WebKit.
*   **The Fix:** Use a multi-option selector that includes stable `data-testid` fallbacks: `'h1:has-text("Winery Tracker"), [data-testid="desktop-sidebar-container"]'`.

### 8. WebKit Interception Overhead
*   **Concept:** Blocking costly APIs (Google Maps, etc.) reduces test spend.
*   **The Trap:** Applying broad blocking routes to both `browserContext` and `page` simultaneously can cause WebKit to hang or throw "Route already handled" errors.
*   **The Fix:** Apply broad "Abort Costly APIs" routes to the `context` ONLY. Individual `page.route` calls can still be used for test-specific overrides as they naturally take precedence.

### 9. Fulfillment Safety
*   **Concept:** Mocking API responses with `route.fulfill()`.
*   **The Trap:** In high-latency or containerized environments, failing to `await route.fulfill()` can lead to race conditions where the test context is torn down before the response is fully transmitted.
*   **The Fix:** ALWAYS `await` all `route.fulfill()` calls.

### 10. Toast Regex Flexibility
*   **Concept:** Validating success messages.
*   **The Trap:** Success messages can change based on network state (e.g., "Visit added successfully" vs "Visit cached").
*   **The Fix:** Use flexible regex patterns in helpers like `logVisit`: `/(Visit added successfully|Visit cached)/i`.

### 11. Visual Regression & Engines
*   **Concept:** Different browser engines render fonts and borders with sub-pixel differences.
*   **The Fix:** Visual regression tests are restricted to `chromium`. Snapshots for Firefox/Webkit are not maintained to reduce overhead.

### 12. PWA Simulation in E2E
*   **Concept:** To test the PWA installation UI, we simulate the `beforeinstallprompt` browser event.
*   **The Trap:** If the event is dispatched without `{ cancelable: true }`, browser handlers (including the `usePwa` hook) may not correctly intercept it.
*   **The Fix:** Always dispatch with options: `new Event('beforeinstallprompt', { cancelable: true })`.

### 13. E2E Store Exposure
*   **Concept:** We use `E2EStoreExposer` to inject Zustand stores into the `window` object for testing.
*   **The Trap:** This component is gated behind `process.env.NODE_ENV !== 'production'`. Running Playwright tests against a production build will cause `page.evaluate` calls accessing the stores to fail.
*   **The Fix:** Ensure the development server is running in `dev` mode (not `start`) during tests that require store access.

### 14. react-day-picker v9 API Changes
*   **Concept:** Version 9 introduces significant breaking changes to `classNames` and internal component structure.
*   **The Trap:** Legacy class names like `cell`, `day_selected`, and `nav_button` are removed or renamed.
*   **The Fix:** Use `month_grid` (for `table`), `day` (for `cell`), `day_button` (for the clickable element), `selected` (for `day_selected`), and `button_previous/next` (for navigation). Custom icons must now be passed via the `Chevron` component instead of `IconLeft/Right`.

### 15. E2E Selectors for react-day-picker v9
*   **Concept:** The "Today" marker (`data-today="true"`) and active styles (`bg-accent`) are now applied to the **parent `<td>` cell**, not the `<button>` element itself.
*   **The Trap:** Selectors like `button.bg-accent` or `button[aria-current="date"]` (if not explicitly passed) will fail to find the clickable element for "Today".
*   **The Fix:** Use a nested selector: `td[data-today="true"] button`.

### 16. Login Logic Complexity
*   **Concept:** The `login` helper in E2E tests should be simple and deterministic.
*   **The Trap:** Adding complex retry loops or `Promise.race` logic to handle "flakiness" often masks underlying issues (like incorrect selectors or network mocking) and leads to timeouts or detached DOM element errors.
*   **The Fix:** Rely on standard Playwright auto-waiting (`await page.fill`, `await page.click`). If a test is flaky, investigate the application state or test environment first.

### 17. Build-Time Safety (Store Destructuring)
*   **Concept:** Zustand stores may return `undefined` for arrays during the first render or hydration phase.
*   **The Trap:** Code like `const { friends } = useFriendStore();` followed by `friends.length` will crash the build or runtime with a `TypeError`.
*   **The Fix:** ALWAYS provide a default empty array when destructuring: `const { friends = [] } = useFriendStore();`.

### 18. Mandatory Store Exposure for E2E
*   **Concept:** The `login` helper in E2E tests relies on checking store state via `window`.
*   **The Trap:** If a new store (like `visitStore`) is created but not exposed at the bottom of the file, the `login` helper will time out waiting for hydration.
*   **The Fix:** Every major Zustand store MUST have the exposure block at the bottom:
    ```typescript
    if (typeof window !== 'undefined') {
      (window as any).useVisitStore = useVisitStore;
    }
    ```

### 19. Mobile Overlay Conflicts
*   **Concept:** The `WineryModal` and `InteractiveBottomSheet` can overlap on mobile.
*   **The Trap:** Leaving a modal open while trying to navigate to a new tab (like Friends) will block the navigation triggers or keep the background `aria-hidden`.
*   **The Fix:** Explicitly close any open modals (`await expect(modal).not.toBeVisible()`) before performing tab navigation in mobile E2E tests.

### 20. Social Sync & Eventual Consistency
*   **Concept:** Database triggers (like profile creation on signup) or cross-user actions (friend requests) have a slight delay.
*   **The Trap:** Logging in a new user and immediately fetching their profile might return `null`, stalling the test.
*   **The Fix:** Use the `setupFriendship` helper in `e2e/helpers.ts` which handles reloads and retry-loops for cross-user visibility. Update `userStore.ts` to include a retry loop for the initial profile fetch.

### 21. Empty RPC Parameters / 404 Error
*   **Concept:** Supabase RPCs fail with 404 if parameter types don't match or are missing.
*   **The Trap:** Calling `toggle_favorite_privacy` with an undefined `p_winery_id` or a mock string ID (like `'mock-1'`) when the database expects an `integer`.
*   **The Fix:** Always use `await ensureInDb(wineryId)` before calling relational RPCs. This ensures mock wineries are promoted to real database records with numeric IDs.

### 22. Viewport Mismatch in Multi-Context Tests
*   **Concept:** Tests using `browser.newContext()` for secondary users.
*   **The Trap:** Creating a new context without specifying `viewport` and `userAgent`. If the test project is "Mobile Chrome", the first user gets a mobile viewport by default, but the second user (in a manual context) will default to desktop dimensions, causing locators to fail.
*   **The Fix:** Always pass the test parameters to isolated contexts: `await browser.newContext({ viewport, userAgent })`.

## Advanced Testing Patterns (The "Gold Standard")

### The App Ready Pattern (Hydration Guard)
Always wait for full hydration before interacting with the UI, especially after a login or reload on mobile. Use the centralized helper:
```typescript
await waitForAppReady(page); // Checks for bottom bar on mobile or sidebar on desktop
```

### Deterministic Mobile Navigation
Avoid text-based selectors for mobile tabs. Use the `getTabTrigger` helper which leverages `data-testid` locators like `mobile-nav-explore`.
```typescript
const tab = getTabTrigger(page, 'Friends');
await robustClick(page, tab);
```

### Asynchronous Dialog Triggers
When opening a global singleton dialog, use `expect(...).toPass()` to wrap both the click and the visibility check. This ensures the test accounts for hydration delays and potential unmount/remount cycles during rapid state transitions.
```typescript
await expect(async () => {
    await robustClick(page, openBtn);
    await page.waitForSelector('[data-testid="my-dialog"]', { state: 'visible', timeout: 5000 });
}).toPass({ timeout: 15000 });
```

### The Force Visibility Pattern
When testing flows that require selecting a winery from the sidebar list, do not wait for the map to "load" results. Use this pattern to make them appear instantly:
```typescript
await page.evaluate(() => {
    const winery = (window as any).useWineryDataStore.getState().persistentWineries.find(w => w.name === 'My Winery');
    if (winery) {
        (window as any).useMapStore.setState({ 
            bounds: { contains: () => true, getNorthEast: () => ({lat: () => 0, lng: () => 0}), getSouthWest: () => ({lat: () => 0, lng: () => 0}) },
            filter: ['all'] 
        });
    }
});
```

### The WebKit Settlement Buffer
WebKit often needs a small "settlement" period after complex state changes (like going online/offline) or navigation. A 500ms `page.waitForTimeout` after `context.setOffline(false)` is acceptable when targeting WebKit specifically.

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
19. **Supabase Native Refactor (Auth & Cleanup):** Eliminated redundant "wrapper" API routes (`/api/auth/me`, `/api/auth/logout`, `/api/auth/signup`, `/api/wishlist`, `/api/wineries/[id]`) in favor of direct Supabase SDK usage on the client. Refactored `userStore.ts` and `SignupForm` to use the SDK directly. Cleaned up empty directories and updated `proxy.ts` middleware.
20. **Supabase Native Refactor (Trip Management):** Refactored `TripService.ts` to use atomic Supabase RPCs (`get_trip_details`, `create_trip_with_winery`, `add_winery_to_trips`, `reorder_trip_wineries`, `delete_trip`). Eliminated multi-step client-side merging logic and inefficient bulk inserts, ensuring atomic transactions and improved performance for trip planning and management.
21. **Postgres Security Patch:** Applied `SET search_path = public` to all `SECURITY DEFINER` RPC functions to resolve "Function Search Path Mutable" security warnings and prevent potential hijacking vulnerabilities. Verified via `npx supabase db lint`.
22. **Supabase Native Refactor (Winery Browsing):** Migrated the "Browse" list fetching from standard table select to `get_paginated_wineries` RPC. This move ensures the browsing view includes rich user-specific state (favorites, wishlist, visited) while improving backend performance.
23. **Supabase Native Refactor (Visit Mutations):** Refactored `visitStore.ts` to use atomic Supabase RPCs (`update_visit`, `delete_visit`). This eliminates redundant select calls after updates and ensures only authorized owners can delete visits through a secure database layer.
24. **Supabase Native Refactor (Trip Sharing & Notes):** Migrated trip member addition and winery note updates to RPCs (`add_trip_member_by_email`, `update_trip_winery_notes`). This enables secure, email-based trip sharing without exposing full profile lists and ensures atomic updates for winery-specific metadata.
25. **Mobile Interaction Fix:** Resolved a critical issue where the `InteractiveBottomSheet` blocked interactions with the map and bottom navigation tray on mobile devices after login. Applied conditional rendering to the sheet to ensure it is fully unmounted when closed.
26. **Testing Overhaul (v2.2.4):**
    *   **RPC Integration:** Implemented live database logic verification.
    *   **Visual Regression:** Established baseline snapshots with "Ghost Tiles" map mocking.
    *   **A11y Scanning:** Automated accessibility verification in CI.
    *   **State Isolation:** Enforced global store resets in Jest.
    *   **Standardized Fixtures:** Centralized all mock data factory functions.
    *   **Error Resilience:** Verified UI behavior for server/network failures.
27. **PWA & Search Optimization (v2.2.5):**
    *   **Progressive Web App:** Enabled full PWA support with installability, offline caching, and service worker strategies via `@serwist/next`.
    *   **Search Caching:** Implemented Supabase-backed caching for Google Places API searches to reduce costs and improve performance.
    *   **Smart Zoom:** Added logic to force re-search when zooming into clusters.
    *   **Dynamic Hours:** Added real-time "Open/Closed" status calculation.
28. **Accessibility & UX Polish (Post-v2.2.5):**
    *   **Contrast Fixes:** Updated login links to use darker blue (`text-blue-800`) and permanent underlines for WCAG compliance.
    *   **Form Feedback:** Added `aria-live="polite"` to form validation messages and `role="alert"` to friend request errors for screen reader announcements.
    *   **Empty State CTA:** Added a "Browse Wineries" button to the Trips tab when no trips exist, linking directly to the Explore view.
29. **Parallel Photo Uploads:** Refactored `visitStore.ts` to implement a parallel upload strategy for visit photos using optimistic updates with 'blob:' URLs, backed by Supabase Storage and an atomic `log_visit` RPC. This replaces the previous multi-step update process with a more robust and faster atomic transaction.
30. **Photo Management E2E Coverage:** Implemented `e2e/photo-flow.spec.ts` for real-world integration testing of the photo lifecycle (add/verify/delete) within the storage and database loop. Enhanced `deleteTestUser` utility in `e2e/utils.ts` to perform recursive storage cleanup, ensuring tests leave zero orphaned artifacts in the Supabase bucket.
31. **Supabase Edge Function Migration:** Migrated the Google Places detail proxy from a Next.js API route to a **Supabase Edge Function** (`get-winery-details`). This ensures backend compatibility with mobile Bearer Tokens and strictly adheres to the "Supabase Native" architecture.
32. **Middleware Security Fix:** Updated `proxy.ts` matcher to explicitly include `/api/` routes, closing a security gap where API authentication checks were being bypassed.
33. **Type Safety & Maintainability:** Implemented manual `database.types.ts` and refactored stores into separate Data and UI layers (`wineryDataStore.ts` vs `wineryStore.ts`), eliminating `any` types and improving code legibility.
34. **Robust PWA & Offline Support:**
    *   **Offline Queue:** Implemented a mutation queue using IndexedDB (`idb-keyval`) to support creating, editing, and deleting visits while offline.
    *   **Background Sync:** Added `syncOfflineVisits` to automatically replay queued mutations upon reconnection.
    *   **Store Persistence:** Enabled `persist` middleware for all major stores (`wineryDataStore`, `tripStore`, `visitStore`) to ensure instant hydration in offline mode.
    *   **Hydration Fix:** Refactored `wineryDataStore` to merge incoming map markers with existing detailed data, preventing data loss during refresh.
    *   **Fallback UI:** Implemented `/~offline` page and a translucent `OfflineIndicator` banner for enhanced user feedback.
35. **Data Consistency & Recovery:**
    *   **Ghost Status Fix:** Updated `standardizeWineryData` to forcibly clear local `visits` if the server reports `user_visited: false`, ensuring pins correctly revert to "New" status.
    *   **Cache Recovery:** Enhanced `ensureWineryDetails` to bypass the local cache and force a fresh fetch if a winery is marked as visited but has zero visits locally. This resolves "Hidden Visit" bugs for existing stale caches.
    *   **Debug Tools:** Implemented a "Hard Reset Cache" tool on the `/debug` page to allow manual purging of local data stores in extreme sync failure scenarios.
    *   **Type Safety:** Relaxed RPC type guards to handle optional `trip_info` fields, ensuring consistent data merging across different API versions.
36. **PWA Reliability (iOS Offline Cold Start):** Switched the Service Worker caching strategy for documents (pages) from `NetworkFirst` to `StaleWhileRevalidate` with a 30-day expiration. This resolves a critical issue on iOS where the app would fail to open from a cold start in "lie-fi" or offline conditions.
37. **Fixed "Want to Go" 404 (Schema Drift):** Resolved a critical bug where the `toggle_wishlist` RPC was missing from the remote database despite having a migration file. Manually re-applied the SQL with `SECURITY DEFINER` and `SET search_path = public` to restore functionality.
38. **PWA Storage Reliability:** Fixed `QuotaExceededError` in the Service Worker by reducing the `google-maps-tiles` cache limit from 1000 to 200 items and enabling `purgeOnQuotaError`. This prevents the browser cache from filling up with map tiles.
39. **Social Activity Feed:** Implemented the frontend for the Friend Activity Feed (`FriendActivityFeed.tsx`) and integrated it into the Friends Manager. Added `fetchFriendActivityFeed` to `friendStore.ts` and defined the RPC type in `database.types.ts`.
40. **Mobile Navigation Polish:** Improved mobile UX by removing redundant tabs from the `InteractiveBottomSheet` and adding a dedicated "History" button to the mobile bottom navigation bar in `app-shell.tsx`.
41. **E2E Fix (Mobile & Social):** Updated `navigateToTab` helper to correctly target the 'History' button in the mobile bottom bar (aligning with v2.2.5 UI changes) and patched `social-feed.spec.ts` to use real DB reads for visit history, ensuring data consistency in hybrid tests.
42. **PWA v2 - Offline Robustness & Rich Install:**
    *   **Offline Images:** Added `sw.ts` caching rule for Supabase Storage images, ensuring photos load offline.
    *   **Non-Blocking Errors:** Updated `wineryDataStore` and `tripStore` to suppress network errors when cached data is available, allowing navigation in "Lie-Fi" conditions.
    *   **Mutation Queue:** Enhanced `visitStore` to automatically queue mutations (save/edit/delete) on network timeout/failure, preserving the optimistic UI update.
    *   **Rich Manifest:** Added screenshots and shortcuts to `site.webmanifest` for an App Store-like install card.
    *   **Install/Update UI:** Implemented `PwaHandler` (with loop fix) to show custom, non-intrusive "Install App" and "Update Available" notifications (Desktop: Bottom-Left Card, Mobile: Slim Top Banner).
    *   **Mobile Layout:** Condensed `CookieConsent` to a slim bottom bar on mobile to prevent obstruction of login links.
    *   **Stale-While-Revalidate:** Switched Service Worker strategy for document shell to resolve iOS offline startup issues.
43. **Social Activity Feed:** Implemented real-time friend activity tracking, signed private photos, and empty state prompts.
44. CI/Test Stabilization:
    *   **Store Exposure:** Implemented `E2EStoreExposer` to safely inject/read Zustand state during tests via `window`.
    *   **Mobile Robustness:** Fixed PWA tests to handle bottom sheet navigation and responsive visibility.
    *   **Error Overlays:** Added forced CSS injection to hide Next.js error overlays in CI.
45. **Tailwind CSS v4 Migration:**
    *   **Framework Upgrade:** Migrated from Tailwind v3 to v4 using `@tailwindcss/upgrade`.
    *   **CSS-Native Config:** Moved theme configuration and plugin integration (e.g., `tailwindcss-animate`) to `app/globals.css`.
    *   **PostCSS v4:** Switched to `@tailwindcss/postcss` for standard build integration.
46. **Mobile Layout Optimization (v2.2.9):**
    *   **PWA Install Prompt:** Refactored into a slim full-width top bar on mobile with a dismiss button.
    *   **Cookie Consent:** Refactored into a slim full-width bottom bar on mobile.
    *   **Desktop Layout:** Positioned PWA card at bottom-left and Cookie card at bottom-right for zero overlap.
    *   **Verification:** Added `e2e/pwa-install-layout.spec.ts` to ensure layout stability across viewports.
47. **PWA Install/Update Menu Refactor:**
    *   **User Menu Integration:** Refactored PWA controls into the user avatar dropdown menu for both Desktop (Sidebar) and Mobile (Floating Header).
    *   **Always-On Logic:** Implemented "Smart Install" logic that remains visible in browsers even when native prompts are unavailable.
    *   **Dynamic Labels:** Conditional button text switches between "Install App" (native) and "Add to Home Screen" (manual) based on browser state.
    *   **Standalone Detection:** Enhanced `usePwa` hook to detect existing installations and hide redundant controls.
    *   **UX Consistency:** Reverted to Lucide iconography (`Download`, `RefreshCw`) for visual alignment with the system design language.
48. **Tailwind v4 Optimization & Polish:**
    *   **Container Queries:** Refactored `responsive-table` utility to use modern `@container` queries, ensuring robust responsiveness in nested layouts (sidebar/cards) regardless of viewport width.
    *   **Field Sizing:** Implemented `field-sizing-content` in `Textarea` component, enabling native automatic height adjustment without JavaScript.
    *   **Configuration Cleanup:** Removed legacy `border-color` compatibility shims from `globals.css` and updated `components.json` to reflect the removal of `tailwind.config.ts`.
    *   **Visual Baseline:** Updated E2E visual regression snapshots to align with the new v4 rendering engine.
49. **Major Library Upgrade (v2.3.0):**
    *   **Date Utilities:** Migrated to `react-day-picker` v9 and `date-fns` v4.
    *   **Calendar Refactor:** Fully refactored `Calendar` component to the v9 API, fixing mobile alignment and desktop navigation overlap.
    *   **Stability Fixes:** Resolved infinite render loops in `PwaHandler` and `useToast` by stabilizing callbacks and using `useRef` for effect guards.
50. **Type Safety (Supabase Utilities):** Resolved implicit 'any' errors in `utils/supabase/server.ts` and `admin.ts` by explicitly typing the `setAll` cookie signature for compatibility with latest `@supabase/ssr` versions.
51. **CI Sharding & Parallelization**: Implemented 4-way parallel sharding in GitHub Actions, significantly reducing test suite execution time. Optimized for stability by limiting each CI shard to a single worker to prevent backend resource contention on the dev server.
52. **PWA Production Audit**: Implemented a dedicated CI job (`test-pwa`) that builds the app and runs high-fidelity tests against a production server (`npm run start`). This verifies real-world Service Worker behavior, offline sync, and manifest validity.
53. **Safe Store Exposure**: Introduced the `IS_E2E` environment variable to conditionally mount the `E2EStoreExposer` even in production builds, ensuring tests can still inject state while keeping the live production site clean.
54. **UI-Based PWA Testing**: Refactored PWA spec files to use real UI interactions (searching/clicking markers) instead of store injection, ensuring that offline and sync features are verified through the actual user journey.
55. **Test Stability & Resilience**: Enhanced E2E reliability with deterministic `waitForResponse` synchronization in the `login` helper and added stability buffers for IndexedDB background writes. Refactored `mockGoogleMapsApi` with a selective exclusion mechanism to allow tests to override global mocks for error-handling scenarios.
56. **Fixture-Based E2E Architecture**: Refactored the entire E2E suite to use Playwright fixtures (`mockMaps`, `user`). Introduced `MockMapsManager` to centralize API mocking and `user` fixture to automate lifecycle and storage cleanup.
57. **Deterministic Waits Expansion**: Replaced all remaining arbitrary timeouts in core flows with `page.waitForResponse` targeting specific Supabase RPC and REST endpoints.
58. **Black-Box Social Verification**: Updated `wishlist-flow` and `photo-flow` to rely entirely on UI state (colors, labels, image sources) rather than direct Zustand store inspection.
59. **Mobile Navigation Robustness:** Implemented a hybrid pointer event sequence (`pointerdown` -> `mousedown` -> `click`) in `navigateToTab` to resolve flaky Radix UI interactions in mobile emulation.
60. **Modern Google Maps Mocking:** Implemented robust mocks for the "New" Google Places API (`searchByText`) and `Geocoder` via `addInitScript` to prevent real API contamination during tests.
61. **CI Optimization**: Implemented browser and npm caching in GitHub Actions, reducing setup time from 10+ minutes to <30 seconds per run. Optimized sharding strategy to target specific browser engines for stability.
62. **Stateful Trip Mocking:** Implemented an in-memory stateful mock for the Supabase `/trips` REST API and related RPCs in `e2e/utils.ts`. This ensures deterministic testing of create/rename/delete flows without database race conditions or eventual consistency delays.
63. **Accessibility Fix:** Refactored `InteractiveBottomSheet` to resolve a critical "Nested Interactive Controls" violation by moving the close button outside the toggle area.
64. **PWA Test Infrastructure Refactor:** Migrated E2E mocking to `page.context().route()` and implemented strict `Cache-Control: no-store` headers for all Supabase mock responses. This ensures 100% reliable request interception in production builds with active Service Workers, resolving the long-standing `trip-flow` failure in the PWA audit suite.
65. **Auth Recovery & Deep Linking**: Implemented forgot/reset password flow and a `redirectTo` middleware pattern to preserve user destination during authentication. Verified with new E2E suites.
66. **DatePicker UX Verification**: Added responsive E2E tests for the `react-day-picker` v9 integration, ensuring correct component selection (Popover vs Drawer) and state management.
67. **WebKit/Safari CI Stabilization**: Resolved cross-browser flakiness by exporting `dismissErrorOverlay`, implementing deterministic network waits for manual login steps, and using ARIA-filtered selectors to avoid conflicts with Next.js internal route announcer.
68. **Containerized E2E Infrastructure**: Implemented `scripts/run-e2e-container.sh` for rootless Podman testing on RHEL 8, enabling local verification of WebKit and Firefox tests with CI parity.
69. **E2E Stability Overhaul**: Implemented robust `dispatchEvent` clicks and scoped sidebar locators to resolve mobile clipping and strict-mode violations.
70. **WebKit E2E Mock Stabilization**: Implemented a global Service Worker registration block in `MockMapsManager` and `clearServiceWorkers` helper. This ensures that mock responses for Supabase RPCs and Google Maps are never bypassed by the Service Worker cache in WebKit/Safari, achieving 100% test reliability across all browser engines.
71. **Firefox CI Resolution**: Updated console error filtering in `e2e/utils.ts` to ignore harmless Cloudflare Bot Management (`__cf_bm`) cookie rejection warnings in Firefox, preventing false-positive test failures.
72. **CI Hardening (v2.4.0):** Updated the main Playwright CI workflow to build the app and run tests against the production server (`next start`). This eliminates Next.js Dev Overlay interference and ensures 100% parity between local verification and CI runs.
73. **Hardening & Resiliency:**
    *   **Edge Function Resiliency:** Implemented `invokeFunction` utility in `lib/utils.ts` to wrap Supabase Edge Function calls with offline detection and graceful error handling, preventing fatal `FunctionsFetchError` crashes in WebKit.
    *   **Double DOM Resolution:** Refactored `AppShell.tsx` to use conditional React rendering based on the `useIsMobile` hook, eliminating duplicate sidebar instances and resolving ARIA conflicts.
    *   **Animation Stabilization:** Enhanced `InteractiveBottomSheet.tsx` with `translate-y` transitions and a `data-state="stable"` attribute (with fallback) to ensure mobile UI elements are fully interactable only after animations complete.
    *   **Offline Robustness:** Optimized `visitStore.ts` with an `isSyncing` guard and implemented a robust LocalStorage fallback in `lib/utils/offline-queue.ts` to ensure offline mutations are preserved even when IndexedDB permissions are restricted.
    *   **E2E Suite Stabilization:** Refactored `pwa-sync-deep.spec.ts` and `auth-recovery.spec.ts` with resilient selectors and dynamic viewport detection, achieving 100% test success across all browser engines.
74. **PWA Synchronization Hardening (v2.4.0):**
    *   **Binary Persistence:** Resolved WebKit `NotReadableError` by cloning `File` handles into stable `Blob` objects in `PhotoUploader.tsx`.
    *   **LocalStorage Fallback:** Implemented Base64 serialization in `offline-queue.ts` to support binary data when IndexedDB is restricted.
    *   **UI Reactivity:** Integrated `lastMutation` timestamp in `visitStore.ts` to trigger automatic re-fetches in `GlobalVisitHistory` and `FriendActivityFeed` after background syncs.
    *   **Locator Resilience:** Hardened `getSidebarContainer` helper to use visibility filtering, resolving conflicts in environments where multiple responsive sidebars coexist.
    *   **Verification:** Confirmed 100% pass rate for the deep synchronization lifecycle (`pwa-sync-deep.spec.ts`) across all supported browser engines.
75. **Social Feature Stabilization (v2.4.2):**
    *   **Postgres Hardening:** Resolved function overloading for `get_friends_and_requests` and `get_friend_activity_feed` RPCs. Optimized joins with `LEFT JOIN` and fallbacks to handle delayed profile creation.
    *   **Real-time Infrastructure:** Enabled Supabase Realtime for `friends` and `visits` tables, integrating automatic store refreshes in `friendStore.ts`.
    *   **E2E Infrastructure Fix:** Resolved a critical bug where `localStorage.clear()` in test initialization was wiping sessions on every navigation.
    *   **Multi-User Stability:** Hardened `social-feed.spec.ts` with explicit profile stabilization and iterative state verification, achieving 100% reliability across all browser engines.
    *   **ESLint/A11y Compliance:** Resolved cascading render errors in `InteractiveBottomSheet` and migrated all legacy `<img>` tags to Next.js `<Image />` for optimized performance.
76. **v2.4.0 CI & Test Hardening:**
    *   **Dockerized CI:** Migrated all Playwright tests to the official `mcr.microsoft.com/playwright` Docker container in GitHub Actions. This eliminated inconsistent "Install Deps" times (previously fluctuating between 30s and 14m) and ensured 100% environment parity.
    *   **Cross-Browser Social Stabilization:** Hardened `friends-flow` and `social-feed` tests with `robustClick()` and `expect(...).toPass()` retry logic, resolving flakiness in WebKit/Safari.
    *   **RPC Production Cleanup:** Applied migration `20260224144042_cleanup_social_feed_rpc.sql` to remove temporary debug JSON wrappers from the `get_friend_activity_feed` RPC, restoring it to a clean flat-array format.
    *   **Visual Regression Sync:** Regenerated all baseline snapshots inside the Docker container to account for rendering engine differences between standard GitHub runners and the official Playwright image.
77. **Friend Profiles & Privacy (v2.5.0):**
    *   **Privacy Schema:** Implemented `privacy_level` for profiles and `is_private` for visits with corresponding RLS policies.
    *   **Security:** Rewrote social RPCs (`get_friend_activity_feed`, etc.) to strictly respect profile and visit privacy settings using optimized subquery patterns.
    *   **Profile Discovery:** Created dedicated `/friends/[id]` profile pages showing public stats and history.
    *   **Hydration Resiliency:** Implemented a retry mechanism in `userStore.ts` for profile fetching to resolve E2E race conditions during account creation.
    *   **E2E Standardization:** Consolidated social setup into a robust `setupFriendship` helper and enforced mandatory store exposure for all major data layers.
78. **Item Privacy & Mobile Stability (v2.5.1):**
    *   **ID Resolution:** Hardened `wineryDataStore` to force mock-to-real identity resolution via `ensureInDb` before relational RPCs, preventing 404 parameter mismatches.
    *   **Mobile Navigation:** Implemented `data-testid` attributes for the mobile bottom bar and a centralized `waitForAppReady` hydration guard.
    *   **Multi-Context Fix:** Standardized isolated browser contexts in E2E tests to inherit project viewports, ensuring cross-browser parity for multi-user flows.
79. **Granular Privacy & Settings Hub (v2.6.0):**
    *   **Privacy Schema:** Implemented three-tier privacy (Public, Friends Only, Private) across Profiles, Visits, Favorites, and Wishlists.
    *   **Settings Hub:** Introduced a dedicated `/settings` page for user configuration, refactoring privacy controls out of the social tab.
    *   **Atomic Privacy:** Developed secure RPCs for toggling item-level privacy (`toggle_favorite_privacy`, `toggle_wishlist_privacy`) and a centralized visibility helper.
    *   **Friend Profiles:** Created rich, privacy-aware friend profile pages (`/friends/[id]`) with social stats and filtered histories.
    *   **E2E Validation:** Expanded the test suite with a dedicated `privacy-flow.spec.ts` and hardened `friends-flow` for the new settings navigation.
80. **Test Stability & Store Logic Fixes:**
    *   **ID Threshold:** Fixed a bug in `wineryDataStore.ts` where database IDs < 100 were being ignored by `ensureInDb`, causing failures in environments with low-incrementing IDs.
    *   **E2E Mobile Login:** Hardened the `login` helper in `e2e/helpers.ts` to correctly respect the `skipMapReady` option on mobile viewports, resolving failures in `error-handling.spec.ts`.
    *   **Component Testing:** Updated `WineryCardThumbnail` tests to match dynamic `data-testid` patterns and established `PrivacySettings.test.tsx` following the UI refactor.
81. **Supabase Native Auth Refactor:** Migrated `LoginForm` to use the client-side Supabase SDK directly, eliminating the legacy `login` server action in `app/actions.ts`. Implemented the "Critical Sequence" (refresh before push) in both login and signup flows to ensure reliable session synchronization with middleware. Verified via E2E smoke and runtime audit suites.
82. **Codebase Cleanup:** Removed unused legacy pages (`trips-client-page.tsx`), experimental test pages (`test-auth/page.tsx`), and duplicate UI hooks (`use-mobile.tsx`). Purged empty test directories to improve repository hygiene. Verified all deletions with manual `grep` to avoid CGC false positives.
83. **Social Infrastructure Refactor (Phase 1 & 2):**
    *   **Normalization:** Created `trip_members` join table and successfully backfilled from the legacy `members` array in the `trips` table.
    *   **Social Tagging:** Implemented `visit_participants` table to support tagging friends in visits.
    *   **Activity Ledger:** Created a centralized `activity_ledger` table with GIN indexes for efficient social feed generation and unified privacy boundaries.
    *   **Asymmetric Social Model:** Implemented `follows` and `follow_requests` tables, enabling asymmetric relationships (Following/Followers) alongside traditional mutual friendships.
    *   **Follow RPCs:** Created `send_follow_request` and `respond_to_follow_request` to manage the lifecycle of asymmetric relationships across different privacy tiers.
    *   **Visibility Logic:** Updated the `is_visible_to_viewer` helper function to grant visibility to followers of `friends_only` profiles, while strictly maintaining data integrity for private items.
    *   **RPC Refactoring:** Migrated `get_trip_details` to the `trip_members` architecture, improving performance and enabling user-name lookups in the returned members list.
84. **Social Infrastructure Refactor (Phase 3 & 4):**
    *   **Mutation Synchronization:** Refactored all trip mutation RPCs (`create_trip_with_winery`, `add_trip_member_by_email`, etc.) to atomically manage the `trip_members` join table.
    *   **Automated Social Feed:** Implemented Postgres triggers (`handle_activity_ledger_entry`) to automatically sync visits, favorites, and wishlist items to the `activity_ledger`.
    *   **Discovery Refactor:** Updated social discovery RPCs (`get_friend_activity_feed`, `get_friends_activity_for_winery`, `get_friends_ratings_for_winery`) to pull data from the centralized ledger.
    *   **Security Audit:** Unified RLS policies across social features to use the `is_visible_to_viewer` helper, ensuring consistent enforcement of Public/Friends/Private visibility.
    *   **Legacy Column Removal:** Successfully dropped the deprecated `members` column from the `trips` table and removed all frontend/service dependencies.
    *   **Harden Visibility:** Refactored `is_visible_to_viewer` to be robust against unauthenticated requests and correctly handle nested `SECURITY DEFINER` contexts.
85. **Privacy Fixes & Test Stabilization:**
    *   **Activity Ledger Trigger Fix:** Refactored `handle_activity_ledger_entry` trigger to correctly use separate logic blocks for each table (`visits`, `favorites`, `wishlist`), resolving a database error where it attempted to access the non-existent `rating` column on the `favorites` table.
    *   **State Hydration Fix:** Updated `standardizeWineryData` to use explicit `!== undefined` checks when merging store state to prevent mocks from overwriting local optimistic `isFavorite` and `onWishlist` values. Made the `isMapMarkerRpc` type guard more lenient to accommodate mocked map markers without user-specific flags.
    *   **Verification:** Verified item-privacy E2E flow against a rootless Playwright container, achieving 100% pass rate.
86. **Social Infrastructure Refactor & Security Audit (v2.7.0):**
    *   **Schema Finalization:** Completed the transition to a fully normalized social schema with `trip_members` and `activity_ledger`.
    *   **RPC Optimization:** Refactored all social and trip mutation RPCs to remove legacy column references and enforce strict search paths.
    *   **RLS Performance:** Optimized all social Row-Level Security policies using cached subquery patterns, resulting in significantly faster visibility checks.
    *   **Documentation:** Established formal ERD and RPC contract documentation in `docs/architecture/` and `docs/api/`.
    *   **Verification:** Validated the entire social stack with a complete Jest and Playwright E2E run (100% pass rate).
87. **Collaborative Trip Sharing (Phase 1):**
    *   **UI Implementation:** Created `TripShareDialog` with Radix/shadcn, supporting friend selection from `friendStore` and email-based invitations via `TripService.addMemberByEmail`.
    *   **Integration:** Added `share-trip-btn` to `TripCard` and `share-day-btn` to `TripPlanner` header.
    *   **Singleton Dialog Refactor:** Refactored `TripShareDialog` into a global singleton managed by `useUIStore` and rendered at the root of `layout.tsx`. This resolved locator conflicts and state loss caused by `AuthProvider` loading flashes.
    *   **Backend Hardening:** Fixed infinite recursion in `trip_members` RLS SELECT policy. Hardened search paths for all critical RPCs to include `auth` schema.
    *   **Stability Cleanup:** Disabled persistence for transient UI visibility flags in `uiStore.ts` and hardened `login` helper with increased timeouts for cross-browser reliability.
    *   **Testing:** Updated `e2e/trip-sharing.spec.ts` to use scoped locators and robust `toPass` intervals, achieving 100% rate across Chromium, Firefox, and WebKit.
    88. **Collaborative Sharing Regression Fix:**
    *   **Jest Alignment:** Updated `TripCard.test.tsx` to verify global singleton state triggers instead of local DOM elements.
    *   **Social Sync Fix:** Updated `friendStore.ts` to match updated `get_friends_and_requests` RPC return keys (`pending_incoming`/`pending_outgoing`), restoring functionality to social E2E tests.
    *   **Validation:** Verified 100% pass rate across entire Jest suite (97 tests) and core social E2E flows.


### 4. Playwright Infrastructure & CI Efficiency (v2.4.0)
The project uses a highly optimized CI pipeline to balance exhaustive verification with runner minute conservation.

*   **Build Once, Test Many:** The Next.js application is built exactly once per workflow. The `.next` build artifact is then shared across parallel test shards.
*   **Dockerized Execution:** Tests run inside the official Playwright container (`mcr.microsoft.com/playwright:v1.58.0-noble`). This ensures all system libraries and browsers are pre-installed, resulting in fast, deterministic shard startups.
*   **Firefox launch Fix:** The CI environment is configured with `HOME: /root` to grant the necessary permissions for Firefox profiles when running inside a rootless Docker container.
*   **Concurrency Control:** Workflows automatically cancel "stale" in-progress runs when a new commit is pushed to the same branch.
*   **Hybrid CI Strategy:**
    *   **Feature Branches:** Runs only **Chromium** to provide fast, cost-effective feedback during active development.
    *   **Main & PRs:** Runs the full cross-browser matrix (**Chromium, WebKit, Firefox**) to ensure zero regressions before merging.
*   **Manual Trigger:** Use the `workflow_dispatch` button in the GitHub Actions tab to force a full cross-browser run on any branch.
*   **Zero-Cost Mocking:** The `MockMapsManager` in `e2e/utils.ts` handles both Google Maps and Supabase Data API mocking to ensure $0 API spend during testing.

### 5. Local Testing Tiers (RHEL 8 / Podman)
To maintain high velocity while staying within CI quotas, use the appropriate testing tier:

| Tier | Tool | Command | Best Use Case |
| :--- | :--- | :--- | :--- |
| **1. Logic** | **CI Simulation** | `./scripts/simulate-ci.sh` | **Fastest.** Use for rapid iteration on features and RPC logic. Runs on host. |
| **2. Browser** | **Playwright Container** | `./scripts/run-e2e-container.sh chromium\|webkit\|all` | **Cross-Browser / CI Parity.** Use to catch WebKit/Safari bugs or test CSS/UI. Matches CI 100%. |
| **3. Workflow** | **gh act** | `gh act --container-daemon-socket "/run/user/$(id -u)/podman/podman.sock"` | **CI Logic.** Use to test `.github/workflows/*.yml` changes locally. |

**Pro Tip:** Always run `./scripts/simulate-ci.sh` before pushing to ensure that store hydration and production builds are healthy.

### 5. Security & Quality Control
*   **Database Linting:** We use `npx supabase db lint` to enforce Postgres security best practices (e.g., `search_path` security). This check is **required** to pass in CI before any migration can be merged.
*   **Search Path Security:** All `SECURITY DEFINER` functions **must** explicitly set `SET search_path = public` to prevent schema hijacking vulnerabilities.

## End-to-End Testing (Playwright)

We have established a robust E2E testing infrastructure using **Playwright**.

### 1. Key Test Suites (`e2e/`)
*   **`smoke.spec.ts`:** Verifies basic app health, routing, and auth redirection.
*   **`trip-flow.spec.ts`:** Tests the core "Trip Planning" value loop.
*   **`visit-flow.spec.ts`:** Tests visit logging, editing, and deletion (name-agnostic).
*   **`photo-flow.spec.ts`:** Tests the full lifecycle of photo management (add, verify, delete).
*   **`friends-flow.spec.ts`:** Tests complex **Multi-User / Real-Time** interactions using two distinct browser contexts.
*   **`privacy-flow.spec.ts`:** Tests profile visibility and private visit logging across multiple user accounts.
*   **`social-feed.spec.ts`:** Verifies real-time activity updates across friend accounts.
*   **`runtime-audit.spec.ts`:** Performs deep runtime verification of hydration health and session persistence on the live dev server.
*   **`pwa-offline.spec.ts`:** Verifies offline capabilities including navigation cache, offline indicator, and mutation queueing logic.
*   **`pwa-assets.spec.ts`:** Verifies manifest validity, install prompt triggers, and asset caching/syncing.

### 2. Containerized Local Testing (RHEL 8)
Since RHEL 8 lacks system dependencies for WebKit and Firefox, we use a rootless Podman container for local parity with CI.
*   **Command:** `./scripts/run-e2e-container.sh webkit`
*   **Network:** Uses `--network=host` to connect to the host's PM2 server on port 3001.
*   **Security:** Uses `--security-opt seccomp=unconfined` to allow Ubuntu-based library relocation.
*   **Environment Parity:** This container environment matches the GitHub Actions workflow image exactly, making it the definitive way to debug visual regression or WebKit-specific issues.

### 3. Best Practices & Stability
*   **Scoping:** Always use `getSidebarContainer(page)` to target the correct sidebar, as both mobile and desktop versions exist in the DOM.
*   **Robust Clicks:** Use the `robustClick(locator)` helper from `e2e/helpers.ts` for all critical UI interactions. It dispatches a full sequence of `PointerEvent` and `MouseEvent` types to ensure reliability across all browser engines and avoid clipping issues.
*   **Deterministic Waits:** 
    *   Use `page.waitForLoadState('networkidle')` after significant navigations.
    *   Use `waitForMapReady(page)` helper to ensure the map and bounds are initialized in the store.
*   **Mobile Navigation:** To trigger Radix UI components on mobile, use the robust pointer event sequence implemented in `navigateToTab`.
*   **Store Exposure:** We use `components/e2e-store-exposer.tsx` to expose internal Zustand stores to `window` (only in dev/test) for precise state injection and verification if absolutely necessary, but UI-based testing is preferred.
*   **Mobile Safari (WebKit) Stability:**
    *   **Login:** Use `page.keyboard.press('Enter')` instead of clicking the "Sign In" button, which can be flaky in WebKit.
    *   **Assertions:** Use mobile-aware assertions (e.g., checking for the bottom navigation bar `div.fixed.bottom-0`) to verify successful login on small screens.
*   **Idempotency:** Tests are self-cleaning via the `user` fixture.
*   **Hydration Awareness:** The `login` helper explicitly waits for the `AuthProvider` "Loading..." screen to disappear and for network stability.
*   **PWA Mocking:** For tests targeting production builds or PWAs, always use `page.context().route()` instead of `page.route()`. This ensures that network requests initiated by the Service Worker are correctly intercepted. Additionally, always include `Cache-Control: no-store` in mock headers to prevent Service Worker caching.
*   **Mock manager Unrouting:** When using `useRealSocial()` or `useRealVisits()`, ensure the unroute regex exactly matches the original route regex (e.g., `/\/rpc\/.../`) to correctly disable mocks.
*   **Visual Regression Baselines:** Always generate/update snapshots inside the official Playwright Docker container (`./scripts/run-e2e-container.sh ... --update-snapshots`) to ensure consistency with CI rendering.
*   **Zero-Cost Mocking:** The `MockMapsManager` in `e2e/utils.ts` handles both Google Maps and Supabase Data API mocking. It uses a stateful in-memory array for Trips to mimic database behavior without network latency.
*   **Infrastructure Noise Filtering:** The console error listener in `e2e/utils.ts` is configured to ignore harmless infrastructure messages like Cloudflare Bot Management (`__cf_bm`) cookie rejections in Firefox and service worker cleanup logs to prevent false-positive failures.

### 4. Execution Scripts
*   **Zero-Cost (Daily):** `./scripts/run-e2e-container.sh chromium` (Mocks Google/Supabase Reads)
*   **Full Integrity (Monthly):** `E2E_REAL_DATA=true ./scripts/run-e2e-container.sh chromium` (Uses real Google/Supabase data)
*   **Manual Runner (All Browsers):**
    ```bash
    ./scripts/run-e2e-container.sh all
    ```
*   **Manual Runner (Specific):**
    ```bash
    ./scripts/run-e2e-container.sh webkit e2e/smoke.spec.ts
    ```

### 5. Common Pitfalls & "Gotchas"

*   **Firefox Docker permissions:** Firefox requires the `HOME` environment variable to be set to a directory owned by the running user (e.g., `HOME: /root` in CI) to successfully create its profile.
*   **Visual Snapshot Mismatches:** Rendering engines differ slightly between OS environments. Baseline snapshots MUST be generated in the Docker container to pass in CI.
*   **RPC JSON Overloading:** Be careful with RPC return types. If a frontend store expects an array and the RPC returns a JSON object (e.g., for debug wrapping), the store must be updated to unwrap the data.
*   **Standalone Settings Navigation:** The `/settings` page is a standalone view outside the main `AppShell` tab system.
    *   **The Success Selector:** When updating `waitForAppReady` in `e2e/helpers.ts`, you MUST include `[data-testid="settings-page-container"]` in the success selector list to prevent timeouts on the settings page.
    *   **Direct Navigation:** Prefer `page.goto('/settings')` for privacy-related tests to ensure a clean state and avoid reliance on sidebar tab transitions which may be disabled or hidden.

### 23. ensureInDb Numeric ID Threshold
*   **Concept:** Relational database IDs (BigInt/Integer) typically start at 1 and increment.
*   **The Trap:** Implementing logic that ignores IDs below a certain threshold (e.g., `id > 100`) will cause silent failures in fresh environments or test databases where IDs are low.
*   **The Fix:** Always validate for `id > 0` when checking for a valid existing database primary key. This was fixed in `wineryDataStore.ts`.

### 24. Postgres Trigger Field Access on Multiple Tables
*   **Concept:** Triggers attached to multiple tables (e.g., `visits`, `favorites`, `wishlist`) using a single function.
*   **The Trap:** Attempting to access `NEW.rating` or `NEW.user_review` when the trigger is fired by a table that doesn't have these columns (like `favorites`) will result in a fatal `record "new" has no field` error.
*   **The Fix:** Always wrap table-specific column access in a `TG_TABLE_NAME = '...'` conditional block.

### 25. State Merging and "in" Operator with Mocks
*   **Concept:** Zustand stores often merge incoming server data with local optimistic state.
*   **The Trap:** Using `'field' in source` to check if a field exists will evaluate to true even if the field's value is explicitly `undefined`. If mock data omits a boolean field, this can lead to overwriting local `true` values with default `false` values.
*   **The Fix:** Always use explicit `source.field !== undefined` checks when deciding whether to overwrite local state with incoming partial data.

### 26. Mock Overwriting (Page vs. Context)
*   **Concept:** Playwright fixtures (like `mockMaps`) often register `context.route` handlers globally.
*   **The Trap:** Registering a mock using `page.context().route` in a spec file may not take precedence if a fixture mock matches the same pattern and was registered later or at the same level.
*   **The Fix:** Use `page.route` for test-specific overrides. Page-level routes ALWAYS take precedence over context-level routes in Playwright, ensuring your spec-specific mock is hit.

### 27. UI Visibility Persistence (The Hydration Trap)
*   **Concept:** Using Zustand's `persist` middleware for transient UI state like `isShareDialogOpen`.
*   **The Trap:** If a test fails or a session refreshes, the dialog "remembers" it was open. During hydration, the store might "flip" the visibility bit exactly when Playwright is interacting, causing race conditions or "element not found" errors.
*   **The Fix:** ONLY persist data (trips, wineries). NEVER persist transient UI flags like modal visibility.

### 28. Global Singleton Stability & Auth Boundaries
*   **Concept:** Rendering global dialogs (Sharing, History) at the root level.
*   **The Trap:** Placing global dialogs inside an `AuthProvider` that conditionally renders a "Loading..." screen. When the app hydrates or re-authenticates, the loading screen unmounts EVERYTHING inside it, including your dialog.
*   **The Fix:** Render global UI singletons (Toasts, Modals, PWA Handlers) in `layout.tsx` OUTSIDE of conditional loading boundaries (siblings to `AuthProvider`). They should remain mounted even if the main application content is in a "Loading" state.

### 29. Client-Side Store Access in Server Components
*   **Concept:** Using Zustand stores in `layout.tsx` (a Server Component by default).
*   **The Trap:** Directly using hooks like `useUIStore` in a Server Component will throw errors during build/pre-rendering (e.g., `TypeError: h is not a function`).
*   **The Fix:** Wrap store-dependent UI elements in a separate `"use client"` component (e.g., `trip-share-dialog-wrapper.tsx`) and import that into the layout.

### 30. Jest Verification for Singleton Modals
*   **Concept:** Components like `TripCard` no longer render dialogs locally; they trigger a global singleton via a Zustand store.
*   **The Trap:** Tests that previously searched for `[data-testid="trip-share-dialog"]` inside a component will fail because the dialog is now rendered at the app root.
*   **The Fix:** Update Jest tests to mock the UI store and verify that the correct action (e.g., `openShareDialog`) was called with expected arguments instead of checking the local DOM.

### 31. RPC Key Consistency (JSONB Returns)
*   **Concept:** Destructuring keys from Supabase RPCs that return `jsonb`.
*   **The Trap:** Migration files might update an RPC to return different keys (e.g., changing `requests` to `pending_incoming`) to resolve ambiguity or align with standard naming. If the corresponding store fetching logic isn't updated simultaneously, the UI will silently fail to populate data.
*   **The Fix:** Always verify what the database is actually returning using the Supabase MCP or `execute_sql` with `pg_get_functiondef` before assuming key names in stores.

## Project Handover: Track 1 Status (COMPLETE)

### Completed Refactor (Social Infrastructure & v2.7.0 Release)
1.  **Normalized Schema:** Fully migrated all trip and social logic to the `trip_members` join table and `activity_ledger` centralized log.
2.  **Asymmetric Model:** Implemented and verified the Following/Followers model alongside mutual friendships.
3.  **Privacy & Security:** Centralized all visibility logic in the `is_visible_to_viewer` RPC and optimized RLS performance for production scale.
4.  **Documentation:** Formalized the system architecture with ERD and API contract documents.

### Current Validation State
*   **Jest:** 100% Pass (73 tests).
*   **E2E (Chromium/WebKit/Firefox):** 100% Pass (37 tests).
*   **Release Ready:** The project is prepared for the `v2.7.0` release.

### Readiness for Track 2 (Collaborative Trip UI)
Phase 1 (Share UI & Invitation Logic) and Phase 1.5 (Architectural Stability) are **COMPLETE**. Regressions in social sync and unit tests have been resolved. The backend infrastructure is fully hardened, and the global singleton architecture is established in `layout.tsx`. E2E verification in `e2e/trip-sharing.spec.ts`, `e2e/friends-flow.spec.ts`, and `e2e/privacy-flow.spec.ts` is passing with 100% reliability across Chromium, Firefox, and WebKit. The system is ready for Phase 2 (Collaborative Views).

## Code Intelligence Tools (CGC & SDL-MCP)
This project utilizes two specialized code mapping systems. **MANDATORY:** Agents MUST use these tools to map symbols and dependencies BEFORE performing large file reads.

*   **The Radar (CGC):** Use for system-wide relational mapping (e.g., finding every file that eventually calls a specific database RPC).
*   **The Microscope (SDL-MCP):** Use for high-fidelity symbol analysis (e.g., understanding a React component's prop types or local hook dependencies).

### CodeGraphContext (CGC)
*   **Best For:** Mapping "Business Logic" (Zustand stores, static services, Supabase RPCs, database relationships).
*   **Usage:** Call `execute_cypher_query` or `analyze_code_relationships` via the active MCP server.
*   **Limitation:** Highly limited in mapping the "View Layer" (React components). Parser often misses `default export` nodes.

### Symbol Delta Ledger (SDL-MCP)
*   **Best For:** Mapping the "View Layer" (React components, UI hooks, prop signatures) and generating token-efficient symbol summaries.
*   **Runtime:** MUST be run via **Podman** on RHEL 8 to bypass native module (`tree-sitter`) compatibility issues.
*   **Command Patterns:**
    *   **Summary:** `podman run --rm -v "$(pwd):/app:Z" -w /app -e SDL_CONFIG_HOME=/app node:20-bookworm npx sdl-mcp summary "SymbolName" --short`
    *   **Refresh Index:** `podman run --rm -v "$(pwd):/app:Z" -w /app -e SDL_CONFIG_HOME=/app node:20-bookworm npx sdl-mcp index`
*   **Configuration:** Uses `.sdl-config.json` and `sdlmcp.sqlite` in the project root.

### Index Maintenance (Avoiding Stale Data)
Agents MUST refresh the SDL-MCP index in the following scenarios:
1.  **New Components:** After creating more than 3 new React components or UI hooks.
2.  **Structural Refactors:** After moving files between directories (e.g., `components/` to `components/ui/`).
3.  **Store Mutations:** After adding new actions or state slices to major Zustand stores.
4.  **Session Start:** If the existing index is older than 24 hours (check file metadata of `sdlmcp.sqlite`).

### Decision Matrix
Agents MUST use these tools as the primary data source when activating skills like `codebase-analysis` or `problem-analysis`.

| Task | Recommended Tool | Why? |
| :--- | :--- | :--- |
| **Fix a database RPC** | **CGC** | Excellent at mapping SQL dependencies and call chains. |
| **Understand a React Component** | **SDL-MCP** | Tree-sitter accurately maps TSX components and prop signatures. |
| **Analyze Zustand Store logic** | **CGC** | Maps class/function relationships and store cross-calls reliably. |
| **Find a symbol's summary** | **SDL-MCP** | `summary` command provides 1000x compression for token savings. |
| **Trace dependency "Blast Radius"** | **SDL-MCP** | Specialized in calculating the impact of symbol-level changes. |

## Project Structure



<!-- NEXT-AGENTS-MD-START -->[Next.js Docs Index]|root: ./.next-docs|STOP. What you remember about Next.js is WRONG for this project. Always search docs and read before any task.|01-app:{04-glossary.mdx}|01-app/01-getting-started:{01-installation.mdx,02-project-structure.mdx,03-layouts-and-pages.mdx,04-linking-and-navigating.mdx,05-server-and-client-components.mdx,06-cache-components.mdx,07-fetching-data.mdx,08-updating-data.mdx,09-caching-and-revalidating.mdx,10-error-handling.mdx,11-css.mdx,12-images.mdx,13-fonts.mdx,14-metadata-and-og-images.mdx,15-route-handlers.mdx,16-proxy.mdx,17-deploying.mdx,18-upgrading.mdx}|01-app/02-guides:{analytics.mdx,authentication.mdx,backend-for-frontend.mdx,caching.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,data-security.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,json-ld.mdx,lazy-loading.mdx,local-development.mdx,mcp.mdx,mdx.mdx,memory-usage.mdx,multi-tenant.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,prefetching.mdx,production-checklist.mdx,progressive-web-apps.mdx,public-static-pages.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,single-page-applications.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx,videos.mdx}|01-app/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|01-app/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|01-app/02-guides/upgrading:{codemods.mdx,version-14.mdx,version-15.mdx,version-16.mdx}|01-app/03-api-reference:{07-edge.mdx,08-turbopack.mdx}|01-app/03-api-reference/01-directives:{use-cache-private.mdx,use-cache-remote.mdx,use-cache.mdx,use-client.mdx,use-server.mdx}|01-app/03-api-reference/02-components:{font.mdx,form.mdx,image.mdx,link.mdx,script.mdx}|01-app/03-api-reference/03-file-conventions/01-metadata:{app-icons.mdx,manifest.mdx,opengraph-image.mdx,robots.mdx,sitemap.mdx}|01-app/03-api-reference/03-file-conventions:{default.mdx,dynamic-routes.mdx,error.mdx,forbidden.mdx,instrumentation-client.mdx,instrumentation.mdx,intercepting-routes.mdx,layout.mdx,loading.mdx,mdx-components.mdx,not-found.mdx,page.mdx,parallel-routes.mdx,proxy.mdx,public-folder.mdx,route-groups.mdx,route-segment-config.mdx,route.mdx,src-folder.mdx,template.mdx,unauthorized.mdx}|01-app/03-api-reference/04-functions:{after.mdx,cacheLife.mdx,cacheTag.mdx,connection.mdx,cookies.mdx,draft-mode.mdx,fetch.mdx,forbidden.mdx,generate-image-metadata.mdx,generate-metadata.mdx,generate-sitemaps.mdx,generate-static-params.mdx,generate-viewport.mdx,headers.mdx,image-response.mdx,next-request.mdx,next-response.mdx,not-found.mdx,permanentRedirect.mdx,redirect.mdx,refresh.mdx,revalidatePath.mdx,revalidateTag.mdx,unauthorized.mdx,unstable_cache.mdx,unstable_noStore.mdx,unstable_rethrow.mdx,updateTag.mdx,use-link-status.mdx,use-params.mdx,use-pathname.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,use-selected-layout-segment.mdx,use-selected-layout-segments.mdx,userAgent.mdx}|01-app/03-api-reference/05-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,appDir.mdx,assetPrefix.mdx,authInterrupts.mdx,basePath.mdx,browserDebugInfoInTerminal.mdx,cacheComponents.mdx,cacheHandlers.mdx,cacheLife.mdx,compress.mdx,crossOrigin.mdx,cssChunking.mdx,devIndicators.mdx,distDir.mdx,env.mdx,expireTime.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,htmlLimitedBots.mdx,httpAgentOptions.mdx,images.mdx,incrementalCacheHandlerPath.mdx,inlineCss.mdx,isolatedDevBuild.mdx,logging.mdx,mdxRs.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactCompiler.mdx,reactMaxHeadersLength.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,sassOptions.mdx,serverActions.mdx,serverComponentsHmrCache.mdx,serverExternalPackages.mdx,staleTimes.mdx,staticGeneration.mdx,taint.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,turbopackFileSystemCache.mdx,typedRoutes.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,viewTransition.mdx,webVitalsAttribution.mdx,webpack.mdx}|01-app/03-api-reference/05-config:{02-typescript.mdx,03-eslint.mdx}|01-app/03-api-reference/06-cli:{create-next-app.mdx,next.mdx}|02-pages/01-getting-started:{01-installation.mdx,02-project-structure.mdx,04-images.mdx,05-fonts.mdx,06-css.mdx,11-deploying.mdx}|02-pages/02-guides:{analytics.mdx,authentication.mdx,babel.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,lazy-loading.mdx,mdx.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,post-css.mdx,preview-mode.mdx,production-checklist.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx}|02-pages/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|02-pages/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|02-pages/02-guides/upgrading:{codemods.mdx,version-10.mdx,version-11.mdx,version-12.mdx,version-13.mdx,version-14.mdx,version-9.mdx}|02-pages/03-building-your-application/01-routing:{01-pages-and-layouts.mdx,02-dynamic-routes.mdx,03-linking-and-navigating.mdx,05-custom-app.mdx,06-custom-document.mdx,07-api-routes.mdx,08-custom-error.mdx}|02-pages/03-building-your-application/02-rendering:{01-server-side-rendering.mdx,02-static-site-generation.mdx,04-automatic-static-optimization.mdx,05-client-side-rendering.mdx}|02-pages/03-building-your-application/03-data-fetching:{01-get-static-props.mdx,02-get-static-paths.mdx,03-forms-and-mutations.mdx,03-get-server-side-props.mdx,05-client-side.mdx}|02-pages/03-building-your-application/06-configuring:{12-error-handling.mdx}|02-pages/04-api-reference:{06-edge.mdx,08-turbopack.mdx}|02-pages/04-api-reference/01-components:{font.mdx,form.mdx,head.mdx,image-legacy.mdx,image.mdx,link.mdx,script.mdx}|02-pages/04-api-reference/02-file-conventions:{instrumentation.mdx,proxy.mdx,public-folder.mdx,src-folder.mdx}|02-pages/04-api-reference/03-functions:{get-initial-props.mdx,get-server-side-props.mdx,get-static-paths.mdx,get-static-props.mdx,next-request.mdx,next-response.mdx,use-params.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,userAgent.mdx}|02-pages/04-api-reference/04-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,assetPrefix.mdx,basePath.mdx,bundlePagesRouterDependencies.mdx,compress.mdx,crossOrigin.mdx,devIndicators.mdx,distDir.mdx,env.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,httpAgentOptions.mdx,images.mdx,isolatedDevBuild.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,serverExternalPackages.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,webVitalsAttribution.mdx,webpack.mdx}|02-pages/04-api-reference/04-config:{01-typescript.mdx,02-eslint.mdx}|02-pages/04-api-reference/05-cli:{create-next-app.mdx,next.mdx}|03-architecture:{accessibility.mdx,fast-refresh.mdx,nextjs-compiler.mdx,supported-browsers.mdx}|04-community:{01-contribution-guide.mdx,02-rspack.mdx}<!-- NEXT-AGENTS-MD-END -->
