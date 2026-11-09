# Implementation Plan: Phase 8 Task 2 — Implement Edge Function Authentication & Privacy Safeguards (TDD Green phase)

**Track:** `postgrest-rls-storage-hardening_20261104` (Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93))  
**Phase:** 8 (Edge Function Authentication & Privacy Lockdown — Strict TDD)  
**Task:** 2 (Implement Edge Function authentication & privacy safeguards — TDD Green phase)  
**Preceding Context:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/phase-8-task-1-plan.md](./phase-8-task-1-plan.md)  
**ADR References:**
- [docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md](../../../docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md)
- [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)
- [docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/spec.md](./spec.md) Section 3.11  
**Track Plan Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md](./plan.md) lines 127–134  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Transition all 5 failing security, authorization, and privacy test suites authored in Phase 8 Task 1 (`supabase/functions/tests/security-privacy.test.ts`) from **Red** to **Green** by implementing authoritative safeguards across the Supabase Edge Function boundary:

1. **`supabase/config.toml` Gateway Enforcement:**
   - Configure `verify_jwt = true` for `[functions.search-wineries]` and `[functions.get-winery-details]` to enforce gateway-level JWT validation at the Kong ingress proxy.
2. **`search-wineries` Handler Authentication Gate:**
   - Extract the `Authorization` header, validate caller session validity via `supabase.auth.getUser(token)`, and return HTTP `401 Unauthorized` for missing or invalid JWTs.
3. **`get-winery-details` Handler Authentication Gate:**
   - Extract the `Authorization` header, validate caller session validity via `supabase.auth.getUser(token)`, and return HTTP `401 Unauthorized` for missing or invalid JWTs.
4. **`get-winery-details` Review Privacy & AI Consent Isolation:**
   - Enforce database-level filtering (`is_private = false` and `profiles.ai_enabled = true`) when querying `visits` for winery enrichment.
   - Implement defense-in-depth in-memory filtering so private reviews or reviews from opted-out users are strictly excluded from Gemini prompt payloads.
5. **`_shared/gemini.ts` Fallback Sanitization, Global Scope & Freshness Guard:**
   - Eliminate verbatim user review quote snippets (`Guests frequently note: "..."`) from fallback summaries.
   - Align fallback text and vibe tags with global discovery scope ([ADR-0004](../../../docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md)), omitting regional "Finger Lakes" assumptions for non-FLX wineries.
   - Return an explicit `error` indicator on fallback enrichment so `get-winery-details` sets `last_enriched_at = null`, preventing wineries from locking into an un-enriched state for 30 days.
6. **`send-social-notification` Webhook Authorization Gate:**
   - Enforce Bearer token verification against `INTERNAL_WEBHOOK_SECRET` or service role authorization, returning HTTP `401 Unauthorized` on missing or invalid secrets.
7. **Test Suite Compatibility & Baseline Parity:**
   - Maintain full passing status across baseline test suites (`search-wineries/index.test.ts`, `get-winery-details/index.test.ts`, `send-social-notification/index.test.ts`, `tests/webhook-url.test.ts`) by synchronizing auth headers and mock helpers.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety ([AGENTS.md](../../../AGENTS.md) Critical Guardrail 1):**
   - Strictly zero database mutations or migrations against the remote Supabase project (`jfsxclrdxmvftxacjuqf`).
2. **Zero-Trust Defense-in-Depth ([CONTEXT.md](../../../CONTEXT.md), [spec.md](./spec.md)):**
   - Public Edge Functions must enforce both gateway verification (`config.toml` `verify_jwt = true`) and application-level handler verification (`supabase.auth.getUser()`).
3. **User Privacy & AI Opt-In Consent ([CONTEXT.md](../../../CONTEXT.md)):**
   - User reviews marked `is_private = true` or authored by users with `ai_enabled = false` must never be queried or dispatched to external LLM services or written to public catalog fields.
4. **Global Discovery Scope ([ADR-0004](../../../docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md)):**
   - Fallback copy and tags must adapt dynamically to the winery location and must not hardcode "Finger Lakes" copy for wineries outside the region.
