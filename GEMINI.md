# 🚨 MAINTENANCE PROTOCOL (MANDATORY)
*   **No History:** NEVER log "Completed Refactors" or "Bug Fixes." Update the relevant "Standard" instead.
*   **Standards > Pitfalls:** Add discovery-based rules as positive requirements in Section 2 or 3.
*   **Ephemeral Only:** Only add "Pitfalls" for transient environment bugs. Delete once stabilized.
*   **Conductor for Status:** Do NOT add project progress here. Use Conductor.
*   **Context Efficiency:** Keep this file under 400 lines to maximize token usage for code analysis.

# 🚨 SYSTEM OVERRIDE INSTRUCTIONS (PRIORITY 0)

### 1. Mandatory Global Skills (PRIORITY 1)
**YOU MUST** activate and follow the guidance of specialized skills for relevant tasks:
*   **Analysis:** `codebase-analysis`, `problem-analysis` for investigation.
*   **Verification:** `project-testing-best-practices` MUST be active BEFORE writing any tests.
*   **Handoff:** `handoff-protocol` MUST be active AFTER completing feature logic but BEFORE concluding a session.
*   **Environment:** Use `python3.11` and set `PYTHONPATH=$PYTHONPATH:/home/byrnesjd4821/.gemini/skills/scripts`.

### 2. Framework & Architecture Truths
*   **Database Operations:** **MANDATORY:** Use the Supabase MCP server tools (e.g., `execute_sql`, `apply_migration`) for ALL database-related tasks. There is NO local copy of the database.
*   **Middleware:** `proxy.ts` IS the valid middleware. `middleware.ts` DOES NOT exist.
*   **Supabase Native:** Prioritize direct client-to-Supabase logic (RPCs/SDK). **NEVER** create new Next.js API routes for CRUD logic.
*   **Portal Modals:** Feature dialogs **MUST** use React Portals to render into the `#modal-root` div (provided by `ModalHost` in `layout.tsx`).
    *   **Standard:** Feature components (e.g., `VisitFormModal`, `WineryNoteModal`, `TripShareDialog`) own their Portals. `GlobalModalRenderer` is reserved for generic `modalContent` only.
    *   **The Modal Reset Rule:** Any "close" action in `useUIStore` (e.g., `closeModal`, `closeVisitForm`) MUST explicitly reset all feature-specific state (e.g., `activeVisitWinery`, `editingVisit`, `activeNoteWineryDbId`) to `null` to prevent stale UI flashes in subsequent renders.
*   **RPC Search Paths:** All Postgres functions **MUST** set `SET search_path = public, auth` and use explicit `public.` prefixes to resolve auth schema helpers in `SECURITY DEFINER` contexts.
*   **API Nuclear Bypass:** Any API route exchanging tokens or codes (Reset Password, Signup Confirm) **MUST** implement a bypass for `'mock-code'` **BEFORE** initializing the Supabase client. This prevents `AuthPKCECodeVerifierMissingError` in emulated E2E environments.

# Winery Visit Planner and Tracker

## 1. Environment & Shell (RHEL 8)
*   **Dev Server:** Use PM2 for stability: `pm2 start npm --name "winery-dev" -- run dev -- -p 3001`.
*   **Shell:** Use `npm` directly.
*   **Playwright Container:** **MANDATORY:** Local testing MUST use rootless Podman via the provided script: `./scripts/run-e2e-container.sh [project] [test_file]`. DO NOT run `npx playwright test` directly on the host.
    *   **Usage:** `./scripts/run-e2e-container.sh chromium e2e/smoke.spec.ts` (Project defaults to `webkit`).
    *   **Mandatory Build:** Use `--build` if core logic (stores, services, components) changed: `./scripts/run-e2e-container.sh --build all`.
    *   **Standard:** ALWAYS use `--build` if you have modified any files in `app/`, `components/`, or `lib/` since the last test run. The container needs to recompile the application to see your changes.
    *   **Production Parity:** CI runs against `next start`. Ensure `IS_E2E=true` is set for store exposure.

