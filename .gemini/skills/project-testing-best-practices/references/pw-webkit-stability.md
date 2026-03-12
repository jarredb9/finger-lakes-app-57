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
**MANDATORY FOR WEBKIT.** Every `context.route()` fulfillment MUST include specific headers, or the engine level security will block the request.
- **Correct Fulfillment:**
```typescript
await route.fulfill({
  status: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(data)
});
```

### 3. The SSR Safety Rule (E2E Utilities)
Diagnostic components like `E2EStoreExposer` must be strictly gated to the browser.
- **Incorrect:** Rendering logic that assumes `window` is present during the initial Node.js render.
- **Correct:** Return `null` immediately if `typeof window === 'undefined'` to prevent 500 Internal Server Errors during container builds.

Reference: [WebKit Fetch Limitations](https://webkit.org/blog/12193/js-fetch-api-updates/)
