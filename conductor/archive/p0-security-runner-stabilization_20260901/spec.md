# Specification: P0 Security Hotfixes, Production Safety & Test Runner Stabilization

## 1. Overview
A critical technical debt audit conducted on September 1, 2026 identified high-severity vulnerabilities, routing flaws, and test runner hazards that threaten data integrity, authentication boundaries, and CI determinism:
1. Publicly accessible endpoints and database RPCs allow unauthenticated actors to bypass authentication or mutate database records.
2. Incomplete middleware routing in `proxy.ts` drops authentication tokens during redirects, blocks legal compliance pages, and serves HTML login pages to Service Worker chunk loaders.
3. Unit test execution (`npm test`) performs live destructive mutations against reachable databases, while E2E runners crash if optional cloud variables are missing.
4. An error handler in `tripStore.ts` enqueues empty `{}` mutations into IndexedDB, creating background sync deadlocks.

This track establishes a hardened security baseline, robust session routing, clean offline error handling, and isolated, deterministic test runners.

---

## 2. Functional Requirements

### 2.1 Backend & Database Security Hardening
- **[BE-01] Secure `/api/auth/confirm-user`**:
  - In production (`process.env.NODE_ENV === 'production'`), immediately return 404 (`{ error: 'Endpoint disabled' }`).
  - In development/test environments, require a valid internal shared secret header (`x-internal-secret` or configured token) before confirming users.
- **[BE-02] Drop Permissive RLS UPDATE on `public.wineries`**:
  - Create migration `20260902000000_p0_security_fixes.sql` to drop `"Authenticated users can update wineries"` (`USING (true)`).
  - Restrict winery updates strictly to `service_role` and trusted security-definer RPCs.
- **[BE-03] Revoke `PUBLIC` Execution on `bulk_upsert_wineries` RPC**:
  - In the migration, revoke default `PUBLIC` privileges: `REVOKE ALL ON FUNCTION public.bulk_upsert_wineries(jsonb[]) FROM PUBLIC;`.
  - Explicitly grant execute privilege only to `service_role`.
- **[BE-04] Explicit `search_path` on Trigger Functions**:
  - Set explicit `search_path = public, vault, extensions, pg_temp` on `handle_activity_ledger_notification` to eliminate schema poisoning and privilege escalation risks.

### 2.2 Routing & Middleware Integrity (`proxy.ts`)
- **[BE-05] Preserve Auth Cookies on Middleware Redirects**:
  - When `proxy.ts` constructs redirects via `NextResponse.redirect(url)`, copy accumulated `Set-Cookie` headers from the Supabase session response into `redirectResponse.cookies` to prevent session loss.
- **[BE-11] Whitelist Compliance Routes**:
  - Add `/privacy` and `/terms` to `publicRoutes` so unauthenticated users and crawlers can view legal pages without being redirected to `/login`.
- **[FE-05] Whitelist Service Worker Runtime Chunks**:
  - Add prefix matching to bypass middleware auth redirects for Serwist runtime chunks (`/workbox-*` and `/worker-*`), preventing syntax crashes in the service worker.

### 2.3 State & Sync Corruption Fix
- **[ST-07] Eliminate Phantom `{}` Mutation in `tripStore.ts`**:
  - In `lib/stores/tripStore.ts#L967`, remove `handleSyncError(error, 'log_visit', user?.id, {})` that pushes empty payloads into IndexedDB.
  - Guard synchronization errors with `isNetworkError(error)` and ensure mutations are only enqueued when valid payload data exists.

### 2.4 Test Suite & Runner Hardening
- **[QA-02] Segregate Live Database Integration Tests**:
  - Rename `supabase-rpc-idempotency.test.ts`, `supabase-rpc.test.ts`, and `privacy-refactor.test.ts` to `*.integration.test.ts`.
  - Configure `jest.config.mjs` to ignore `*.integration.test.ts` during standard `npm test`.
  - Introduce `npm run test:integration` target to run integration tests against a running local Supabase stack.
- **[QA-11] Lazy Supabase Client Initialization in `e2e/utils.ts`**:
  - Refactor top-level `createClient()` calls to a lazy getter `getAdminClient()` so importing test utilities without active Supabase environment variables does not crash test discovery.
- **[QA-12] Remove Legacy `node-fetch@2` Polyfill**:
  - Remove CommonJS `node-fetch@2` overrides in `jest.setup.ts` to leverage Node 24 native global `fetch` and prevent type collisions.

---

## 3. Non-Functional & Guardrail Requirements
- **Production Database Safety (AGENTS.md)**: No migrations, DDL, or DML mutations executed against the remote project (`jfsxclrdxmvftxacjuqf`). All schema changes must be developed and verified locally (`npm run db:*`).
- **Expand-and-Contract Migrations**: Schema alterations must remain non-breaking for live running instances.
- **Middleware Rule**: `proxy.ts` remains the sole active middleware entrypoint.
- **Test Isolation**: `npm test` must run completely offline without requiring a database container.

---

## 4. Acceptance Criteria
- [ ] Direct updates to `public.wineries` by authenticated non-service-role clients return RLS error 42501.
- [ ] Anonymous and authenticated calls to `bulk_upsert_wineries` RPC fail with permission denied (execute granted only to `service_role`).
- [ ] `GET /api/auth/confirm-user` returns 404 in production mode and validates shared secret in dev mode.
- [ ] `npm run db:lint` reports 0 missing `search_path` warnings.
- [ ] `proxy.ts` preserves `Set-Cookie` tokens across redirects, permits access to `/privacy` and `/terms`, and allows `/workbox-*.js` and `/worker-*.js` chunks without auth redirects.
- [ ] Multi-trip visit logging failure does not push empty `{}` records into IndexedDB sync queue.
- [ ] `npm test` runs cleanly in < 60 seconds with no live database connection required.
- [ ] `npm run test:integration` executes the segregated integration tests against the local database.
- [ ] `e2e/utils.ts` discovers tests cleanly without throwing missing env var errors.

---

## 5. Out of Scope
- Full Mapbox offline caching engine overhaul.
- Client UI layout refactoring (covered in subsequent milestones).