5. **Enrichment Freshness Integrity:**
   - Fallback enrichment must return an error indicator and caller must set `last_enriched_at = null` so future visits can attempt live AI enrichment.
6. **Internal Webhook Protection:**
   - `send-social-notification` is an internal webhook target; unauthenticated callers must be blocked from enumerating social graphs or triggering notifications.
7. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Halt immediately for explicit affirmative user approval via the `ask_question` modal before modifying any application files on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target 1: Supabase Configuration
- **Path:** `supabase/config.toml`
- **Semantic Insertion Anchor:** Lines 337–342 under `[functions.search-wineries]` and `[functions.get-winery-details]`.
- **Change:** Set `verify_jwt = true` for both functions.

### 3.2 Target 2: Search Wineries Edge Function Handler
- **Path:** `supabase/functions/search-wineries/index.ts`
- **Semantic Insertion Anchor:** Inside `handler` function immediately after `OPTIONS` preflight handling (line 14) and before request body extraction.
- **Change:** Inspect `Authorization` header, instantiate Supabase client with caller credentials, invoke `supabase.auth.getUser(token)`, and return HTTP 401 if unauthorized.

### 3.3 Target 3: Winery Details Edge Function Handler
- **Path:** `supabase/functions/get-winery-details/index.ts`
- **Semantic Insertion Anchors:**
  1. *Authentication Gate:* Inside `handler` immediately after `OPTIONS` preflight check (line 16) and before body parsing.
  2. *Review Privacy Seam:* Lines 73–85 where `visits` are queried. Add PostgREST query parameters (`is_private = false`, `profiles.ai_enabled = true`) and memory-level defensive filtering.
  3. *Enrichment Freshness Seam:* Lines 110–116 where `last_enriched_at` is evaluated. Check `geminiResult.error` and set `last_enriched_at = null` when fallback or error occurred.

### 3.4 Target 4: Shared Gemini Enrichment Utility
- **Path:** `supabase/functions/_shared/gemini.ts`
- **Semantic Insertion Anchors:**
  1. *Fallback Summary Sanitization:* Inside `generateSmartFallback` (lines 187–195), remove `Guests frequently note:` quote snippet copying.
  2. *Global Region Handling:* Inside `generateSmartFallback` (lines 169–185), check if winery address or name matches Finger Lakes geography before assigning "Finger Lakes Wine" vibe tag or varietals descriptions.
  3. *Error Indicator Return:* Update return payload of `generateSmartFallback` and `generateGeminiSummary` to include `error: "Smart fallback enrichment applied; live AI generation was unavailable"`.

### 3.5 Target 5: Social Notification Edge Function Handler
- **Path:** `supabase/functions/send-social-notification/index.ts`
- **Semantic Insertion Anchor:** Inside `handler` immediately after `OPTIONS` preflight check (line 12) and before body parsing.
- **Change:** Validate `Authorization: Bearer <token>` against `INTERNAL_WEBHOOK_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`, returning HTTP 401 if missing or invalid.

### 3.6 Target 6: Shared Test Helpers & Baseline Test Files
- **Path:** `supabase/functions/_shared/testing-helpers.ts`
  - **Semantic Insertion Anchor:** Inside `mockFetch` (line 47), add handler for `${SUPABASE_URL}/auth/v1/user` returning mock authenticated user.
- **Path:** `supabase/functions/search-wineries/index.test.ts`
  - **Semantic Insertion Anchor:** Update test request constructors to include `Authorization: Bearer test-token` and ensure `SUPABASE_URL` is configured in `mockDenoEnv`.
- **Path:** `supabase/functions/get-winery-details/index.test.ts`
  - **Semantic Insertion Anchor:** Update test request constructors to include `Authorization: Bearer test-token`.
- **Path:** `supabase/functions/send-social-notification/index.test.ts`
  - **Semantic Insertion Anchor:** Update test request constructors to include `Authorization: Bearer test-role-key`.

