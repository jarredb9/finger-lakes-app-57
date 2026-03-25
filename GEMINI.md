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
*   **Singleton Modals:** Feature dialogs **MUST** be global singletons in `layout.tsx` (outside `AuthProvider`) to avoid DOM bloat and unmounting during hydration flashes.
    *   **Standard:** Use `GlobalModalRenderer` as the sink for all forms (e.g., `VisitForm`, `WineryNoteEditor`). Trigger via `useUIStore.openVisitForm()` rather than local state.
*   **RPC Search Paths:** All Postgres functions **MUST** set `SET search_path = public, auth` and use explicit `public.` prefixes to resolve auth schema helpers in `SECURITY DEFINER` contexts.
*   **API Nuclear Bypass:** Any API route exchanging tokens or codes (Reset Password, Signup Confirm) **MUST** implement a bypass for `'mock-code'` **BEFORE** initializing the Supabase client. This prevents `AuthPKCECodeVerifierMissingError` in emulated E2E environments.

# Winery Visit Planner and Tracker

## 1. Environment & Shell (RHEL 8)
*   **Dev Server:** Use PM2 for stability: `pm2 start npm --name "winery-dev" -- run dev -- -p 3001`.
*   **Shell:** Load NVM before npm: `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`.
*   **Playwright Container:** **MANDATORY:** Local testing MUST use rootless Podman via the provided script: `./scripts/run-e2e-container.sh [project] [test_file]`. DO NOT run `npx playwright test` directly on the host.
    *   **Usage:** `./scripts/run-e2e-container.sh chromium e2e/smoke.spec.ts` (Project defaults to `webkit`).
    *   **Mandatory Build:** Use `--build` if core logic (stores, services, components) changed: `./scripts/run-e2e-container.sh --build all`.
    *   **Standard:** ALWAYS use `--build` if you have modified any files in `app/`, `components/`, or `lib/` since the last test run. The container needs to recompile the application to see your changes.
    *   **Production Parity:** CI runs against `next start`. Ensure `IS_E2E=true` is set for store exposure.

## 2. PWA & WebKit (Safari) Stability
WebKit in this environment is brittle regarding offline I/O and binary data. You MUST follow these implementation rules for feature code:
*   **The Reconstitution Rule:** WebKit detaches Blob handles stored in IndexedDB during network flips. **Standard:** Store photos as **Base64 strings** in the offline queue. Reconstitute using `new File()` during sync.
*   **The PWA URL Rule:** WebKit often unregisters SW on localhost. **Standard:** All PWA tests MUST append `?pwa=true` to the URL.
*   **The Nuclear Store Bypass:** If SW bypass fails in E2E, sever the connection in the store. **Standard:** `wineryDataStore` MUST return mock data immediately if `NEXT_PUBLIC_IS_E2E` is true UNLESS an opt-in flag like `globalThis._E2E_ENABLE_REAL_SYNC` is truthy.
*   **The Multi-User Profile Rule:** In multi-context tests using real social data (e.g., `realSocialEnabled`), the `/rest/v1/profiles` mock MUST fallback to real data. This ensures each page context sees its correct user profile and prevents "Profile not fully initialized" failures.
*   **The Empty Injection Rule:** Proactive injection of mock data into the store (e.g., `initDefaultMocks`) will mask "Failed to load" alerts during hydration. **Standard:** Use `globalThis._E2E_SKIP_WINERY_INJECTION = true` in error-handling tests to ensure the store is empty when the fetch fails.
*   **The WebKit Fallback Rule:** If real sync fails in WebKit due to engine-level fetch errors (`Load failed`), use `globalThis._E2E_WEBKIT_SYNC_FALLBACK` to trigger a store-level mock success and set `_E2E_SYNC_REQUEST_INTERCEPTED` for verification.
*   **The CORS Mocking Rule:** **MANDATORY FOR WEBKIT.** Every `context.route()` fulfillment must include `Access-Control-Allow-Origin: '*'` and common headers (`POST, GET, OPTIONS, DELETE, PATCH`). **Standard:** MUST include `x-skip-sw-interception` in `Access-Control-Allow-Headers` if using the header bypass.
*   **The Explicit Header Bypass:** WebKit often ignores URL-based SW bypassing. **Standard:** RPC and Storage calls in E2E mode MUST include the `x-skip-sw-interception: true` header to ensure they reach Playwright's network layer.
*   **The SW Sabotage Rule:** For non-PWA tests in WebKit, Service Workers can still interfere with Playwright interception even when bypassed. **Standard:** `MockMapsManager` MUST sabotage `navigator.serviceWorker.register` in E2E mode unless explicitly enabled (e.g., for `pwa-*` tests).
*   **The Signal Persistence Rule:** Next.js 16 + WebKit often trigger hydration reloads or auth redirects when coming back "online." **Standard:** E2E bypass flags (`_E2E_ENABLE_REAL_SYNC`) and verification signals (`_E2E_SYNC_REQUEST_INTERCEPTED`) MUST be mirrored to `localStorage` to survive window clearing.
*   **The Storage Signing Rule:** Mocking storage uploads is insufficient if the app immediately requests signed URLs. **Standard:** Tests MUST intercept the `storage/v1/object/sign/*` endpoint and return a mocked `{ signedURL: '...' }` to prevent `Failed to fetch` crashes under strict console policies.
*   **Interception:** Use `page.context().route()` for global PWA mocks. Use `page.route()` for test-specific overrides. Use the **Airtight Proxy Rule** (catch-all handler with internal dispatching) for maximum reliability in WebKit.
*   **The SW Quota Rule:** Aggressive caching in WebKit/Safari can trigger `QuotaExceededError`. **Standard:** ALL runtime caches in `sw.ts` MUST include `purgeOnQuotaError: true` in their `ExpirationPlugin` configuration.
*   **The Node Build Rule (MANDATORY):** Serwist/Webpack build-time analysis of `purgeOnQuotaError` often triggers a `TypeError` (length of undefined) in Node.js versions other than **20.x**. **Standard:** ALWAYS build the application with Node.js 20.x to prevent production build crashes.
*   **The PWA URL Rule:** WebKit often unregisters SW on localhost. **Standard:** All PWA tests MUST append `?pwa=true` to the URL.
*   **The Middleware Matcher Rule:** Middleware matchers that exclude all files with dots (`.*\\..*`) will break `/sw.js` and `/site.webmanifest` session updates. **Standard:** Use a specific regex like `'/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|css)$).*)'` to ensure root-level PWA files are processed by the auth proxy.

