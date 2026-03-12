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

### 2. Prefix Rule
All debug logs MUST be prefixed with **`[DIAGNOSTIC]`**. 
- **Incorrect:** `console.log('User id is:', id)`.
- **Correct:** `console.log('[DIAGNOSTIC] User id is:', id)`. 
*Note: This bypasses strict console listeners in `e2e/utils.ts`.*

### 3. Hydration Guard
**NEVER** use `page.reload()` inside a `toPass` retry loop. It kills hydration and leads to `Application Error` crashes. Instead, trigger a store refresh (Proactive Sync) via `page.evaluate`.

### 4. Core Service Exposure
To enable deep verification (e.g., RLS security checks, direct RPC probing), all core services MUST be exposed to `window` via the `E2EStoreExposer` component.
- **Standard:** `window.supabase` must be initialized with the browser client if `NEXT_PUBLIC_IS_E2E` is true.
- **Verification:** E2E tests should use `toPass` to wait for `window.supabase` to be defined before calling RPCs.

Reference: [Playwright Debugging](https://playwright.dev/docs/debug)