## 2. PWA & WebKit (Safari) Stability
WebKit in this environment is brittle regarding offline I/O and binary data. You MUST follow these implementation rules for feature code:
*   **The Reconstitution Rule:** WebKit detaches Blob handles stored in IndexedDB during network flips. **Standard:** Store photos as **Base64 strings** in the offline queue. Reconstitute using `new File()` during sync.
* **The PWA URL Rule:** WebKit often unregisters SW on localhost. **Standard:** All PWA tests MUST append `?pwa=true` to the URL.
* **The Nuclear Store Bypass:** If SW bypass fails in E2E, sever the connection in the store. **Standard:** `wineryDataStore` MUST return mock data immediately if `NEXT_PUBLIC_IS_E2E` is true UNLESS an opt-in flag like `globalThis._E2E_ENABLE_REAL_SYNC` or `localStorage.getItem('_E2E_ENABLE_REAL_SYNC')` is truthy. **Prefer `localStorage` for flags that must survive redirects (e.g. Login).**
* **The Early Hydration Race Rule:** `clearServiceWorkers` (called in `beforeEach`) navigates to `/`, triggering an early `hydrateWineries` call before the test body (`failMarkers()`) can run. **Standard:** Tests forcing error paths MUST use both `addInitScript` (for future navigations) AND `page.evaluate` (for immediate state) to set E2E flags and clear the store. This ensures the *next* hydration (e.g. during `login()`) sees the clean state and correct flags.
* **The Sync-Bridge Rule:** Coordination between the `MockMapsManager` and the store is mandatory. **Standard:** The manager MUST propagate its Node-side `realData` flags to `globalThis._E2E_ENABLE_REAL_SYNC` during `initDefaultMocks` to ensure the store uses real database IDs when the test is in "Real Data" mode.
* **The Real-User Initialization Rule:** Tests using real-data modes (`useRealSocial`, `useRealVisits`, etc.) MUST call `await mockMaps.initDefaultMocks({ currentUserId: user.id })` in their `beforeEach` or setup step. **Rationale:** The `mockMaps` fixture initializes with a default ID before the test user is created. Failure to re-initialize leads to ownership mismatches (`isOwner: false`) and 403/404 errors during mutations.
* **The Mutation Settlement Rule:** For asynchronous database actions (Log Visit, Edit Trip, etc.), simply clicking the save button is insufficient. **Standard:** ALWAYS verify the appearance of the success toast using `waitForToast` before proceeding to the next interaction. This prevents race conditions where the modal unmounts or the store refreshes before the database mutation is fully processed.
* **The Alert Collision Rule:** Generic locators like `page.locator('[role="alert"]')` often match global components (Cookie Consent, PWA Prompts) rather than feature-specific errors. **Standard:** E2E tests MUST use `.first()` or filter by expected text (e.g., `errorText.includes('Error Loading Trip')`) to avoid false-positive failures during state verification.
* **The Proactive Refresh Rule:** If a test is stuck in a loading skeleton or error state inside a `toPass` block, it MUST attempt a store-level refresh via `page.evaluate(() => useXStore.getState().fetchX())` instead of a `page.reload()`. This handles transient RPC failures without breaking hydration.
* **The Multi-User Profile Rule:** In multi-context tests using real social data (e.g., `realSocialEnabled`), the `/rest/v1/profiles` mock MUST fallback to real data. This ensures each page context sees its correct user profile and prevents "Profile not fully initialized" failures.
* **The Empty Injection Rule:** Proactive injection of mock data into the store (e.g., `initDefaultMocks`) will mask "Failed to load" alerts during hydration. **Standard:** Use `globalThis._E2E_SKIP_WINERY_INJECTION = true` in error-handling tests to ensure the store is empty when the fetch fails.
* **The WebKit Fallback Rule:** If real sync fails in WebKit due to engine-level fetch errors (`Load failed`), use `globalThis._E2E_WEBKIT_SYNC_FALLBACK` to trigger a store-level mock success and set `_E2E_SYNC_REQUEST_INTERCEPTED` for verification.
* **The CORS Mocking Rule:** **MANDATORY FOR WEBKIT.** Every `context.route()` fulfillment must include `Access-Control-Allow-Origin: '*'` and common headers (`POST, GET, OPTIONS, DELETE, PATCH`). **Standard:** MUST include `x-skip-sw-interception` in `Access-Control-Allow-Headers` if using the header bypass.
* **The Explicit Header Bypass:** The Supabase browser client handles this globally in E2E mode, but manual inclusion (`x-skip-sw-interception: true`) in RPC and Storage calls is still recommended to ensure they reach Playwright's network layer through any local middleware.
* **The Rendering Verification Rule:** Images rendered via signed URLs (Supabase) MUST be verified in E2E tests using `naturalWidth > 0`. This ensures the content is actually decoded and not just a visible placeholder, 400, or 403 error.
* **The SW Sabotage Rule:** For non-PWA tests in WebKit, Service Workers can still interfere with Playwright interception even when bypassed. **Standard:** `MockMapsManager` MUST sabotage `navigator.serviceWorker.register` in E2E mode unless explicitly enabled (e.g., for `pwa-*` tests).
*   **The Middleware Matcher Rule:** Middleware matchers that exclude all files with dots (`.*\\..*`) will break `/sw.js` and `/site.webmanifest` session updates. **Standard:** Use a specific regex like `'/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|css)$).*)'` to ensure root-level PWA files are processed by the auth proxy.
*   **The Modal Cleanup Rule:** Sequential actions involving global singleton modals MUST wait for the `isModalOpen` store state to be `false` AND the dialog element to be hidden before triggering the next action. Use `page.getByTestId('winery-modal')` or `page.getByTestId('visit-modal')` for targeting. Failure to do so causes race conditions where the next "open" trigger is ignored or blocked by unmounting logic.
*   **The Modal Closure Retry Rule:** E2E helpers for modal closure (e.g., `closeWineryModal`) MUST use a `toPass` block that verifies the store state (`isWineryModalOpen === false`) and retries the closing action (click/Escape) if it remains open. **Standard:** If the close button is hidden or unresponsive, fallback to `page.keyboard.press('Escape')`.
*   **The Standard Click Strategy:** **MANDATORY FOR ALL ENGINES.** To reliably activate buttons, use standard Playwright `.click()`. Use `{ force: true }` if an element is temporarily covered by a toast or during transition. **NEVER** use manual event dispatching or `robustClick`.
*   **The Synchronous Guard Rule:** For components triggered by rapid clicks or synthetic events, React's asynchronous `setIsSubmitting` is insufficient. Handlers MUST use a `useRef` guard synchronously at the start of the function to prevent duplicate RPC calls.
*   **The Toast Overlay Rule:** Toast notifications (role="status/alert") can block pointer events on elements in the top-right or top-center, especially in mobile viewports. **Standard:** Explicitly dismiss or wait for toasts to hide if they overlap with the next target element.