# 3. Next.js 16 Hydration & Synchronization
*   **Avoid Hard Reloads:** NEVER use `page.reload()` inside retry loops. It kills hydration and leads to `Application Error`.
*   **Proactive Sync:** Trigger store refreshes (e.g., `store.fetchFriends()`) via `page.evaluate` inside retry loops instead.
*   **Teardown Resilience:** E2E cleanup steps (like `removeFriend`) are prone to navigation flakiness if the browser context is already closing. **Standard:** Wrap non-critical teardown logic in `try-catch` to prevent verified tests from failing during exit.
*   **The DnD Hydration Rule:** Libraries like `@hello-pangea/dnd` are NOT SSR-safe in Next.js 16. **Standard:** Wrap `DragDropContext` in a `mounted` state check. Failure to do so causes a silent "Next.js Error Page" (This page couldn't load) during hydration.

# 4. Core Architectural Standards

### **A. ID System & Database**
*   **Dual-ID System:** Distinguish between `GooglePlaceId` (string) and `WineryDbId` (number).
*   **The Local Date Stability Rule:** **MANDATORY:** Always use `formatDateLocal(date)` and `getTodayLocal()` from `lib/utils.ts` for UI display and RPC parameters. **NEVER** use `toISOString().split('T')[0]` for user-facing dates, as it causes a UTC-shift bug where trips disappear or move dates if created late at night local time.
*   **The Stateful Mocking Rule:** When mocking RPCs in `MockMapsManager` (e.g., `create_trip`, `delete_trip`), the interceptor MUST update the corresponding `static sharedMockState` (like `sharedMockTrips`). Failure to do so causes the UI to stay stale after a "successful" action, leading to E2E locator failures.
*   **The Case-Insensitive ID Rule:** UUIDs and foreign key strings can have inconsistent casing across different stores (Zustand vs Supabase). **Standard:** Always use `String(id1).toLowerCase() === String(id2).toLowerCase()` when filtering or matching members/friends in the UI.
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
*   **Persistence:** Only persist data arrays. **NEVER** persist transient UI flags (modals, open states).
*   **Reactivity:** SUBSCRIBE DIRECTLY to state (e.g., `useStore((s) => s.data)`) in `useMemo` dependencies. Getter functions will NOT trigger re-evaluations.
*   **Exposure:** Every major store AND the `supabase` browser client MUST be exposed to `window` for E2E verification.
*   **SSR Safety:** Diagnostic components like `E2EStoreExposer` MUST return `null` if `typeof window === 'undefined'` to prevent 500 errors during container builds.
*   **Realtime:** Stores handling collaborative entities (Trips, Members) MUST implement `subscribeToUpdates` using Supabase Realtime to maintain multi-user sync.

### **C. Social & Privacy Logic**
*   **Normalization:** All social relations use `trip_members`, `follows`, and `activity_ledger`.
*   **Visibility:** Use the `is_visible_to_viewer` RPC to enforce Public/Friends/Private tiers.

## 5. Engineering & Testing Standards
**MANDATORY:** Activate specialized skills for detailed workflow and coverage requirements.

### **A. Diagnostic & E2E Standards**
*   **Diagnostic Protocol (Priority 0):** NEVER fix a test based on assumptions. Follow the 3-tier diagnostic sequence (DOM -> Store -> DB) defined in `project-testing-best-practices`.
*   **The Sub-Pixel Robustness Rule:** WebKit/High-DPI emulators often return non-integer coordinates. **Standard:** Use `expect(box.y).toBeLessThan(5)` instead of `toBe(0)` for edge-aligned elements.
*   **The Project Filtering Rule:** Emulated environments (User Agent, touch) persist across viewport overrides. **Standard:** Explicitly `test.skip()` layout tests that don't match the project type (Mobile vs Desktop) to prevent hydration mismatches.
*   **Prefix Logs:** Prefix all debug logs with `[DIAGNOSTIC]` to bypass strict console listeners.
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
