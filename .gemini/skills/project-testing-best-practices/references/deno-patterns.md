---
title: Deno Edge Function Testing
impact: HIGH
impactDescription: 100% backend logic coverage, prevents quota exhaustion and live-db mutations during tests
tags: deno, edge-functions, supabase, mocking, unit-tests
---

## Deno Edge Function Testing

Supabase Edge Functions are powered by Deno. To enable robust unit testing without spinning up a full Supabase local stack or hitting live APIs (which exhausts quotas), functions must follow a specific architectural pattern.

### 1. The Handler Export Pattern
Edge functions MUST export their main request handler. `Deno.serve` should only be called if the script is the main module (`import.meta.main`).

**Incorrect (Untestable):**
```typescript
import { serve } from "std/http/server.ts"

serve(async (req) => {
  // ... logic
  return new Response("ok");
})
```

**Correct (Testable):**
```typescript
import { serve } from "std/http/server.ts"

export const handler = async (req: Request): Promise<Response> => {
  // ... logic
  return new Response("ok");
};

if (import.meta.main) {
  serve(handler);
}
```

### 2. Dependency Management
All dependencies (Supabase SDK, std library) MUST be routed through `supabase/functions/import_map.json`.
- **Rule:** Never use bare URL imports (like `https://esm.sh/...`) directly in the function code.
- **Verification:** Run tests using `npm run test:functions` which automatically applies the `--import-map` flag.

### 3. Environment & Network Mocking
Tests must isolate the function from the real network and environment.
- **`Deno.env`**: Use `const originalEnvGet = Deno.env.get;` to spy/mock environment variables (like `SUPABASE_URL` and `GOOGLE_MAPS_API_KEY`), and restore them in a `finally` block.
- **`fetch`**: Overwrite `globalThis.fetch` to intercept external API calls (e.g., to Google Places API) and return predictable JSON structures.

### 4. Background Persistence Isolation
Many Edge Functions use "fire-and-forget" IIFEs (Immediately Invoked Function Expressions) for background persistence (e.g., upserting to Supabase after returning a response to the client).
- **Standard:** Tests must ensure the IIFE has time to execute if its side-effects are being asserted, OR mock the Supabase client creation to prevent it from failing.
- **Syntax:** Always prepend the background IIFE with a semicolon `;(async () => { ... })()` (or ensure the preceding block ends with one) to prevent JavaScript parsing errors (e.g., `TypeError: ... is not a function`) when the preceding line lacks a semicolon.
