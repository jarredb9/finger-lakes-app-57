# Review Report: social-notification-auth_20261113 (Phase 1)

## Summary
Phase 1 implements constant-time Bearer token validation, authoritative `public.activity_ledger` verification, sanitized notification responses, and explicit gateway configuration with comprehensive Deno tests, though minor error-handling bugs and TypeScript style-guide deviations remain to address.

## Verification Checks
- [x] **Plan Compliance**: Yes - All Phase 1 tasks (`3d421e9`, `80cc4ec`, `50d691d`, checkpoint `7293ad8b`) implement the constant-time auth helper, `activity_ledger` verification, sanitized `{ success, count }` responses, and `verify_jwt = false` gateway settings in `spec.md` and `plan.md`.
- [ ] **Style Compliance**: Fail - Unjustified `as` type assertions (`auth.ts`, `auth.test.ts`, `send-social-notification/index.ts`), an underscore-prefixed catch identifier (`_e`), and double-quoted string literals violate `conductor/code_styleguides/typescript.md` (`High` per review protocol).
- [x] **New Tests**: Yes - Added `supabase/functions/_shared/auth.test.ts` (6 tests) and expanded `supabase/functions/send-social-notification/index.test.ts` and `supabase/functions/tests/security-privacy.test.ts`.
- [x] **Test Coverage**: Partial - Auth, ledger verification (`400`/`404`/`500`), spoofing rejection, and response sanitization are covered; malformed JSON, non-string/whitespace `record.id`, `profiles`/`follows`/`friends` DB error paths, and actor self-exclusion lack dedicated tests.
- [x] **Test Results**: Passed - `npm run test:functions` passed all 57 Deno tests (`0 failed`, 714ms); `npm run lint` (0 errors, 445 warnings), `npm run type-check`, `deno check`, and `tomllib` config parsing exited 0 (`deno lint` reported only 1 pre-existing `no-import-prefix` error at `send-social-notification/index.ts:1`).

## Findings

### [High] Unjustified Type Assertions and Underscore-Prefixed Identifier Violate TypeScript Style Guide
- **File**: `supabase/functions/send-social-notification/index.ts` (Lines L67-L68, L99), `supabase/functions/_shared/auth.ts` (Line L20), `supabase/functions/_shared/auth.test.ts` (Line L13)
- **Context**: `conductor/code_styleguides/typescript.md` forbids `_`-prefixed identifiers (`catch (_e)`), forbids unjustified `as` type assertions (`ledgerRow as ActivityLedgerRecord | null`, `crypto.subtle as SubtleCryptoWithTimingSafe`, `mod as SharedAuthModule`), and specifies single-quoted string literals (`'`). Using a runtime type guard for `ledgerRow` also safely validates DB payload fields instead of trusting an unchecked cast, and parameterless `catch {` eliminates `_e`.
- **Suggestion**:
```diff
--- a/supabase/functions/send-social-notification/index.ts
+++ b/supabase/functions/send-social-notification/index.ts
@@ -64,7 +64,7 @@ export const handler = async (req: Request): Promise<Response> => {
     let payload: WebhookPayload;
     try {
       payload = await req.json();
-    } catch (_e) {
+    } catch {
       return jsonResponse({ error: "Invalid JSON payload" }, 400);
     }
...
-    const ledgerActivity = ledgerRow as ActivityLedgerRecord | null;
-    if (!ledgerActivity) {
+    if (!ledgerRow) {
       return jsonResponse({ error: "Activity not found" }, 404);
     }
+    if (
+      typeof ledgerRow.id !== "string" ||
+      typeof ledgerRow.user_id !== "string" ||
+      !ledgerRow.user_id ||
+      typeof ledgerRow.privacy_level !== "string"
+    ) {
+      return jsonResponse({ error: "Malformed activity_ledger record" }, 500);
+    }
+    const ledgerActivity: ActivityLedgerRecord = ledgerRow;
```
```diff
--- a/supabase/functions/_shared/auth.ts
+++ b/supabase/functions/_shared/auth.ts
@@ -1,8 +1,4 @@
 const textEncoder = new TextEncoder();
 
-interface SubtleCryptoWithTimingSafe extends SubtleCrypto {
-  timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean;
-}
+function hasTimingSafeEqual(
+  subtle: SubtleCrypto,
+): subtle is SubtleCrypto & { timingSafeEqual: (a: BufferSource, b: BufferSource) => boolean } {
+  return (
+    "timingSafeEqual" in subtle &&
+    typeof Reflect.get(subtle, "timingSafeEqual") === "function"
+  );
+}
...
-  const subtle = crypto.subtle as SubtleCryptoWithTimingSafe;
-  if (typeof subtle.timingSafeEqual === "function") {
-    return subtle.timingSafeEqual(digestA, digestB);
+  if (hasTimingSafeEqual(crypto.subtle)) {
+    return crypto.subtle.timingSafeEqual(digestA, digestB);
   }
```
```diff
--- a/supabase/functions/_shared/auth.test.ts
+++ b/supabase/functions/_shared/auth.test.ts
@@ -1,16 +1,5 @@
 import { assertEquals } from "std/testing/asserts.ts";
+import { constantTimeEqual, verifyBearerSecret } from "./auth.ts";
 
-export interface SharedAuthModule {
-  constantTimeEqual: (a: string, b: string) => Promise<boolean>;
-  verifyBearerSecret: (
-    authHeader: string | null,
-    candidateSecrets: ReadonlyArray<string | undefined | null>,
-  ) => Promise<boolean>;
-}
-
-async function loadAuthModule(): Promise<SharedAuthModule> {
-  const mod = await import(new URL("./auth.ts", import.meta.url).href);
-  return mod as SharedAuthModule;
-}
```

