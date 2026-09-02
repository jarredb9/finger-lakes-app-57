# Implementation Plan: P0 Security Hotfixes, Production Safety & Test Runner Stabilization

## Phase 1: Database RLS & Security Definer Hardening [checkpoint: 464dc00]

- [x] Task: Write Failing Tests for Database Policies and Privileges (Red Phase) [47d34e5]
    - [x] Create test cases asserting rejection of direct updates to `public.wineries` by authenticated non-service-role clients
    - [x] Create test cases asserting anonymous and non-service-role execution denial on `bulk_upsert_wineries` RPC
    - [x] Run test cases against local database to confirm failure (Red Phase)
- [x] Task: Implement Database Migration for RLS and Security Definers (Green Phase) [4a46201]
    - [x] Create migration file `supabase/migrations/20260902000000_p0_security_fixes.sql`
    - [x] Drop policy `"Authenticated users can update wineries"` from `public.wineries`
    - [x] Revoke execute privileges on `bulk_upsert_wineries(jsonb[])` from `PUBLIC` and grant to `service_role`
    - [x] Set explicit `search_path = public, vault, extensions, pg_temp` on `handle_activity_ledger_notification`
    - [x] Apply migration locally via `npm run db:start` and verify tests pass (Green Phase)
    - [x] Run `npm run db:lint` and `npm run db:check-types:local` to ensure 0 lint warnings and valid types
- [x] Task: Conductor - User Manual Verification 'Phase 1: Database RLS & Security Definer Hardening' (Protocol in workflow.md)

## Phase 2: Middleware Routing & Route Protection [checkpoint: a4bbce3]

- [x] Task: Write Failing Tests for Middleware and Endpoint Hardening (Red Phase) [0b0bd9c]
    - [x] Write unit tests for `proxy.ts` verifying cookie preservation on redirects
    - [x] Write unit tests verifying `/privacy`, `/terms`, `/workbox-*.js`, and `/worker-*.js` bypass auth redirects
    - [x] Write unit tests for `/api/auth/confirm-user` verifying 404 in production and secret validation in dev
    - [x] Run middleware and route tests to confirm red state
- [x] Task: Implement Middleware Updates and Auth Endpoint Security (Green Phase) [3d217b4]
    - [x] Update `proxy.ts` to copy cookies across redirects using `response.cookies.getAll()`
    - [x] Add `/privacy` and `/terms` to `publicRoutes` in `proxy.ts`
    - [x] Add pattern matching for `/workbox-` and `/worker-` assets in `proxy.ts`
    - [x] Update `app/api/auth/confirm-user/route.ts` with production 404 guard and dev shared-secret validation
    - [x] Re-run tests to confirm all pass (Green Phase)
- [x] Task: Conductor - User Manual Verification 'Phase 2: Middleware Routing & Route Protection' (Protocol in workflow.md)

## Phase 3: State Sync Bugfix & Test Runner Stabilization

- [x] Task: Write Failing Tests for TripStore Error Handling and Test Runners (Red Phase) [01c30e2]
    - [x] Add unit test in `lib/stores/__tests__/tripStore.test.ts` asserting no empty `{}` mutation is queued on multi-trip failure
    - [x] Add unit test verifying `e2e/utils.ts` can be imported without throwing when `NEXT_PUBLIC_SUPABASE_URL` is unset
    - [x] Run unit tests to confirm red state
- [ ] Task: Implement TripStore Fix and Test Runner Hardening (Green Phase)
    - [ ] Fix catch block in `lib/stores/tripStore.ts` to prevent enqueueing empty `{}` mutations and check `isNetworkError`
    - [ ] Segregate live database tests to `*.integration.test.ts` (`supabase-rpc-idempotency.integration.test.ts`, `supabase-rpc.integration.test.ts`, `privacy-refactor.integration.test.ts`)
    - [ ] Update `jest.config.mjs` to exclude `*.integration.test.ts` and add `npm run test:integration` script to `package.json`
    - [ ] Convert `e2e/utils.ts` to use lazy `getAdminClient()` getter
    - [ ] Remove legacy CommonJS `node-fetch@2` polyfill from `jest.setup.ts`
    - [ ] Run `CI=true npm test` to verify fast offline execution in < 60s
- [ ] Task: Conductor - User Manual Verification 'Phase 3: State Sync Bugfix & Test Runner Stabilization' (Protocol in workflow.md)
