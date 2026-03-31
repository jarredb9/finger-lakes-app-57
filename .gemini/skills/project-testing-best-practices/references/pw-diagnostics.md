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

Reference: [Playwright Debugging](https://playwright.dev/docs/debug)