### [Medium] Downstream PostgREST Errors Throw Plain Objects and Return 400 `[object Object]`
- **File**: `supabase/functions/send-social-notification/index.ts` (Lines L81-L84, L159-L178, L214-L217)
- **Context**: `followersError`, `friends1Res.error`, and `friends2Res.error` are Supabase `PostgrestError` plain objects (`{ message, details, hint, code }`), not `Error` instances. Throwing them into the outer `catch (err)` block evaluates `err instanceof Error` as `false`, serializing `error` as `"[object Object]"` with HTTP `400 Bad Request` instead of HTTP `500 Internal Server Error` with the database error message. Additionally, if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is unset when a caller authenticates via `WEBHOOK_SECRET` or `INTERNAL_WEBHOOK_SECRET`, `createClient()` throws an `Error` that is misclassified as HTTP `400` instead of `500`.
- **Suggestion**:
```diff
--- a/supabase/functions/send-social-notification/index.ts
+++ b/supabase/functions/send-social-notification/index.ts
@@ -78,10 +78,14 @@ export const handler = async (req: Request): Promise<Response> => {
       return jsonResponse({ error: "Missing id in record" }, 400);
     }
 
-    const supabaseClient = createClient(
-      Deno.env.get("SUPABASE_URL") ?? "",
-      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
-    );
+    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
+    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
+    if (!supabaseUrl || !serviceRoleKey) {
+      return jsonResponse({ error: "Server configuration error" }, 500);
+    }
+    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
...
     if (followersError) {
-      throw followersError;
+      return jsonResponse(
+        { error: `Failed to fetch followers: ${followersError.message}` },
+        500,
+      );
     }
...
-    if (friends1Res.error) throw friends1Res.error;
-    if (friends2Res.error) throw friends2Res.error;
+    if (friends1Res.error) {
+      return jsonResponse(
+        { error: `Failed to fetch friends: ${friends1Res.error.message}` },
+        500,
+      );
+    }
+    if (friends2Res.error) {
+      return jsonResponse(
+        { error: `Failed to fetch friends: ${friends2Res.error.message}` },
+        500,
+      );
+    }
...
   } catch (err) {
-    const error = err instanceof Error ? err : new Error(String(err));
-    return jsonResponse({ error: error.message }, 400);
+    const message = err instanceof Error
+      ? err.message
+      : typeof err === "object" && err !== null && "message" in err
+      ? String(Reflect.get(err, "message"))
+      : String(err);
+    return jsonResponse({ error: message }, 500);
   }
```

