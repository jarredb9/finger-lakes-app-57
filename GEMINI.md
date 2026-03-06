# 🚨 MAINTENANCE PROTOCOL (MANDATORY)
*   **No History:** NEVER log "Completed Refactors" or "Bug Fixes." Update the relevant "Standard" instead.
*   **Standards > Pitfalls:** Add discovery-based rules as positive requirements in Section 2 or 3.
*   **Ephemeral Only:** Only add "Pitfalls" for transient environment bugs. Delete once stabilized.
*   **Conductor for Status:** Do NOT add project progress here. Use Conductor.
*   **Context Efficiency:** Keep this file under 400 lines to maximize token usage for code analysis.

# 🚨 SYSTEM OVERRIDE INSTRUCTIONS (PRIORITY 0)

### 1. Mandatory Global Skills (PRIORITY 1)
**YOU MUST** activate and follow the guidance of global skills for relevant tasks (e.g., `codebase-analysis`, `problem-analysis`).
*   **Environment:** Use `python3.11` and set `PYTHONPATH=$PYTHONPATH:/home/byrnesjd4821/.gemini/skills/scripts`.

### 2. Framework & Architecture Truths
*   **Middleware:** `proxy.ts` IS the valid middleware. `middleware.ts` DOES NOT exist.
*   **Supabase Native:** Prioritize direct client-to-Supabase logic (RPCs/SDK). **NEVER** create new Next.js API routes for CRUD logic.
*   **Singleton Modals:** Feature dialogs **MUST** be global singletons in `layout.tsx` (outside `AuthProvider`) to avoid DOM bloat and unmounting during hydration flashes.
*   **RPC Search Paths:** All Postgres functions **MUST** set `SET search_path = public, auth` to resolve auth schema helpers in `SECURITY DEFINER` contexts.

# Winery Visit Planner and Tracker

## 1. Environment & Shell (RHEL 8)
*   **Dev Server:** Use PM2 for stability: `pm2 start npm --name "winery-dev" -- run dev -- -p 3001`.
*   **Shell:** Load NVM before npm: `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`.
*   **Playwright Container:** Local testing MUST use rootless Podman: `./scripts/run-e2e-container.sh`.
    *   **Mandatory Build:** Use `--build` if core logic (stores, services, components) changed.
    *   **Production Parity:** CI runs against `next start`. Ensure `IS_E2E=true` is set for store exposure.

## 2. PWA & WebKit (Safari) Stability
WebKit in this environment is brittle regarding offline I/O and binary data:
*   **The Reconstitution Rule:** WebKit detaches Blob handles stored in IndexedDB during network flips (Offline -> Online). **Standard:** Store photos as **Base64 strings** in the offline queue. Reconstitute using `new File()` during sync.
*   **The CORS Mocking Rule:** **MANDATORY FOR WEBKIT.** Every `context.route()` fulfillment must include `Access-Control-Allow-Origin: '*'` and common headers (`POST, GET, OPTIONS`).
*   **Interception:** Use `page.context().route()` for global PWA mocks. Use `page.route()` for test-specific overrides (page-level takes precedence). Ensure `headers: { 'Cache-Control': 'no-store' }`.

## 3. Next.js 16 Hydration & Synchronization
*   **Avoid Hard Reloads:** NEVER use `page.reload()` inside retry loops. It kills hydration and leads to `Application Error`.
*   **Proactive Sync:** Trigger store refreshes (e.g., `store.fetchFriends()`) via `page.evaluate` inside retry loops instead.
*   **Success Selectors:** Use multi-option selectors (e.g., `'div.fixed.bottom-0, [data-testid="settings-page-container"]'`) to handle hydration flashes and responsive layouts.

## 4. Core Architectural Standards