### 3.7 Target 7: Track Plan
- **Path:** `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`
- **Semantic Insertion Anchor:** Lines 127–134 under `## Phase 8: Edge Function Authentication & Privacy Lockdown (Strict TDD)`.
- **Change:** Mark task and subtasks complete `[x]` with commit hash upon verification.

---

## 4. Full TypeScript Interfaces & Blueprint Signatures

### 4.1 Gemini Enrichment Result Interface (`supabase/functions/_shared/gemini.ts`)
```typescript
export interface GeminiEnrichmentResult {
  generative_summary: { overview: { text: string } } | null;
  vibe_tags: string[];
  varietals: Array<{
    name: string;
    description?: string;
    sweetness?: number;
    body?: number;
    price?: string;
  }>;
  error?: string;
  errorDetails?: string[];
  is_fallback?: boolean;
}

export function generateGeminiSummary(
  wineryName: string,
  address: string,
  googleReviews?: Array<{ text: string }>,
  appReviews?: Array<{ user_review: string }>
): Promise<GeminiEnrichmentResult>;

export function generateSmartFallback(
  wineryName: string,
  address: string,
  googleReviews?: Array<{ text: string }>,
  appReviews?: Array<{ user_review: string }>,
  errorMessage?: string
): GeminiEnrichmentResult;
```

### 4.2 Auth Verification Helper Signature
```typescript
export interface AuthValidationResult {
  authenticated: boolean;
  user?: { id: string; email?: string };
  error?: string;
}

export async function validateBearerAuth(
  req: Request,
  supabaseUrl: string,
  anonOrServiceKey: string
): Promise<AuthValidationResult>;
```

### 4.3 Webhook Authorization Verification Signature
```typescript
export function validateWebhookSecret(
  req: Request,
  expectedSecrets: Array<string | undefined>
): boolean;
```

---

## 5. Precise Behavioral Logic & State Transitions

### 5.1 Gateway Configuration (`supabase/config.toml`)
Update `[functions.search-wineries]` and `[functions.get-winery-details]`:
```toml
[functions.search-wineries]
verify_jwt = true

[functions.get-winery-details]
verify_jwt = true
```

### 5.2 `search-wineries` Handler Authentication Flow (`search-wineries/index.ts`)
1. Handle `OPTIONS` preflight: return 200 with `corsHeaders`.
2. Extract `Authorization` header from `req.headers.get('Authorization')`.
3. If header is missing or does not start with `Bearer `:
   - Return HTTP `401 Unauthorized`:
     ```json
     { "error": "Unauthorized: Missing authorization header" }
     ```