# 3. Next.js 16 Hydration & Synchronization
*   **Avoid Hard Reloads:** NEVER use `page.reload()` inside retry loops. It kills hydration and leads to `Application Error`.
*   **Proactive Sync:** Trigger store refreshes (e.g., `store.fetchFriends()`) via `page.evaluate` inside retry loops instead.
*   **Teardown Resilience:** E2E cleanup steps (like `removeFriend`) are prone to navigation flakiness if the browser context is already closing. **Standard:** Wrap non-critical teardown logic in `try-catch` to prevent verified tests from failing during exit.
*   **The DnD Hydration Rule:** Libraries like `@hello-pangea/dnd` are NOT SSR-safe in Next.js 16. **Standard:** Wrap `DragDropContext` in a `mounted` state check. Failure to do so causes a silent "Next.js Error Page" (This page couldn't load) during hydration.

# 4. Core Architectural Standards

### **A. ID System & Database**
*   **Dual-ID System:** Distinguish between `GooglePlaceId` (string) and `WineryDbId` (number).
*   **The Numeric ID Normalization Rule:** Zustand stores MUST normalize all relational IDs (Winery, Trip, Visit) to `Number()` upon retrieval from the server and before comparison. This prevents "Ghost" state or filter failures caused by Supabase's inconsistent string/number serialization in nested JSON objects.
*   **The Local Date Stability Rule:** **MANDATORY:** Always use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts` for UI display and RPC parameters. **NEVER** use `toISOString().split('T')[0]` for user-facing dates, as it causes a UTC-shift bug where trips disappear or move dates if created late at night local time.
*   **The Stateful Mocking Rule:** When mocking RPCs in `MockMapsManager` (e.g., `create_trip`, `log_visit`, `delete_visit`), the interceptor MUST update the corresponding `static sharedMockState` (like `sharedMockTrips` or `sharedMockVisits`).
    *   **Standard:** Mocked IDs for visits and trips MUST be numeric (integers) to satisfy `parseInt` calls in the store.
    *   **Mandatory:** 100% of RPC mock fulfillments MUST be typed using schemas from `lib/database.types.ts` to prevent numeric/string ID mismatches and ensure schema integrity.
* **The Case-Insensitive ID Rule:** UUIDs and foreign key strings can have inconsistent casing across different stores (Zustand vs Supabase). **Standard:** Always use `String(id1).toLowerCase() === String(id2).toLowerCase()` when filtering or matching members/friends in the UI. This is critical for `isOwner` checks in components to ensure consistent behavior across all browsers.
*   **The Join-Table Rule:** **MANDATORY:** Always use the `trip_members` table and the `public.is_trip_member(trip_id)` helper function for all membership checks and authorization. **NEVER** reference a `members` column on the `trips` table, as it has been deprecated and removed.
*   **RPC Schema Parity:** **Standard:** Any change to a database function's return type or parameters MUST be immediately reflected in `lib/database.types.ts`. The Supabase client will throw a `400 Bad Request` if the expected schema does not match the actual function definition.
*   **Standard:** Use `ensureInDb(wineryId)` before relational RPCs. Treat `dbId > 100` as a record.
*   **RLS Visibility Rule:** All `SELECT` policies for tables allowing insertion MUST include a direct ownership check (e.g., `auth.uid() = user_id`) BEFORE any complex function calls (like `is_trip_member()`). This prevents `42501` errors during `INSERT ... RETURNING` caused by recursion or row invisibility.
*   **Collaborative Trips:** The `Trip` interface and related RPCs (`get_trip_details`) MUST use the structured `TripMember` type (ID, Name, Email, Role, Status). LEGACY string arrays for members are deprecated.
*   **Migrations:** Sequential files in `supabase/migrations/` are the **SINGLE SOURCE OF TRUTH**.

### **B. State Management (Zustand)**
*   **Store Split:** Distinguish between `wineryDataStore` (Master Cache/Persisted) and `wineryStore` (UI State/Lazy Loader).
*   **Merge on Hydrate:** `hydrateWineries` MUST merge lightweight markers with existing detailed data (reviews, hours) to prevent background refreshes from wiping the local cache.
*   **The Ghost Status Rule:** `standardizeWineryData` MUST clear the local `visits` array if the server reports `user_visited: false`. This prevents deleted visits from persisting as "ghosts" in the cache.
*   **Minimal Persistence:** **NEVER** persist large data arrays (`trips`, `visits`, `persistentWineries`) in `localStorage` to avoid 15s+ hydration delays. Persist only minimal metadata (e.g., `page`, `count`, `theme`).
*   **Reactivity:** SUBSCRIBE DIRECTLY to state (e.g., `useStore((s) => s.data)`) in `useMemo` dependencies. Getter functions will NOT trigger re-evaluations.
*   **Exposure:** Every major store AND the `supabase` browser client MUST be exposed to `window` for E2E verification.
*   **The E2E Hydration Guard:** Data fetchers (e.g., `fetchVisits`) MUST NOT be hard-disabled in E2E mode if they are required to populate tabs like History or Friends. Instead, allow the call to proceed so it can be intercepted by `MockMapsManager`, ensuring the UI reflects the mocked state after mutations.
*   **SSR Safety:** Diagnostic components like `E2EStoreExposer` MUST return `null` if `typeof window === 'undefined'` to prevent 500 errors during container builds.
*   **Realtime:** Stores handling collaborative entities (Trips, Members) MUST implement `subscribeToUpdates` using Supabase Realtime to maintain multi-user sync.
*   **The Revision Lock Rule:** Stores implementing Realtime sync MUST track a `lastActionTimestamp`. Incoming `postgres_changes` payloads MUST be ignored if their DB timestamp is older than the last local mutation to prevent "Flicker" race conditions.

### **C. UI Pattern: Container/Presentational**
*   **The Pure Component Rule:** UI components (Cards, Buttons, List Items) MUST be "Presentational." They MUST NOT call `useStore` hooks. Data and callbacks (e.g., `onEdit`, `onDelete`) MUST be passed as props.
*   **The Container Mandate:** Data fetching and store connections MUST be localized in "Container" or "Page" components. This ensures UI components are testable with raw JSON objects and require zero store mocks.

### **D. Social & Privacy Logic**
*   **Normalization:** All social relations use `trip_members`, `follows`, and `activity_ledger`.
*   **Visibility:** Use the `is_visible_to_viewer` RPC to enforce Public/Friends/Private tiers.

## 5. Engineering & Testing Standards
**MANDATORY:** Activate specialized skills for detailed workflow and coverage requirements.

### **A. Diagnostic & E2E Standards**
*   **Diagnostic Protocol (Priority 0):** NEVER fix a test based on assumptions. Follow the 3-tier diagnostic sequence (DOM -> Store -> DB) defined in `project-testing-best-practices`.
*   **The Atomic State Injection Rule:** Use `page.evaluate` to inject store state directly into the browser for feature verification. This bypasses fragile navigation steps and reduces test execution time by 80%.
*   **The Sub-Pixel Robustness Rule:** WebKit/High-DPI emulators often return non-integer coordinates. **Standard:** Use `expect(box.y).toBeLessThan(5)` instead of `toBe(0)` for edge-aligned elements.
*   **The Project Filtering Rule:** Emulated environments (User Agent, touch) persist across viewport overrides. **Standard:** Explicitly `test.skip()` layout tests that don't match the project type (Mobile vs Desktop) to prevent hydration mismatches.
*   **Prefix Logs:** Prefix all debug logs with `[DIAGNOSTIC]` to bypass strict console listeners.
*   **The Browser Noise Filter:** Firefox-specific "Cookie __cf_bm has been rejected" errors MUST be ignored in the console listener (via the `isThirdPartyNoise` flag) as they are non-actionable third-party noise and not representative of application failure.
*   **Mandatory E2E Patterns:** NEVER implement local workarounds. Use establishing utilities from `e2e/helpers.ts` as defined in `project-testing-best-practices`.
*   **Infrastructure Hygiene:** Standardized rules for Jest mocking, Ghost Tiles, and self-cleaning tests are offloaded to `project-testing-best-practices`.
    *   **Jest Standard:** `window.matchMedia` MUST be polyfilled in `jest.setup.ts` to support hooks using `use-mobile.ts`.
    *   **Jest Standard:** UI components using Radix `asChild` MUST be mocked in unit tests if they cause `React.Children.only` errors in JSDOM.

### **B. Handoff Protocol**
*   **Mandatory:** Implementation agents MUST activate `handoff-protocol` before concluding a session.
*   **Validation:** Use `scripts/validate-brief.py` to verify the "Fresh Start Prompt" includes branch mapping, verified selectors, and reproduction steps.

### **C. Security & Quality**
*   **DB Linting:** `npm run db:lint` MUST pass before merging migrations to ensure `search_path` security and explicit public prefixing.

## 6. Code Intelligence Tools
*   **Radar (CGC):** Mapping logic/RPCs. Launch: `cgc mcp start`. Bypass: `cypher-shell`.
    *   **The Ignore Rule:** ALWAYS maintain a `.cgcignore` file. The server WILL crash if it attempts to index `.next/` or `node_modules/`.
*   **Microscope (SDL-MCP):** UI analysis. **MANDATORY:** Must run via Podman on RHEL 8:
    *   `podman run --rm -v "$(pwd):/app:Z" -w /app -e SDL_CONFIG_HOME=/app node:20-bookworm npx sdl-mcp [command]`
*   **Index Maintenance:** MUST refresh SDL-MCP index after creating >3 components or major store changes.

## 7. Project Structure
```
/
├── app/                 # Routes: api/ (Search), login/, trips/, friends/, settings/, ~offline/
├── components/          # UI Components: ui/ (shadcn), map/, [feature].tsx
├── e2e/                 # Playwright Tests: flows, helpers.ts (MANDATORY)
├── lib/                 # Core Logic: stores/, services/, utils/, database.types.ts
└── supabase/            # Backend: migrations/, functions/ (Edge Functions)
```

## 8. Reference Implementations
*   **Data Standard:** `lib/utils/winery.ts` (standardizeWineryData)
*   **RPC Service:** `lib/services/tripService.ts`
*   **Complex UI/DnD:** `components/trip-card.tsx`
*   **Offline Store:** `lib/stores/visitStore.ts`
*   **E2E Spec:** `e2e/trip-flow.spec.ts`

## 9. AI Development & Verification Protocol (MANDATORY)

To prevent "Regression Loops" and "50-commit fix cycles," all agents MUST follow these workflow rules:

*   **Atomic Task Verification:** A Conductor task is NOT complete until its specific E2E test passes. Agents MUST NOT proceed to the next task in a plan if any previous task's verification is pending or failing.
