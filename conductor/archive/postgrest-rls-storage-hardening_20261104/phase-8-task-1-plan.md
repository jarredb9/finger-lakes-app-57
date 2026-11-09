# Implementation Plan: Phase 8 Task 1 — Write Failing Edge Function Security and Privacy Tests (TDD Red phase)

**Track:** `postgrest-rls-storage-hardening_20261104` (Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93))  
**Phase:** 8 (Edge Function Authentication & Privacy Lockdown — Strict TDD)  
**Task:** 1 (Write failing Edge Function security and privacy tests — TDD Red phase)  
**Preceding Context:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/phase-7-task-2-plan.md](./phase-7-task-2-plan.md)  
**ADR References:**
- [docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md](../../../docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md)
- [docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md](../../../docs/adr/0007-security-invoker-rpc-boundary-and-catalog-immutability.md)
- [docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md](../../../docs/adr/0010-direct-table-rls-privilege-revocation-and-private-storage.md)  
**Domain Context:** [CONTEXT.md](../../../CONTEXT.md)  
**Specification Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/spec.md](./spec.md) Section 3.11  
**Track Plan Reference:** [conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md](./plan.md) lines 117–126  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Establish authoritative failing Deno security and privacy regression tests in [supabase/functions/tests/security-privacy.test.ts](../../../supabase/functions/tests/security-privacy.test.ts) covering the 5 security, authorization, and privacy boundaries defined in Issue [#93](https://github.com/jarredb9/finger-lakes-app-57/issues/93) and Section 3.11 of the track specification:

1. **`search-wineries` Bearer Token Authentication Gate:**
   - Assert that invoking `search-wineries` without an `Authorization` header returns HTTP `401 Unauthorized`.
   - Assert that invoking `search-wineries` with an invalid Bearer token returns HTTP `401 Unauthorized`.
2. **`get-winery-details` Bearer Token Authentication Gate:**
   - Assert that invoking `get-winery-details` without an `Authorization` header returns HTTP `401 Unauthorized`.
   - Assert that invoking `get-winery-details` with an invalid Bearer token returns HTTP `401 Unauthorized`.
3. **`get-winery-details` Private Review Isolation & AI Opt-In Consent Guard:**
   - Assert that queries to `visits` explicitly filter for `is_private = false` (preventing private review leakage to LLM services).
   - Assert that in-app reviews are only included if the reviewer has `profiles.ai_enabled = true` (enforcing explicit user consent for AI ingestion).
   - Assert that if private reviews or reviews from users with `ai_enabled = false` exist in the database, their text is never included in the prompt payload dispatched to Gemini (`generativelanguage.googleapis.com`).
4. **`generateSmartFallback` Review Sanitization, Global Scope & Freshness Guard:**
   - Assert that fallback enrichment does not copy verbatim user review snippets into `generative_summary` (`Guests frequently note: "..."`).
   - Assert that for wineries located outside the Finger Lakes region (e.g., Napa Valley, CA or Bordeaux, France), `generative_summary`, `vibe_tags`, and `varietals` do not contain hardcoded "Finger Lakes" copy (conforming to [ADR-0004](../../../docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md)).
   - Assert that `generateSmartFallback` returns an explicit `error` indicator so callers (`get-winery-details`) can distinguish fallback data from true enrichment and prevent stamping `last_enriched_at` (avoiding locking records in un-enriched state for 30 days).
5. **`send-social-notification` Webhook Authorization Gate:**
   - Assert that invoking `send-social-notification` without an `Authorization` header returns HTTP `401 Unauthorized`.
   - Assert that invoking `send-social-notification` with an invalid secret returns HTTP `401 Unauthorized` (preventing unauthenticated friend-graph enumeration).

### 1.2 Development Methodology: Strict TDD Red Phase
In compliance with `conductor/workflow.md` and [AGENTS.md](../../../AGENTS.md) Section 5:
- All test assertions are authored against the **current unhardened codebase**.
- In the baseline state:
  - `search-wineries/index.ts` does not inspect `Authorization` headers or call `supabase.auth.getUser()`, returning HTTP 200/400 instead of 401.
  - `get-winery-details/index.ts` does not inspect `Authorization` headers, returning HTTP 200/400 instead of 401.
  - `get-winery-details/index.ts` queries `visits` without checking `is_private = false` or `profiles.ai_enabled = true`, passing private reviews to Gemini.
  - `_shared/gemini.ts` copies user review snippets verbatim, hardcodes "Finger Lakes" for all wineries, and returns no error property on fallback.
  - `send-social-notification/index.ts` does not validate caller authorization, returning HTTP 200/400 without requiring `INTERNAL_WEBHOOK_SECRET` or service role credentials.
- Modifying application code (`supabase/config.toml`, `search-wineries/index.ts`, `get-winery-details/index.ts`, `_shared/gemini.ts`, `send-social-notification/index.ts`) is strictly reserved for Phase 8 Task 2 (Green phase).

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety ([AGENTS.md](../../../AGENTS.md) Critical Guardrail 1):**
   - Strictly zero database mutations or migrations against the remote Supabase project (`jfsxclrdxmvftxacjuqf`).
2. **Zero-Trust Edge Function Authentication ([CONTEXT.md](../../../CONTEXT.md), [spec.md](./spec.md)):**
   - Public client-facing Edge Functions must require authenticated user sessions (`Authorization: Bearer <jwt>`).
   - Internal webhook targets must require shared internal webhook secret or service role authorization.
3. **User Privacy & AI Opt-In Isolation ([CONTEXT.md](../../../CONTEXT.md)):**
   - Private visit notes (`is_private = true`) and notes from users who have opted out of AI features (`ai_enabled = false`) must never be dispatched to third-party AI APIs or written to public catalog fields.
4. **Global Winery Discovery Scope ([ADR-0004](../../../docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md)):**
   - Catalog enrichment and fallback algorithms must support wineries worldwide without hardcoding regional assumptions ("Finger Lakes").
5. **Enrichment Freshness Integrity:**
   - Fallback enrichment must not mark a winery as enriched (`last_enriched_at` must remain null) so subsequent requests can re-attempt live AI enrichment.
6. **Strict TDD Red Phase Invariant (`conductor/workflow.md`):**
   - Tests must be executed and proven failing (Red) with clear assertion errors before any application changes are authored.
7. **Modal Approval Invariant (`conductor_antigravity.md` & [AGENTS.md](../../../AGENTS.md) Section 2):**
   - Halt immediately for explicit affirmative user approval via the `ask_question` modal before creating or modifying any files on disk.

---

## 3. Target Files & Semantic Insertion Anchors

### 3.1 Target 1: Edge Function Security & Privacy Test Suite
- **Path:** `supabase/functions/tests/security-privacy.test.ts`
- **Semantic Insertion Anchor:** Entirely new test file located in `supabase/functions/tests/`. Automatically executed via `npm run test:functions` (`deno test --allow-all --config supabase/functions/deno.json supabase/functions/`).
- **File Role:** Contains Deno test assertions for Bearer token authentication on `search-wineries`, `get-winery-details`, and `send-social-notification`, review privacy/AI-opt-in isolation in `get-winery-details`, and sanitization, global scope, and error indicators in `generateSmartFallback`.

### 3.2 Target 2: Track Plan
- **Path:** `conductor/tracks/postgrest-rls-storage-hardening_20261104/plan.md`
- **Semantic Insertion Anchor:** Lines 119–126 under `## Phase 8: Edge Function Authentication & Privacy Lockdown (Strict TDD)`.
- **File Role:** Mark task and subtasks complete `[x]` with commit hash upon verification.

---

## 4. TypeScript Interfaces & Blueprint Signatures

### 4.1 Test Utility & Mock Signatures (`supabase/functions/tests/security-privacy.test.ts`)
```typescript
import { assertEquals, assertNotEquals, assertStringIncludes } from "std/testing/asserts.ts";
import { stub, Stub } from "std/testing/mock.ts";
import { handler as searchWineriesHandler } from "../search-wineries/index.ts";
import { handler as getWineryDetailsHandler } from "../get-winery-details/index.ts";
import { handler as sendSocialNotificationHandler } from "../send-social-notification/index.ts";
import { generateGeminiSummary } from "../_shared/gemini.ts";
import type { GeminiEnrichmentResult } from "../_shared/gemini.ts";
import { mockDenoEnv } from "../_shared/testing-helpers.ts";

/**
 * Creates a synthetic HTTP Request targeting an Edge Function handler.
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    authHeader?: string | null;
    body?: Record<string, unknown>;
  }
): Request;

/**
 * Mocks Supabase Auth getUser responses (valid vs invalid JWT).
 */
export function mockSupabaseAuth(validUsers: Record<string, { id: string; email?: string }>): Stub;

/**
 * Intercepts PostgREST visits queries and Gemini API prompts to assert privacy filtering.
 */
export interface PrivacyInspectionHarness {
  capturedVisitsQueryUrl?: string;
  capturedGeminiPromptText?: string;
  restore: () => void;
}
export function setupPrivacyInspectionHarness(options: {
  dbVisits: Array<{ id: string; user_review: string; is_private: boolean; ai_enabled: boolean }>;
}): PrivacyInspectionHarness;
```

---

## 5. Precise Behavioral Logic & Test Case Specifications

### 5.1 Test Suite 1: `search-wineries` Authentication Enforcement
1. **Case 1.1: Missing `Authorization` Header:**
   - Execute `searchWineriesHandler(req)` with `{ query: "test winery" }` and no `Authorization` header.
   - Assert `res.status === 401`.
   - Assert response body contains `{ error: "Unauthorized: Missing authorization header" }` (or contains "Unauthorized").
2. **Case 1.2: Invalid Bearer Token:**
   - Execute `searchWineriesHandler(req)` with `Authorization: Bearer invalid-or-expired-token`.
   - Assert `res.status === 401`.
   - Assert response body contains `{ error: "Unauthorized: Invalid or expired token" }`.

### 5.2 Test Suite 2: `get-winery-details` Authentication Enforcement
1. **Case 2.1: Missing `Authorization` Header:**
   - Execute `getWineryDetailsHandler(req)` with `{ placeId: "ChIJtest" }` and no `Authorization` header.
   - Assert `res.status === 401`.
   - Assert response body contains error indicating unauthorized request.
2. **Case 2.2: Invalid Bearer Token:**
   - Execute `getWineryDetailsHandler(req)` with `Authorization: Bearer invalid-or-expired-token`.
   - Assert `res.status === 401`.

### 5.3 Test Suite 3: `get-winery-details` Review Privacy & AI Opt-In Lockdown
1. **Case 3.1: PostgREST Visits Query Parameters:**
   - Intercept fetch calls to `${SUPABASE_URL}/rest/v1/visits`.
   - Assert the requested URL contains `is_private=eq.false` to verify unapproved private notes are filtered at the database seam.
   - Assert the query checks `profiles.ai_enabled=eq.true` (or joins `profiles!inner` with `ai_enabled=eq.true`).
2. **Case 3.2: Exclusion of Private & Non-AI Notes from Gemini Prompt:**
   - Seed database mock with three reviews for a winery:
     - Review A: `is_private = false, ai_enabled = true, user_review = "Public opted-in review: excellent dry riesling"`
     - Review B: `is_private = true, ai_enabled = true, user_review = "Secret private note: bad cork"`
     - Review C: `is_private = false, ai_enabled = false, user_review = "User opted out of AI: nice patio"`
   - Intercept fetch to `generativelanguage.googleapis.com`.
   - Assert prompt `parts[0].text` includes Review A (`"Public opted-in review: excellent dry riesling"`).
   - Assert prompt `parts[0].text` does NOT include Review B (`"Secret private note: bad cork"`).
   - Assert prompt `parts[0].text` does NOT include Review C (`"User opted out of AI: nice patio"`).

### 5.4 Test Suite 4: `generateSmartFallback` Sanitization, Global Scope & Freshness Guard
1. **Case 4.1: Prohibition of User Review Snippet Copying:**
   - Provide user review: `[{ user_review: "The tasting room had terrible loud techno music." }]`.
   - Trigger fallback enrichment (simulate Gemini API failure).
   - Assert fallback `generative_summary.overview.text` does NOT contain `"Guests frequently note:"`.
   - Assert fallback `generative_summary.overview.text` does NOT copy the user review snippet verbatim into public catalog text.
2. **Case 4.2: Global Winery Scope Alignment ([ADR-0004](../../../docs/adr/0004-global-winery-scope-and-unrestricted-user-geolocation.md)):**
   - Invoke fallback enrichment for:
     - Winery: `"Château Margaux"`
     - Address: `"Margaux, 33460, France"`
   - Assert `generative_summary.overview.text` does NOT contain `"Finger Lakes"`.
   - Assert `vibe_tags` does NOT contain `"Finger Lakes Wine"`.
   - Assert `varietals` descriptions do NOT refer to `"Finger Lakes"`.
3. **Case 4.3: Explicit Error Indicator on Fallback:**
   - Invoke fallback enrichment.
   - Assert returned `GeminiEnrichmentResult` contains `error` (e.g. `typeof result.error === 'string'` and `result.error.length > 0`) or `is_fallback === true`.
   - In `get-winery-details`, assert that when `error` is present or live enrichment fails, `last_enriched_at` is NOT updated (evaluating to null or preserved previous timestamp).

### 5.5 Test Suite 5: `send-social-notification` Webhook Authorization Enforcement
1. **Case 5.1: Missing `Authorization` Header:**
   - Execute `sendSocialNotificationHandler(req)` with valid payload `{ record: { id: "1", user_id: "user-1", privacy_level: "public" } }` and no `Authorization` header.
   - Assert `res.status === 401`.
   - Assert response body contains unauthorized error.
2. **Case 5.2: Invalid Bearer Secret:**
   - Execute `sendSocialNotificationHandler(req)` with `Authorization: Bearer wrong-secret-token`.
   - Assert `res.status === 401`.

---

## 6. Execution Verification Protocol

Perform empirical verification using the Deno test runner:

### 6.1 Execute Edge Function Tests Locally
Execute the existing Deno test runner command defined in `package.json` line 30:
```bash
npm run test:functions
```
*Full Command Invocation:*
```bash
deno test --allow-all --config supabase/functions/deno.json supabase/functions/
```

### 6.2 Expected TDD Red Failure Mode
The test run must fail (non-zero exit code) specifically in `supabase/functions/tests/security-privacy.test.ts` with the following distinct failure signatures:
1. `search-wineries`: `AssertionError: Values are not equal: 200 !== 401` (handler accepts unauthenticated requests).
2. `get-winery-details`: `AssertionError: Values are not equal: 200 !== 401` (handler accepts unauthenticated requests).
3. `get-winery-details` privacy filter: `AssertionError: URL does not include "is_private=eq.false"` and `AssertionError: Prompt includes private review text "Secret private note: bad cork"`.
4. `generateSmartFallback`:
   - `AssertionError: Summary text includes forbidden snippet "Guests frequently note:"`.
   - `AssertionError: Summary text includes "Finger Lakes" for French winery`.
   - `AssertionError: Expected error indicator on fallback result, but received undefined`.
5. `send-social-notification`: `AssertionError: Values are not equal: 200 !== 401` (handler accepts unauthenticated webhook requests).

All existing baseline tests (`tests/webhook-url.test.ts`, `search-wineries/index.test.ts`, `get-winery-details/index.test.ts`, `send-social-notification/index.test.ts`) must continue to pass without regression.

---

## 7. Post-Execution Protocol & Git Notes

### 7.1 Git Commit Convention
Stage strictly the new test file:
```bash
git add supabase/functions/tests/security-privacy.test.ts
git commit -m "test(functions): write failing edge function security and privacy tests"
```

### 7.2 Git Notes Command
```bash
git notes add -m "Task: Write failing Edge Function security and privacy tests (TDD Red phase)
Summary: Authored comprehensive Deno test suite in supabase/functions/tests/security-privacy.test.ts asserting HTTP 401 Unauthorized on unauthenticated search-wineries, get-winery-details, and send-social-notification, private/non-AI-opted review isolation in get-winery-details, and review snippet sanitization, global ADR-0004 alignment, and error indicator return in generateSmartFallback.
Files: supabase/functions/tests/security-privacy.test.ts
Rationale: Establishes authoritative failing test harness (TDD Red phase) for Phase 8 Edge Function authentication and privacy lockdown adhering to ADR-0004, ADR-0007, and ADR-0010 before implementing safeguards."
```