### [Medium] Missing Unit Tests for Invalid JSON/Non-String IDs, Downstream DB Failures, and Self-Exclusion
- **File**: `supabase/functions/send-social-notification/index.test.ts` (Lines L248-L280, L319-L356)
- **Context**: `index.test.ts` covers `activityLedgerError` and missing `record.id`, but has no tests for: (1) malformed JSON request bodies, array `record` payloads (`{ record: [] }`), whitespace-only `record.id` (`"   "`), or non-string `record.id` (`123`); (2) `profiles`, `follows`, and `friends` query failure responses; or (3) filtering `actorId` out of `recipientSet` when present in `follows` or `friends`.
- **Suggestion**:
```diff
--- a/supabase/functions/send-social-notification/index.test.ts
+++ b/supabase/functions/send-social-notification/index.test.ts
@@ -260,6 +260,9 @@ Deno.test("send-social-notification - returns 400 when record.id is missing and
       { record: { id: "" } },
+      { record: { id: "   " } },
+      { record: { id: 123 } },
+      { record: [] },
       { record: { user_id: "user-1", privacy_level: "public" } },
     ]
```
Add dedicated Deno tests in `supabase/functions/send-social-notification/index.test.ts` for invalid JSON bodies (`400`), `follows`/`friends` DB error responses (`500`), and actor self-exclusion.

### [Low] Non-UUID `record.id` Triggers PostgREST `22P02` and Returns 500 Instead of 400
- **File**: `supabase/functions/send-social-notification/index.ts` (Lines L86-L97)
- **Context**: `public.activity_ledger.id` is defined as type `uuid`. Querying `.eq("id", activityId)` with a malformed non-UUID string causes PostgreSQL to raise SQLSTATE `22P02` (`invalid input syntax for type uuid`), which lines 92-97 return as HTTP `500` instead of `400 Bad Request`. Mapping `ledgerError.code === "22P02"` to `400` handles malformed IDs cleanly without breaking unit tests that use non-UUID stub IDs like `"activity-1"`.
- **Suggestion**:
```diff
--- a/supabase/functions/send-social-notification/index.ts
+++ b/supabase/functions/send-social-notification/index.ts
@@ -90,9 +90,10 @@ export const handler = async (req: Request): Promise<Response> => {
       .maybeSingle();
 
     if (ledgerError) {
+      const status = ledgerError.code === "22P02" ? 400 : 500;
       return jsonResponse(
         { error: `Failed to verify activity: ${ledgerError.message}` },
-        500,
+        status,
       );
     }
```

### [Low] Missing JSDoc on Exported Handler/Interfaces and Semicolon Inconsistency in `index.test.ts`
- **File**: `supabase/functions/send-social-notification/index.ts` (Lines L18-L44), `supabase/functions/send-social-notification/index.test.ts` (Lines L1-L484)
- **Context**: `conductor/workflow.md` requires public functions/interfaces to be documented; `ActivityLedgerRecord`, `SocialNotificationResponse`, `SocialErrorResponse`, and `handler` lack JSDoc comments. In addition, `index.test.ts` omits trailing semicolons while `auth.ts`, `auth.test.ts`, `index.ts`, and `security-privacy.test.ts` terminate statements with semicolons.
- **Suggestion**: Add concise JSDoc comments to exported interfaces and `handler` in `supabase/functions/send-social-notification/index.ts`, and standardize trailing semicolons in `supabase/functions/send-social-notification/index.test.ts`.
