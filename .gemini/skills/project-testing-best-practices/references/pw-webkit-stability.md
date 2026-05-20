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
**MANDATORY FOR WEBKIT.** Every `context.route()` fulfillment MUST include specific headers, or the engine-level security will block the request. Supabase specifically requires `apikey` and `x-client-info` to be allowed. Any custom E2E headers (like `x-skip-sw-interception`) MUST also be explicitly listed in `Access-Control-Allow-Headers`.
- **Correct Fulfillment:**
```typescript
await route.fulfill({
  status: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(data)
});
```

### 3. Optimized Network Proxying
To ensure high performance in containerized environments, avoid expensive `**/*` catch-all proxies.
- **Standard:** Use targeted regex/glob patterns for Supabase and Google Maps interception. This reduces CPU overhead and eliminates network race conditions in multi-worker scenarios.

### 4. The Storage Origin Rule (IDB Deletion)
`window.indexedDB`, `localStorage`, and `caches` in WebKit often throw `SecurityError` or silently fail if accessed before a valid origin is established. Furthermore, IndexedDB deletion can be **blocked indefinitely** if the application still has open connections.
- **Rule:** Automated cleanup helpers (like `clearServiceWorkers`) MUST navigate to `about:blank` BEFORE and AFTER attempting to clear storage. 
- **Rationale:** Navigating to `about:blank` forces the browser to close all active connections to the application's origin, allowing the `deleteDatabase` request to proceed immediately instead of being queued/blocked.


### 5. The SSR Safety Rule (E2E Utilities)
Diagnostic components like `E2EStoreExposer` must be strictly gated to the browser.
- **Incorrect:** Rendering logic that assumes `window` is present during the initial Node.js render.
- **Correct:** Return `null` immediately if `typeof window === 'undefined'` to prevent 500 Internal Server Errors during container builds.

### 6. The PWA URL Rule
WebKit/Safari often fails to register or unregisters the Service Worker on `localhost` unless explicitly flagged.
- **Standard:** All PWA-specific tests MUST append `?pwa=true` to the navigation URL.
- **Helper:** Update the `login` helper to accept an `isPwa` option that handles this suffix automatically.

### 7. The Nuclear Bypass Rule (Stores & API)
When Playwright interception is bypassed by Service Worker threads or engine-level fetch failures in WebKit, you MUST sever the connection at the logic level.

#### A. Zustand Stores
- **Standard:** Stores (`wineryDataStore`, `visitStore`) should check `process.env.NEXT_PUBLIC_IS_E2E === 'true'`. 
- **Pattern:** They MUST return mock data/IDs for heavy RPCs (`hydrateWineries`, `ensureInDb`, `log_visit`) UNLESS an opt-in flag like `globalThis._E2E_ENABLE_REAL_SYNC` or `localStorage.getItem('_E2E_ENABLE_REAL_SYNC')` is truthy. **Prefer `localStorage` for flags that must survive redirects (e.g. Login).**

#### B. API Routes (Auth & Code Exchange)
- **Standard:** Any API route that exchanges tokens or codes (e.g., `api/auth/reset-password`) MUST implement a **server-side bypass** for the token value `'mock-code'`.
- **CRITICAL:** The bypass check MUST happen **before any Supabase client initialization** (`createClient()`).
- **Rationale:** Initializing the Supabase client triggers PKCE cookie resolution. In emulated E2E environments, this often fails with `AuthPKCECodeVerifierMissingError` if the session state is brittle. 
- **Implementation:**
```typescript
export async function POST(req: Request) {
  const { code } = await req.json();
  if (code === 'mock-code') return NextResponse.json({ message: "Success" });
  const supabase = await createClient(); // Only called if NOT mocking
  // ...
}
```


