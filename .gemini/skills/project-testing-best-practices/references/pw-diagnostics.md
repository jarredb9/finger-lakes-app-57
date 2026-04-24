---
title: Mandatory Diagnostic Protocol
impact: CRITICAL
impactDescription: 5-10x faster root-cause analysis for failing tests
tags: diagnostics, debugging, playwright, logging
---

## Mandatory Diagnostic Protocol

NEVER apply a fix for a failing E2E test based on assumptions. You MUST follow this three-tiered diagnostic sequence first.

### 1. The Sequence
1. **Log DOM:** Dump `page.content()` and log all `data-testid`s in the target container.
2. **Log Store:** Dump the Zustand store state via `page.evaluate(() => useXStore.getState())`.
3. **Log DB:** Perform a direct `supabase` SQL query to verify the backend state.

### 2. RLS Visibility Check
If a test fails with `42501` (Forbidden) during a simple `.insert()`, verify the `SELECT` policy for that table. 
- Supabase SDK often uses `INSERT ... RETURNING`, which requires the newly created row to be visible to the user's `SELECT` policy immediately.
- **Rule:** If an insert fails but direct SQL (bypassing RLS) works, check if the `SELECT` policy relies on a function that might query the same table (recursion) or if it's missing a direct ownership check (`auth.uid() = user_id`).

### 3. Prefix Rule
All debug logs MUST be prefixed with one of the following to bypass strict console listeners:
- **`[DIAGNOSTIC]`**: General debugging information.
- **`[Sync]`**: Background synchronization status.
- **`[OfflineQueue]`**: IndexedDB/Mutation queue operations.
- **`[SW]`**: Service Worker matcher and lifecycle events.

### 4. Hydration Guard
**NEVER** use `page.reload()` inside a `toPass` retry loop. It kills hydration and leads to `Application Error` crashes. Instead, trigger a store refresh (Proactive Sync) via `page.evaluate`.

### 5. Core Service Exposure
To enable deep verification (e.g., RLS security checks, direct RPC probing), all core services MUST be exposed to `window` via the `E2EStoreExposer` component.
- **Standard:** `window.supabase` must be initialized with the browser client if `NEXT_PUBLIC_IS_E2E` is true.
- **Verification:** E2E tests should use `toPass` to wait for `window.supabase` to be defined before calling RPCs.

### 6. The Expected Error Rule
In "Lie-Fi" or Offline tests, network errors are intentional.
- **Rule:** Refine the `page.on('console')` listener in `e2e/utils.ts` to ignore `FunctionsHttpError`, `Edge Function failed`, `Load failed`, or `TypeError` during PWA offline tests.
- **Infrastructure Errors:** `WebKit encountered an internal error`, `net::ERR_FAILED`, and `Cross-Origin Request Blocked` (CORS) are often non-fatal in offline scenarios.
- **Third-Party Noise Filter:** 
    - Firefox-specific "Cookie __cf_bm has been rejected" errors MUST be ignored.
    - Google Maps JavaScript API: "Unable to fetch configuration" errors are expected when offline and must be ignored.
- **The Alert Collision Filter:** 
    - Generic `page.locator('[role="alert"]')` calls can fail by matching global Cookie Consent or PWA alerts.
    - **Standard:** Always filter alerts by expected error text (e.g., `errorText.includes('Error Loading Trip')`) before declaring a test failure.
- **Firefox Note:** Firefox often logs complex objects as `JSHandle@object`. This string MUST be allowed in the `logHandler` to prevent false positives for fatal crashes.
- **WebKit/PWA Note:** `TypeError: Load failed` is common in WebKit transitions. Additionally, `InvalidStateError` and `navigation preload` failures are common when Service Workers are enabled/disabled rapidly and should be treated as non-fatal warnings.


### 7. The Signal Persistence Rule
If a signal (like `_E2E_SYNC_REQUEST_INTERCEPTED`) is logged as `true` in the browser console but appears `undefined` or `false` in `page.evaluate`, a page reload or redirect likely occurred.
- **Action:** Check the logs for `[SW] Initializing` or `catchAll seen: /login`.
- **Solution:** Use `localStorage` to store the signal in the app and read it in the test. Verified data in `localStorage` persists across the transitions that clear `window`.

### 8. The 400 RPC Rule
If an RPC call returns `400 Bad Request` during a test, it is almost certainly a schema mismatch between `lib/database.types.ts` and the actual database definition.
- **Action:** Use the Supabase MCP `execute_sql` tool to fetch the function definition: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'your_function_name';`.
- **Validation:** Compare the arguments and return columns with the TypeScript interface.

### 9. The Early Hydration Race Rule
`clearServiceWorkers` (called in `beforeEach`) navigates to `/`, triggering an early `hydrateWineries` call before the test body (`failMarkers()`) can run.
- **Problem:** If flags like `_E2E_ENABLE_REAL_SYNC` are not set yet, the app skips the logic you intend to test.
- **Solution:** Tests forcing specific paths MUST use both `addInitScript` (for future navigations) AND `page.evaluate` (for immediate state) to set E2E flags and clear the store. This ensures the *next* navigation (e.g. `login()`) sees the clean state and correct flags.

### 10. The Mutation Settlement Protocol
For asynchronous database actions (Log Visit, Edit Trip, etc.), simply clicking the save button is insufficient and leads to race conditions.
- **Protocol:**
    1. **Network Wait:** Use `Promise.all([page.waitForResponse(...), btn.click()])` to ensure the RPC finishes.
    2. **Logic Assert:** Use `expectWineryStatusInStore` or equivalent `page.evaluate` + `toPass` assertion to verify the store updated.
    3. **UX Assert:** Finally, verify the DOM (Toast or Modal closure).
- **Why:** This ensures the mutation is fully processed and synced before the test proceeds to the next step, preventing "Ghost State" failures.

### 11. Local Stack Verification (Tier 3)
When moving from mocks (Tier 2) to Real Data verification (Tier 3), you MUST use the **Local Supabase Stack**.
- **Standard:** Use `./scripts/run-e2e-container.sh --build all ...` to ensure the container build picks up local environment variables.
- **Verification:** Monitor diagnostic logs for `[NETWORK-REQ]` to confirm the URL is `http://127.0.0.1:54321`.
- **Targeting Rule:** 
    - **Local:** Targets local Supabase (`127.0.0.1:54321`).
    - **GitHub CI:** Targets Live Database (`supabase.co`) using secrets.
- **Action:** If a Tier 3 test fails locally but logic seems correct, verify the local database schema matches `lib/database.types.ts` using Supabase MCP tools.

### 12. The IDB Stall Rule
Raw `window.indexedDB.open()` calls inside `page.evaluate` can hang indefinitely in containerized Chromium instances due to connection lock contention with the main application thread.
- **Standard:** Always expose the application's persistence library (e.g., `idbKeyVal`) to `window` and use its methods for inspection.
- **Example:** `await page.evaluate(() => window.idbKeyVal.get('my-key'))` instead of manual IDB request handlers.

### 13. The Offline Reload Constraint
`page.reload()` while `context.setOffline(true)` is active will result in `net::ERR_INTERNET_DISCONNECTED` unless the Service Worker is fully active and the route is cached. 
- **Standard:** For persistence/hydration tests, restore connectivity with `context.setOffline(false)` before calling `reload()` to ensure the application environment can rebuild and successfully hydrate state from IndexedDB.
- **Exception:** Only use offline reloads when explicitly testing the PWA "Offline Page" UX.

Reference: [Playwright Debugging](https://playwright.dev/docs/debug)