### **A. ID System & Database**
*   **Dual-ID System:** Distinguish between `GooglePlaceId` (string) and `WineryDbId` (number).
*   **Standard:** Use `ensureInDb(wineryId)` before relational RPCs. Treat `dbId > 100` as a record (IDs 1-100 are often reserved for mocks in E2E fixtures).
*   **Migrations:** Sequential files in `supabase/migrations/` are the **SINGLE SOURCE OF TRUTH**.

### **B. State Management (Zustand)**
*   **Store Split:** Distinguish between `wineryDataStore` (Master Cache/Persisted) and `wineryStore` (UI State/Lazy Loader).
*   **Merge on Hydrate:** `hydrateWineries` MUST merge lightweight markers with existing detailed data (reviews, hours) to prevent background refreshes from wiping the local cache.
*   **The Ghost Status Rule:** `standardizeWineryData` MUST clear the local `visits` array if the server reports `user_visited: false`. This prevents deleted visits from persisting as "ghosts" in the cache.
*   **Persistence:** Only persist data arrays. **NEVER** persist transient UI flags (modals, open states).
*   **Reactivity:** SUBSCRIBE DIRECTLY to state (e.g., `useStore((s) => s.data)`) in `useMemo` dependencies. Getter functions (e.g., `getData`) will NOT trigger re-evaluations.
*   **Exposure:** Every major store MUST be exposed to `window` for E2E verification.

### **C. Social & Privacy Logic**
*   **Normalization:** All social relations use `trip_members`, `follows`, and `activity_ledger`.
*   **Visibility:** Use the `is_visible_to_viewer` RPC to enforce Public/Friends/Private tiers.

## 5. Engineering & Testing Standards

### **A. Mandatory Diagnostic Protocol (PRIORITY 0)**
If a test fails, follow this sequence:
1.  **Log DOM:** Dump `page.content()` and log `data-testid`s.
2.  **Log Store:** Dump Zustand state via `page.evaluate`.
3.  **Log DB:** Perform a direct `supabase` SQL query to verify state.
4.  **Prefix Logs:** Prefix debug logs with `[DIAGNOSTIC]` to bypass strict console listeners.
5.  **Exceptions:** `e2e/utils.ts` ignores harmless infrastructure errors (e.g., `__cf_bm`, `SecurityError` in WebKit). Do NOT attempt to "fix" these.

### **B. Mandatory E2E Patterns (`e2e/helpers.ts`)**
**NEVER** implement local workarounds. You MUST use establishing utilities:
*   `waitForAppReady(page)`: Handles mobile bottom bars and settings hydration.
*   `navigateToTab(page, tabName)`: Handles mobile sheet expansion and WebKit settlement.
*   `robustClick(locator)`: Dispatches full event sequence. **Standard:** For mobile sheets, wait for `data-state="stable"` before interacting.
*   `login(page, email, pass)`: Includes hydration guards and store validation.

### **C. Infrastructure Hygiene**
*   **Jest Mocking:** Stores with side-effects (IDB, Supabase) **MUST** use `jest.doMock` and `require` inside `beforeEach`.
*   **Ghost Tiles:** Map backgrounds are mocked with static PNGs in `e2e/utils.ts` for **$0 API spend**.
*   **Self-Cleaning:** Tests must use `deleteTestUser` to purge users and their storage folders.

### **D. Security & Quality**
*   **DB Linting:** `npm run db:lint` MUST pass before merging migrations to ensure `search_path` security.

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
├── e2e/                 # Playwright Tests: flows, helpers.ts (MANDATORY for navigation)
├── lib/                 # Core Logic: stores/, services/, utils/, database.types.ts
├── supabase/            # Backend: migrations/, functions/ (Edge Functions)
└── public/              # Static Assets & PWA Manifest
```

## 8. Reference Implementations
*   **Data Standard:** `lib/utils/winery.ts` (standardizeWineryData)
*   **RPC Service:** `lib/services/tripService.ts`
*   **Complex UI/DnD:** `components/trip-card.tsx`
*   **Offline Store:** `lib/stores/visitStore.ts`
*   **E2E Spec:** `e2e/trip-flow.spec.ts`