### 8. The Deterministic Mocking Rule
Mock data that is "too partial" triggers lazy-load fetches (e.g., fetching winery details if `openingHours` is missing).
- **Standard:** E2E mock markers MUST include `openingHours: null` and `reviews: []` to satisfy hydration checks and prevent the UI from entering a "Loading" state or triggering unmocked Edge Functions.

### 9. The Explicit Header Bypass Rule
WebKit's Service Worker matcher can fail to detect E2E modes via URL params alone. 
- **Standard:** Requests requiring SW bypass MUST include an `x-skip-sw-interception: true` header. 
- **Implementation:** The SW matcher in `sw.ts` MUST check `request.headers.get('x-skip-sw-interception')` to reliably yield to Playwright's network interception.

### 10. The Storage Signing Rule
Mocking `supabase.storage.upload` is insufficient if the app logic immediately generates signed URLs for newly synced photos. 
- **Rule:** Tests MUST also intercept the `storage/v1/object/sign/*` endpoint and return a mocked `{ signedURL: '...' }` structure. 
- **Rationale:** Prevents `Failed to fetch` console errors that crash tests under strict error policies during network transitions.

### 11. The Persistent Signal Rule
In Next.js 16 + WebKit, coming back "online" often triggers hydration reloads or auth redirects that clear `window` state.
- **Standard:** E2E verification signals (like `_E2E_SYNC_REQUEST_INTERCEPTED` or `_E2E_ENABLE_REAL_SYNC`) MUST be mirrored to `localStorage`.
- **Verification:** Tests should check `localStorage` if the signal appears `undefined` despite being set in store logs.

### 12. The Rendering Verification Rule
Images rendered via signed URLs (Supabase) in WebKit/Safari can intermittently fail due to CORS or race conditions with the Service Worker.
- **Rule:** Simply checking for visibility or `src` presence is insufficient.
- **Standard:** Verify the image is actually rendered using `naturalWidth > 0`.
- **Implementation:**
```typescript
await expect(async () => {
    const naturalWidth = await imgLocator.evaluate((img: HTMLImageElement) => img.naturalWidth);
    if (naturalWidth === 0) throw new Error('Image failed to render');
}).toPass();
```

### 13. The SW Sabotage Rule
For non-PWA tests in WebKit, Service Workers can intermittently capture network requests even if bypassing headers (`x-skip-sw-interception`) are present, especially during rapid navigation or redirects.
- **Standard:** `MockMapsManager` or the test's `addInitScript` MUST sabotage `navigator.serviceWorker.register` to prevent the SW thread from starting unless explicitly enabled (e.g., for `pwa-*` tests).
- **Implementation:**
```typescript
if ('serviceWorker' in navigator) {
  (navigator.serviceWorker as any).register = () => {
    console.log('[DIAGNOSTIC] SW Registration blocked for test stability');
    return Promise.reject(new Error('SW blocked for non-PWA test'));
  };
}
```

### 13. The SW Quota Purge Rule
Aggressive document and tile caching in WebKit can trigger `QuotaExceededError` even if the device has space.
- **Standard:** Every `ExpirationPlugin` in `sw.ts` MUST set `purgeOnQuotaError: true`.
- **CRITICAL:** Build-time analysis of this property requires **Node.js 20.x**. Using other versions may trigger a `TypeError (length of undefined)` during the Serwist build phase.
- **Implementation:**
```typescript
new ExpirationPlugin({
  maxEntries: 64,
  purgeOnQuotaError: true, // MANDATORY
})
```

### 14. The Middleware Matcher Rule
Middleware matchers that exclude files with dots (`.*\\..*`) will accidentally bypass `/sw.js` and `/site.webmanifest`, leading to stale sessions or 404s.
- **Standard:** Use an explicit extension-based exclusion list that preserves root-level PWA files (like `.js` and `.webmanifest`).
- **Correct Matcher:**
```typescript
'/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|svg|css)$).*)'
```

Reference: [WebKit Fetch Limitations](https://webkit.org/blog/12193/js-fetch-api-updates/)
