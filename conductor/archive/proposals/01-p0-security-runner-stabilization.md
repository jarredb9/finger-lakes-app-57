# Track Proposal: P0 Security Hotfixes, Production Safety & Test Runner Stabilization

## Track Metadata
- **Proposed Track ID**: `p0-security-runner-stabilization_20260901`
- **Track Name**: P0 Security Hotfixes, Production Safety & Test Runner Stabilization
- **Track Type**: `refactor`
- **Target Milestone**: [v3.6.0 - Architectural Recovery & Test Reliability](https://github.com/jarredb9/finger-lakes-app-57/milestone/1)
- **Parent Epic**: [#39 (Sprint 1: Security Hotfixes, Production Safety & Critical Bugs)](https://github.com/jarredb9/finger-lakes-app-57/issues/39)
- **Referenced Issues**: [#35](https://github.com/jarredb9/finger-lakes-app-57/issues/35), [#36](https://github.com/jarredb9/finger-lakes-app-57/issues/36), [#37](https://github.com/jarredb9/finger-lakes-app-57/issues/37), [#38](https://github.com/jarredb9/finger-lakes-app-57/issues/38)

---

## 1. Overview & Context
An exhaustive technical debt audit conducted on September 1, 2026 revealed several critical vulnerabilities and runner hazards that threaten production data integrity, security boundaries, and CI test execution:
1. Publicly callable endpoints and database RPCs allow unauthenticated actors to bypass authentication and mutate database records.
2. Incomplete middleware routing in `proxy.ts` drops authentication tokens during redirects, blocks legal compliance pages, and serves HTML login pages to Service Worker chunk loaders.
3. Unit test execution (`npm test`) performs live destructive mutations against reachable databases, while E2E runners crash if optional cloud variables are missing.
4. An error handler in `tripStore.ts` enqueues empty `{}` mutations into IndexedDB, creating background sync deadlocks.

This track serves as **Sprint 1** of Milestone v3.6.0, establishing a hardened security baseline and deterministic test foundation before deeper state and UI refactorings begin.

---

## 2. Guardrails & Operational Constraints (AGENTS.md)
- **Production Database Safety**: Never execute migrations or mutations against the remote database (`jfsxclrdxmvftxacjuqf`). All migrations must be applied and tested locally via `npm run db:*`.
- **Expand-and-Contract Migrations**: Schema alterations must not break live running application instances.
- **Middleware Rule**: `proxy.ts` is the sole active middleware entrypoint (`middleware.ts` is not used).
- **Test Isolation**: Unit tests must never require a running database container or perform un-mocked remote mutations.

---

## 3. Detailed Technical Requirements

### 3.1 Backend & Database Security
- **[BE-01] Secure `/api/auth/confirm-user`**:
  - *Location*: [`app/api/auth/confirm-user/route.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/app/api/auth/confirm-user/route.ts)
  - *Problem*: The route uses `SUPABASE_SERVICE_ROLE_KEY` to confirm any user without authentication.
  - *Remediation*: Disable endpoint in production (`return NextResponse.json({ error: 'Endpoint disabled' }, { status: 404 })`) or restrict to local testing with shared secret authentication.
- **[BE-02] Drop Permissive RLS UPDATE on `public.wineries`**:
  - *Location*: [`supabase/migrations/20260601141336_places-api-migration-enrichment.sql`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/migrations/20260601141336_places-api-migration-enrichment.sql)
  - *Problem*: Policy `"Authenticated users can update wineries"` has `USING (true)`, allowing any logged-in user to mutate any winery record.
  - *Remediation*: Create migration to drop this policy and restrict update capabilities to `service_role` or security-definer RPCs.
- **[BE-03] Revoke `PUBLIC` Execution on `bulk_upsert_wineries` RPC**:
  - *Location*: [`supabase/migrations/20260901000000_fix_winery_ratings_and_staleness.sql`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/migrations/20260901000000_fix_winery_ratings_and_staleness.sql)
  - *Problem*: Stored procedure is declared `SECURITY DEFINER` without revoking default execute privileges from `PUBLIC`.
  - *Remediation*: Execute `REVOKE ALL ON FUNCTION public.bulk_upsert_wineries(jsonb[]) FROM PUBLIC;` and `GRANT EXECUTE ... TO service_role;`.
- **[BE-04] Explicit `search_path` on Trigger Functions**:
  - *Location*: [`supabase/migrations/20260609161719_configure_social_notification_webhook.sql`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/supabase/migrations/20260609161719_configure_social_notification_webhook.sql)
  - *Problem*: `handle_activity_ledger_notification` lacks `SET search_path = public, vault, extensions, pg_temp`, creating privilege escalation risk.
  - *Remediation*: Add migration to set explicit `search_path`.

### 3.2 Routing & Middleware Integrity (`proxy.ts`)
- **[BE-05] Preserve Auth Cookies on Middleware Redirects**:
  - *Location*: [`proxy.ts#L37-L40`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/proxy.ts#L37-L40)
  - *Problem*: `updateSession(request)` mutates cookies on response, but `NextResponse.redirect(url)` drops accumulated `Set-Cookie` headers.
  - *Remediation*: Copy cookies from `response.cookies.getAll()` to `redirectResponse.cookies` before returning.
- **[BE-11] Whitelist Compliance Routes**:
  - *Location*: [`proxy.ts#L29-L38`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/proxy.ts#L29-L38)
  - *Problem*: Unauthenticated users attempting to view `/privacy` or `/terms` are redirected to `/login`.
  - *Remediation*: Add `/privacy` and `/terms` to `publicRoutes` array.
- **[FE-05] Whitelist Service Worker Runtime Chunks**:
  - *Location*: [`proxy.ts#L4`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/proxy.ts#L4), [`proxy.ts#L57`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/proxy.ts#L57)
  - *Problem*: Serwist chunks (`/workbox-*.js`, `/worker-*.js`) get redirected to `/login`, crashing the service worker with syntax errors.
  - *Remediation*: Add prefix matcher to bypass middleware auth checks for `/workbox-` and `/worker-` assets.

### 3.3 State & Sync Corruption Fix
- **[ST-07] Eliminate Phantom `{}` Mutation in `tripStore.ts`**:
  - *Location*: [`lib/stores/tripStore.ts#L967`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/tripStore.ts#L967)
  - *Problem*: Multi-trip catch block invokes `handleSyncError(error, 'log_visit', user?.id, {})`, pushing an empty object mutation into IndexedDB.
  - *Remediation*: Replace with a passive `isNetworkError(error)` check and enqueue valid payload attributes only.

### 3.4 Test Suite & Runner Hardening
- **[QA-02] Segregate Live Database Integration Tests**:
  - *Location*: [`lib/services/__tests__/supabase-rpc-idempotency.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/__tests__/supabase-rpc-idempotency.test.ts), [`supabase-rpc.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/__tests__/supabase-rpc.test.ts), [`privacy-refactor.test.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/__tests__/privacy-refactor.test.ts)
  - *Problem*: `npm test` executes unmocked DML mutations directly against accessible database instances using the service role key.
  - *Remediation*: Rename suites to `*.integration.test.ts`, ignore them in standard `jest.config.mjs`, and introduce `npm run test:integration` target.
- **[QA-11] Lazy Supabase Client Initialization in `e2e/utils.ts`**:
  - *Location*: [`e2e/utils.ts#L25-L31`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/utils.ts#L25-L31)
  - *Problem*: Top-level `createClient()` throws immediately if `NEXT_PUBLIC_SUPABASE_URL` is undefined during test file discovery.
  - *Remediation*: Encapsulate client initialization in a lazy getter function `getAdminClient()`.
- **[QA-12] Remove Legacy `node-fetch@2` Polyfill**:
  - *Location*: [`jest.setup.ts#L20-L24`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/jest.setup.ts#L20-L24)
  - *Problem*: Overrides Node 24 native fetch with CommonJS `node-fetch@2`, causing `Headers` and `Request` type collisions.
  - *Remediation*: Remove polyfill and leverage Node 24 global `fetch`.

---

## 4. Acceptance Criteria
- [ ] Direct `wineries` updates by authenticated non-service-role clients return RLS error 42501.
- [ ] Anonymous calls to `supabase.rpc('bulk_upsert_wineries')` fail with permission denied.
- [ ] `/api/auth/confirm-user` returns 404 in production mode.
- [ ] `npm run db:lint` reports 0 missing `search_path` warnings.
- [ ] `proxy.ts` preserves `Set-Cookie` tokens across redirects and whitelists `/privacy`, `/terms`, `/workbox-*.js`, and `/worker-*.js`.
- [ ] IndexedDB mutation queue never receives empty `{}` payloads from `tripStore.ts`.
- [ ] `npm test` runs to completion in under 60 seconds without requiring a running database container or executing live database mutations.
- [ ] `e2e/utils.ts` does not crash test runners when Supabase environment variables are omitted.

---

## 5. Proposed Phased Implementation Plan

### Phase 1: Database RLS & Security Definer Hardening
- [ ] Task: Write failing database policy tests verifying anonymous/authenticated denial on `wineries` and `bulk_upsert_wineries`
- [ ] Task: Create migration `20260902000000_p0_security_fixes.sql` applying RLS corrections, revoke execute, and trigger `search_path`
- [ ] Task: Verify migration locally with `npm run db:start` and `npm run db:check-types:local`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Database RLS & Security' (Protocol in workflow.md)

### Phase 2: Middleware Routing & Session Continuity
- [ ] Task: Write unit tests for `proxy.ts` cookie propagation, compliance route whitelisting, and Serwist asset pass-through
- [ ] Task: Implement cookie copying, prefix matching, and production guard on `/api/auth/confirm-user`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Middleware Routing & Session Continuity' (Protocol in workflow.md)

### Phase 3: State Sync Bugfix & Test Runner Isolation
- [ ] Task: Write unit test in `lib/stores/__tests__/tripStore.test.ts` reproducing phantom `{}` enqueue on multi-trip failure
- [ ] Task: Fix error handler in `tripStore.ts` to prevent invalid mutations
- [ ] Task: Segregate `*.integration.test.ts`, update `jest.config.mjs`, and add `test:integration` npm script
- [ ] Task: Refactor `e2e/utils.ts` to lazy client getter and remove `node-fetch@2` in `jest.setup.ts`
- [ ] Task: Run full unit test suite `npm test` and verify clean, isolated execution
- [ ] Task: Conductor - User Manual Verification 'Phase 3: State Sync Bugfix & Test Runner Isolation' (Protocol in workflow.md)
