---
title: WebKit (Safari) & PWA Stability
impact: CRITICAL
impactDescription: Prevents "StorageUnknownError" and "Load failed" in Safari/WebKit
tags: webkit, safari, pwa, binary-data, cors
---

## WebKit (Safari) & PWA Stability

WebKit in this environment is brittle regarding offline I/O and binary data. You MUST follow these two rules for 100% Safari compatibility.

### 1. The Reconstitution Rule (Blobs)
WebKit detaches Blob handles stored in IndexedDB during network flips. 
- **Incorrect:** Storing raw `File` or `Blob` objects in the offline queue.
- **Correct:** Serializing photos as **Base64 strings** in the offline queue. Reconstitute them using `new File([uint8array], name, { type })` only during the final sync.

### 2. The CORS Mocking Rule
**MANDATORY FOR WEBKIT.** Every `context.route()` fulfillment MUST include specific headers, or the engine-level security will block the request. Supabase specifically requires `apikey` and `x-client-info` to be allowed.
- **Correct Fulfillment:**
```typescript
await route.fulfill({
  status: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(data)
});
```

### 3. The Airtight Proxy Rule
WebKit's handling of specific `RegExp` and glob strings for cross-origin URLs can be inconsistent and segment-aware, leading to "leaks."
- **Standard:** Use a **Catch-All Proxy** (`context.route('**/*', handler)`) with internal dispatching logic (`url.includes(...)`) to ensure 100% interception reliability. Avoid multiple individual route registrations which create priority gaps.

### 4. The Storage Origin Rule
`window.indexedDB`, `localStorage`, and `caches` in WebKit often throw `SecurityError` or silently fail if accessed before a valid origin is established.
- **Rule:** Automated cleanup helpers (like `clearServiceWorkers`) MUST navigate to the application's domain (e.g., `await page.goto('/')`) BEFORE attempting to clear storage or unregister workers.

### 5. The SSR Safety Rule (E2E Utilities)
Diagnostic components like `E2EStoreExposer` must be strictly gated to the browser.
- **Incorrect:** Rendering logic that assumes `window` is present during the initial Node.js render.
- **Correct:** Return `null` immediately if `typeof window === 'undefined'` to prevent 500 Internal Server Errors during container builds.

### 6. The PWA URL Rule
WebKit/Safari often fails to register or unregisters the Service Worker on `localhost` unless explicitly flagged.
- **Standard:** All PWA-specific tests MUST append `?pwa=true` to the navigation URL.
- **Helper:** Update the `login` helper to accept an `isPwa` option that handles this suffix automatically.

### 7. The Nuclear Store Bypass Rule
When Playwright interception is bypassed by Service Worker threads in WebKit, you MUST sever the connection at the logic level.
- **Standard:** Stores (`wineryDataStore`, `visitStore`) should check `process.env.NEXT_PUBLIC_IS_E2E === 'true'` and immediately return mock data/IDs for heavy RPCs (`hydrateWineries`, `ensureInDb`).
- **Impact:** This ensures 100% data isolation even if the network proxy is circumvented.

### 8. The Deterministic Mocking Rule
Mock data that is "too partial" triggers lazy-load fetches (e.g., fetching winery details if `openingHours` is missing).
- **Standard:** E2E mock markers MUST include `openingHours: null` and `reviews: []` to satisfy hydration checks and prevent the UI from entering a "Loading" state or triggering unmocked Edge Functions.

Reference: [WebKit Fetch Limitations](https://webkit.org/blog/12193/js-fetch-api-updates/)