4. Extract `token = authHeader.replace(/^Bearer\s+/i, '').trim()`.
5. Create Supabase client targeting `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or fallback `SUPABASE_SERVICE_ROLE_KEY`) with `{ global: { headers: { Authorization: authHeader } } }`.
6. Invoke `supabase.auth.getUser(token)`.
7. If `authError` or `!user`:
   - Return HTTP `401 Unauthorized`:
     ```json
     { "error": "Unauthorized: Invalid or expired token" }
     ```
8. Proceed to API key validation, Google Places search, and background RPC upsert.

### 5.3 `get-winery-details` Handler Authentication & Privacy Flow (`get-winery-details/index.ts`)
1. Handle `OPTIONS` preflight: return 200 with `corsHeaders`.
2. Extract `Authorization` header and validate format `Bearer <token>`. Return HTTP 401 if missing.
3. Validate token via `supabaseClient.auth.getUser(token)`. Return HTTP 401 if invalid.
4. When querying `visits` for in-app reviews:
   - Database query must filter:
     ```typescript
     const { data: visits } = await supabaseClient
       .from('visits')
       .select('user_review, is_private, profiles!inner(ai_enabled)')
       .eq('winery_id', winery.id)
       .eq('is_private', false)
       .eq('profiles.ai_enabled', true)
       .not('user_review', 'is', null);
     ```
   - Defensive in-memory filter:
     ```typescript
     if (visits) {
       appReviews = (visits as Array<any>)
         .filter((v) => {
           if (v.is_private === true) return false;
           const aiEnabled = v.profiles?.ai_enabled ?? v.ai_enabled;
           return aiEnabled === true;
         })
         .map((v) => ({ user_review: v.user_review }));
     }
     ```
5. When evaluating enrichment result:
   - Check `if (!geminiResult.generative_summary || geminiResult.error)`:
     - Set `wineryData.last_enriched_at = null;`
     - If `!wineryData.generative_summary`, set to `null`.
   - Ensures records receiving fallback enrichment are not stamped with `last_enriched_at`, preserving freshness.

### 5.4 `_shared/gemini.ts` Fallback Logic & Global Scope Alignment
1. In `generateSmartFallback`:
   - Inspect winery location:
     ```typescript
     const isFingerLakes = /\b(finger lakes|keuka|seneca|cayuga|canandaigua|skaneateles|flx|watkins glen|geneva|hammondsport|ithaca|penn yan)\b/i.test(`${address} ${wineryName}`);
     ```
   - Vibe tags generation:
     - If extracted vibe tags count `< 2`:
       - If `isFingerLakes`: push `'Finger Lakes Wine', 'Tasting Room'`.
       - If non-FLX: push `'Wine Tasting', 'Tasting Room'`.
   - Varietals descriptions:
     - If `isFingerLakes`: description contains `'Crisp and vibrant Finger Lakes white...'`.
     - If non-FLX: description contains `'Crisp and vibrant white...'`.
   - Overview summary text:
     - Sanitized summary:
       ```typescript
       const regionText = isFingerLakes ? 'Finger Lakes winery' : 'winery';
       const summaryText = `${wineryName} is a ${regionText} located at ${address}, known for its distinctive wines and scenic setting.`;
       ```
     - Strictly omit verbatim user review quotes and omit `'Guests frequently note:'`.
   - Return object:
     ```typescript
     return {
       generative_summary: { overview: { text: summaryText } },
       vibe_tags: vibeTags.slice(0, 4),
       varietals,
       error: errorMessage || "Smart fallback enrichment applied; live AI generation was unavailable",
       errorDetails: [errorMessage || "Fallback enrichment applied"],
       is_fallback: true,
     };
     ```

### 5.5 `send-social-notification` Webhook Secret Authorization (`send-social-notification/index.ts`)
1. Handle `OPTIONS` preflight: return 200 with `corsHeaders`.
2. Extract `authHeader = req.headers.get('Authorization')`.
3. If `!authHeader || !authHeader.startsWith('Bearer ')`:
   - Return HTTP `401 Unauthorized`:
     ```json
     { "error": "Unauthorized: Missing or invalid authorization header" }
     ```
4. Extract `token = authHeader.replace(/^Bearer\s+/i, '').trim()`.
5. Retrieve `internalSecret = Deno.env.get('INTERNAL_WEBHOOK_SECRET')` and `serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
6. Assert `(internalSecret && token === internalSecret) || (serviceKey && token === serviceKey)`.
7. If secret does not match:
   - Return HTTP `401 Unauthorized`:
     ```json
     { "error": "Unauthorized: Invalid secret token" }
     ```
8. Proceed with activity privacy checks, follower lookups, and notification delivery.

### 5.6 Baseline Test Adaptations (`testing-helpers.ts` & existing test specs)
1. In `_shared/testing-helpers.ts`:
   - Inside `mockFetch`, if `urlStr.includes('/auth/v1/user')`, return HTTP 200 with `{ id: "mock-user-id", email: "test@example.com" }`.
2. In `search-wineries/index.test.ts`:
   - Ensure all `POST` test requests provide `Authorization: "Bearer test-jwt-token"`.
   - In `search-wineries handler - missing API key`, provide `Authorization: "Bearer test-jwt-token"` and include `SUPABASE_URL` in `mockDenoEnv` so auth passes before testing missing API key.
