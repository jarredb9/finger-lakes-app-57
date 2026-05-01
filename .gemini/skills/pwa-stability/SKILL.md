---
name: pwa-stability
description: ACTIVATE THIS SKILL if the user mentions: 'Safari', 'WebKit', 'Offline', 'Service Worker', '503 error', 'PWA', 'Blob handles', 'IndexedDB', 'QuotaExceededError', or 'sw.js'.
license: MIT
metadata:
  author: Gemini CLI
  version: "2.1.0"
  date: May 2026
  scope: browser-resilience
  complexity: medium
  abstract: Standards for overcoming WebKit/Safari engine limitations in PWA and offline-first applications.
---

# PWA & WebKit (Safari) Stability Standards

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Binary Data Stability | CRITICAL | `pwa-blobs` |
| 2 | Network & CORS | CRITICAL | `pwa-network` |
| 3 | Storage & Quota | HIGH | `pwa-storage` |
| 4 | Test Environment | HIGH | `pwa-env` |

## Technical Implementation Standards

### 1. The Reconstitution Rule (Blobs)
WebKit detaches Blob handles stored in IndexedDB during network flips. **Standard:** Store photos as **Base64 strings** in the offline queue. Reconstitute using `new File()` only during final sync.

### 2. The Nuclear Store Bypass
If SW bypass fails in E2E, sever the connection in the store. **Standard:** Stores MUST return mock data if `NEXT_PUBLIC_IS_E2E` is true unless a real-sync flag is present in `localStorage`.

### 3. The Quota Resilience Rule
Opaque responses consume disproportionate quota. **Standard:** The Service Worker MUST implement a `purgeOnQuotaError` policy and an `unhandledrejection` handler.

### 4. The CORS Mocking Rule
**MANDATORY FOR WEBKIT.** Every `context.route()` fulfillment must include:
- `Access-Control-Allow-Origin: '*'`
- `Access-Control-Allow-Headers` including `x-skip-sw-interception`.

### 5. The SW Sabotage Rule
For non-PWA tests in WebKit, sabotage `navigator.serviceWorker.register` to prevent thread-level interception interference.
