# Specification: Require Caller Authorization and Stop Friend-Graph Disclosure in send-social-notification

**Tracking:** Issue [#150](https://github.com/jarredb9/finger-lakes-app-57/issues/150)  
**Domain Context:** [CONTEXT.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/CONTEXT.md)  
**Type:** Security & Bug Fix  

## 1. Overview
A security audit of `supabase/functions/send-social-notification/index.ts` and Edge Function configuration identified four remaining security and privacy gaps:
1. **Non-Constant-Time & Incomplete Secret Verification:** While `send-social-notification` checks the `Authorization: Bearer <token>` header against `INTERNAL_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`, it uses a non-constant-time `===` string comparison (vulnerable to timing side-channels) and does not recognize `WEBHOOK_SECRET`.
2. **Untrusted Event Payload & Activity Spoofing:** The handler accepts `payload.record.user_id` and `payload.record.privacy_level` directly from the request body without verifying that `payload.record.id` exists in `public.activity_ledger`. A caller possessing a valid token (or any payload replay) can bypass ledger integrity or spoof notifications with forged `user_id`/`privacy_level` values.
3. **Friend-Graph Disclosure (Privacy Breach):** All success responses return `notified: recipientIds` (an array of internal follower and mutual-friend user UUIDs) in the HTTP JSON body.
4. **Missing Edge Function Gateway Configuration:** `[functions.send-social-notification]` is absent from `supabase/config.toml` and `supabase/config.ci.toml`, leaving gateway JWT enforcement implicit rather than explicitly configured.

## 2. Architectural & Security Invariants
- **Constant-Time Secret Comparison:** All Bearer token comparisons against `INTERNAL_WEBHOOK_SECRET`, `WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` must execute in constant time (e.g., via UTF-8 byte encoding, SHA-256 digesting, and `crypto.subtle.timingSafeEqual` across all configured non-empty secrets without early-return length leaks).
- **Authoritative Ledger Source of Truth:** `public.activity_ledger` is the sole authority for activity existence, `user_id`, and `privacy_level`. Never trust caller-supplied `record.user_id` or `record.privacy_level` without verifying against the persisted `activity_ledger` row.
- **Zero Friend-Graph Disclosure:** Never serialize `recipientIds` or any internal follower/friend UUIDs into HTTP responses.
- **Internal Database Webhook Compatibility:** Must continue working seamlessly with the `handle_activity_ledger_notification()` PostgreSQL trigger (which dispatches `pg_net.http_post` using `service_role_key` as `Bearer` token and JSONB `record` payload).

## 3. Functional Requirements

### 3.1 Constant-Time Bearer Authorization
- Inspect `Authorization` header (preserving `OPTIONS` CORS preflight handling).
- Require `Authorization: Bearer <token>` with a non-empty token; return `401 Unauthorized` (`{ error: "Unauthorized: ..." }`) when missing or malformed.
- Compare `<token>` using a constant-time comparison helper (`supabase/functions/_shared/auth.ts`) against every configured non-empty secret among:
  - `INTERNAL_WEBHOOK_SECRET`
  - `WEBHOOK_SECRET`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Return `401 Unauthorized` if no secret matches or if no secrets are configured.

### 3.2 Authoritative `public.activity_ledger` Verification
- Require `payload.record.id` (non-empty string); return `400 Bad Request` if missing or invalid.
- Using the service-role Supabase client, query `public.activity_ledger` by `id`:
  - `.select('id, user_id, privacy_level').eq('id', activityId).maybeSingle()`
- If the query fails with an unexpected DB error, return an error response (`400`/`500`) without proceeding; if no matching row exists in `public.activity_ledger`, reject with `404 Not Found` before performing any `profiles`, `follows`, or `friends` lookups.
- If `payload.record.user_id` is supplied and differs from the authoritative `activity_ledger.user_id`, reject with `400 Bad Request` (mismatch / spoofed payload).
- Use the authoritative `activity_ledger.user_id` and `activity_ledger.privacy_level` for all subsequent privacy checks (`privacy_level === 'private'`) and recipient queries.

### 3.3 Sanitized HTTP Response Body
- Remove the `notified` array (`recipientIds`) from all response branches in `send-social-notification/index.ts`:
  - When skipped (`activity.privacy_level === 'private'` or `profile.privacy_level === 'private'`): return HTTP `200` with `{ success: true, count: 0, message: '...' }`.
  - When notifications are dispatched: return HTTP `200` with `{ success: true, count: recipientIds.length }`.
- Ensure response JSON never contains `notified` or any recipient UUIDs.

### 3.4 Supabase Edge Configuration
- Add `[functions.send-social-notification]` with `verify_jwt = false` to `supabase/config.toml` and `supabase/config.ci.toml`, explicitly documenting that authorization is enforced in-handler via constant-time Bearer validation so both JWT `SUPABASE_SERVICE_ROLE_KEY` and opaque `WEBHOOK_SECRET`/`INTERNAL_WEBHOOK_SECRET` tokens pass the gateway.

### 3.5 Automated Test Coverage
- Update `supabase/functions/send-social-notification/index.test.ts` to:
  - Mock `public.activity_ledger` lookups in `mockFetchForSocial`.
  - Assert `data.count` (and absence of `data.notified`) across private activity, private profile, and multi-recipient notification scenarios.
  - Cover missing `record.id` (`400`), non-existent `activity_ledger` row (`404`), mismatched `record.user_id` (`400`), and authoritative DB `privacy_level`/`user_id` enforcement.
- Expand `supabase/functions/tests/security-privacy.test.ts` to:
  - Verify constant-time Bearer acceptance for `INTERNAL_WEBHOOK_SECRET`, `WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY`, and `401` rejection for missing/invalid/partial/prefix-matching tokens.
  - Verify spoofed `record.user_id` / non-existent `record.id` is rejected without querying `profiles`, `follows`, or `friends`.
  - Verify response body contains `count` and omits `notified` / any recipient UUIDs.

## 4. Non-Functional Requirements
- Constant-time secret comparison must avoid timing leaks across differing lengths (e.g., compare fixed-length SHA-256 digests with `crypto.subtle.timingSafeEqual`).
- All Deno Edge Function tests (`npm run test:functions`) must pass cleanly without network access.

## 5. Acceptance Criteria
- [ ] Unauthenticated requests and invalid Bearer tokens (including partial/prefix matches) return `401 Unauthorized`.
- [ ] Valid `INTERNAL_WEBHOOK_SECRET`, `WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` Bearer tokens are accepted via constant-time comparison.
- [ ] Requests with missing `record.id` return `400`, non-existent `activity_ledger` IDs return `404`, and `user_id` mismatches return `400` without querying `profiles`, `follows`, or `friends`.
- [ ] Authoritative `activity_ledger.user_id` and `activity_ledger.privacy_level` govern private-skip and recipient resolution.
- [ ] HTTP responses return `{ success: true, count }` (and `message` when skipped) and never include `notified` or recipient UUIDs.
- [ ] `supabase/config.toml` and `supabase/config.ci.toml` declare `[functions.send-social-notification]` with `verify_jwt = false`.
- [ ] `npm run test:functions` passes all unit and security-privacy tests.

## 6. Out of Scope
- Replacing console-based notification dispatch with external push/email providers.
- Modifying `handle_activity_ledger_notification()` SQL trigger logic (already hardened in migration `20261104120000_harden_storage_and_webhooks.sql`).
- Frontend UI changes.