3. In `get-winery-details/index.test.ts`:
   - Ensure all `POST` test requests provide `Authorization: "Bearer test-jwt-token"`.
4. In `send-social-notification/index.test.ts`:
   - Ensure all `POST` test requests provide `Authorization: "Bearer test-role-key"`.

---

## 6. Execution Verification Protocol

Perform empirical verification using the Deno test runner:

### 6.1 Execute Edge Function Tests
Run the standard Deno function test suite:
```bash
npm run test:functions
```
*Direct Deno invocation equivalent:*
```bash
deno test --allow-all --config supabase/functions/deno.json supabase/functions/
```

### 6.2 Expected TDD Green Verification Outcome
1. `supabase/functions/tests/security-privacy.test.ts`: All 5 test suites pass cleanly:
   - `search-wineries auth - returns 401 when Authorization header is missing` -> **PASS**
   - `search-wineries auth - returns 401 when Authorization Bearer token is invalid` -> **PASS**
   - `get-winery-details auth - returns 401 when Authorization header is missing` -> **PASS**
   - `get-winery-details auth - returns 401 when Authorization Bearer token is invalid` -> **PASS**
   - `get-winery-details privacy - filters is_private=eq.false and checks ai_enabled at database seam` -> **PASS**
   - `get-winery-details privacy - excludes private reviews and reviews from ai_enabled=false users from Gemini prompt` -> **PASS**
   - `generateSmartFallback - does not copy verbatim user review snippets into summary` -> **PASS**
   - `generateSmartFallback - does not hardcode Finger Lakes copy for wineries outside FLX` -> **PASS**
   - `generateSmartFallback - returns explicit error indicator on fallback result` -> **PASS**
   - `send-social-notification auth - returns 401 when Authorization header is missing` -> **PASS**
   - `send-social-notification auth - returns 401 when Authorization secret is invalid` -> **PASS**
2. Baseline suites (`search-wineries/index.test.ts`, `get-winery-details/index.test.ts`, `send-social-notification/index.test.ts`, `tests/webhook-url.test.ts`): All existing tests continue to **PASS** without regression.
3. Overall suite status: **0 failed, 100% passed**.

---

## 7. Post-Execution Protocol & Git Notes

### 7.1 Git Commit Convention
Stage application code, configuration, and test adaptation files:
```bash
git add supabase/config.toml \
        supabase/functions/search-wineries/index.ts \
        supabase/functions/get-winery-details/index.ts \
        supabase/functions/_shared/gemini.ts \
        supabase/functions/send-social-notification/index.ts \
        supabase/functions/_shared/testing-helpers.ts \
        supabase/functions/search-wineries/index.test.ts \
        supabase/functions/get-winery-details/index.test.ts \
        supabase/functions/send-social-notification/index.test.ts \
        conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md
git commit -m "feat(functions): implement edge function authentication and privacy safeguards"
```

### 7.2 Git Notes Command
```bash
git notes add -m "Task: Implement Edge Function authentication & privacy safeguards (TDD Green phase)
Summary: Hardened Edge Functions by enabling gateway verify_jwt in supabase/config.toml, enforcing bearer token verification via supabase.auth.getUser() in search-wineries and get-winery-details, restricting review enrichment to public notes from ai_enabled profiles, sanitizing fallback summaries to remove review snippets and respect ADR-0004 global scope, marking fallback results with error indicator to preserve freshness, and requiring secret authorization on send-social-notification.
Files: supabase/config.toml, supabase/functions/search-wineries/index.ts, supabase/functions/get-winery-details/index.ts, supabase/functions/_shared/gemini.ts, supabase/functions/send-social-notification/index.ts, supabase/functions/_shared/testing-helpers.ts, supabase/functions/search-wineries/index.test.ts, supabase/functions/get-winery-details/index.test.ts, supabase/functions/send-social-notification/index.test.ts, conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md
Rationale: Delivers the TDD Green phase for Phase 8, closing all 5 Edge Function security, authorization, and privacy requirements of Issue #93, ADR-0004, ADR-0007, and ADR-0010."
```
