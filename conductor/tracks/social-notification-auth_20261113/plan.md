# Implementation Plan: Require Caller Authorization and Stop Friend-Graph Disclosure in send-social-notification

**Tracking:** Issue [#150](https://github.com/jarredb9/finger-lakes-app-57/issues/150)  
**Specification Reference:** [spec.md](./spec.md)  

## Phase 1: Edge Function Security, Ledger Verification & Privacy Lockdown (Strict TDD)

- [ ] Task: Write failing Deno security and privacy tests for send-social-notification (TDD Red phase)
    - [ ] Expand `supabase/functions/tests/security-privacy.test.ts` to assert Bearer token acceptance for `WEBHOOK_SECRET`, `INTERNAL_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY`, plus `401 Unauthorized` rejection on missing, malformed, or partial/prefix-mismatch tokens.
    - [ ] Add Deno unit tests (in `supabase/functions/tests/security-privacy.test.ts` or `supabase/functions/_shared/auth.test.ts`) verifying constant-time secret comparison behavior across differing token lengths.
    - [ ] Add tests in `supabase/functions/tests/security-privacy.test.ts` and `supabase/functions/send-social-notification/index.test.ts` asserting `400` on missing `payload.record.id`, `404` when `activity_ledger` has no matching row (verifying `profiles`, `follows`, and `friends` are never queried), `400` on `record.user_id` mismatch against the ledger row, and authoritative DB `user_id`/`privacy_level` enforcement.
    - [ ] Update `supabase/functions/send-social-notification/index.test.ts` and add assertions in `supabase/functions/tests/security-privacy.test.ts` verifying responses return `{ success: true, count }` (and `{ success: true, count: 0, message }` when skipped) and strictly omit `notified` and all recipient UUIDs.
    - [ ] Execute `npm run test:functions` and confirm expected test failures (Red).
- [ ] Task: Implement constant-time auth, activity_ledger verification, and sanitized responses in send-social-notification (TDD Green phase)
    - [ ] Create `supabase/functions/_shared/auth.ts` with a constant-time Bearer secret verification helper (hashing inputs to fixed-length SHA-256 digests and comparing with `crypto.subtle.timingSafeEqual` across all configured secrets without early-return length leaks).
    - [ ] Update `supabase/functions/send-social-notification/index.ts` to validate `Authorization: Bearer <token>` against `INTERNAL_WEBHOOK_SECRET`, `WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` via the constant-time helper, returning `401` on failure.
    - [ ] Update `supabase/functions/send-social-notification/index.ts` to require `record.id` (`400`), query `public.activity_ledger` for `(id, user_id, privacy_level)` (`404` if missing), reject `record.user_id` mismatches (`400`), and derive `actorId` and `activityPrivacy` strictly from the verified ledger row.
    - [ ] Remove `notified: recipientIds` from all response branches in `supabase/functions/send-social-notification/index.ts`, returning `{ success: true, count: recipientIds.length }` (and `{ success: true, count: 0, message }` when skipped).
    - [ ] Update `mockFetchForSocial` in `supabase/functions/send-social-notification/index.test.ts` to stub `/rest/v1/activity_ledger` for valid test scenarios.
    - [ ] Execute `npm run test:functions`, `npm run lint`, and `npm run type-check` and confirm all checks pass (Green).
- [ ] Task: Configure Edge Function gateway settings in Supabase config [exempt: infra]
    - [ ] Add `[functions.send-social-notification]` with `verify_jwt = false` (and inline comment noting in-handler constant-time Bearer validation for both JWT `service_role_key` and opaque webhook secrets) to `supabase/config.toml` and `supabase/config.ci.toml`.
    - [ ] Verify configuration syntax and run `npm run lint` and `npm run test:functions`.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Edge Function Security, Ledger Verification & Privacy Lockdown' (Protocol in workflow.md)
