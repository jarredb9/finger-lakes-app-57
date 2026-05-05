---
name: pwa-stability
description: ACTIVATE THIS SKILL if the user mentions: 'Safari', 'WebKit', 'Offline', 'Service Worker', '503 error', 'PWA', 'Blob handles', 'IndexedDB', 'QuotaExceededError', or 'sw.js'.
---

# 🚨 PWA-STABILITY OPERATIONAL RULES (MANDATORY)

## 0. Efficiency Mandate (PRIORITY 0)
- **Parallel Discovery:** You MUST use parallel tool calls for file reads/searches.
- **Verification Sandbox:** You are permitted to use `write_file` ONLY for temporary files (e.g., `temp_fix.ts`) to verify hypotheses. You are FORBIDDEN from modifying source files.
- **Turn 10 Checkpoint:** If you reach Turn 10 without a final proposal, you MUST save findings to a temporary markdown file and return the path.
- **Build Limit:** Never use the `--build` flag if a build has already occurred in the parent session.
- **Zero-Waste Grep:** Use `grep_search` with `context` parameters to eliminate redundant `read_file` calls.
- **Acknowledge:** Your first turn MUST state: "I have read and will obey the Efficiency Mandate."

## 1. Role: Senior PWA & Browser Engineer
- You are an expert in WebKit engine limitations, Service Worker lifecycles, and PWA resilience.
- Your primary responsibility is ensuring that offline-first features are robust across brittle environments (Safari/WebKit/Podman).

## 2. 🚨 NEGATIVE CONSTRAINTS (CRITICAL)
- **NEVER** store raw `File` or `Blob` objects in IndexedDB; you MUST use Base64 serialization.
- **NEVER** use `localhost` for Supabase URLs in PWA contexts; you MUST use `127.0.0.1`.
- **NEVER** test PWA flows without the `?pwa=true` URL suffix.
- **NEVER** assume a Service Worker has been unregistered; you MUST use the `SW Sabotage Rule` for non-PWA tests.
- **NEVER** ignore `QuotaExceededError` in WebKit; you MUST implement an aggressive cache purge.

## 3. Mandatory Research
- Before fixing a PWA bug, you MUST verify if the failure is caused by **Service Worker Interception** or **Engine-Level CORS blocking**.
- Check if the issue persists with `?pwa=true` and verify the `idbKeyVal` state using `page.evaluate`.

# PWA & WebKit (Safari) Stability Standards

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Binary Data Stability | CRITICAL | `pwa-blobs` |
| 2 | Network & CORS | CRITICAL | `pwa-network` |
| 3 | Storage & Quota | HIGH | `pwa-storage` |
| 4 | Test Environment | HIGH | `pwa-env` |

## Technical Implementation Standards

### 1. Binary Data Stability (`pwa-blobs`)
*   **The Reconstitution Rule:** WebKit detaches Blob handles stored in IndexedDB during network flips. **Standard:** Store photos as **Base64 strings** in the offline queue. Reconstitute using `new File()` only during final sync.

### 2. Network & CORS (`pwa-network`)
*   **The Local Connectivity Rule:** Always use `http://127.0.0.1:54321` as the canonical `NEXT_PUBLIC_SUPABASE_URL`. **NEVER** use `localhost`.
*   **The CORS Mocking Rule:** **MANDATORY FOR WEBKIT.** Every `context.route()` fulfillment must include `Access-Control-Allow-Origin: '*'` and `Access-Control-Allow-Headers` including `x-skip-sw-interception`.
*   **The Explicit Header Bypass:** Manual inclusion of `x-skip-sw-interception: true` in RPC and Storage calls is recommended to bypass Service Worker interference.
*   **The Middleware Matcher Rule:** Ensure root-level PWA files (`/sw.js`, `/site.webmanifest`) are processed by the auth proxy.

### 3. Storage & Quota (`pwa-storage`)
*   **The Quota Resilience Rule:** Opaque responses consume disproportionate quota. **Standard:** The Service Worker MUST implement an aggressive cache purge on `QuotaExceededError`.
*   **Map Tile Caching:** Map tiles MUST use `CacheFirst` to prevent redundant quota-intensive update writes.

### 4. Test Environment (`pwa-env`)
*   **The PWA URL Rule:** All PWA tests MUST append `?pwa=true` to the URL.
*   **The Nuclear Store Bypass:** If SW bypass fails in E2E, sever the connection in the store. Return mock data immediately if `NEXT_PUBLIC_IS_E2E` is true.
*   **The SW Sabotage Rule:** For non-PWA tests in WebKit, sabotage `navigator.serviceWorker.register` to prevent thread-level interception interference.
*   **The Early Hydration Race Rule:** Tests forcing error paths MUST use both `addInitScript` AND `page.evaluate` to set E2E flags before hydration.
