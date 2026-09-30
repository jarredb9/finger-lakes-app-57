# Implementation Plan: Winery Operational Hours Resilience & PWA Hydration (Issue #56)

## Phase 1: Tri-State Operational Status & UI Resilience (TDD)
- [ ] Task: Write failing unit tests for tri-state badge fallbacks and loading skeletons
    - [ ] Add unit tests in `components/winery/__tests__/winery-info-card.test.tsx` verifying `Open Now` (true), `Closed` (false), `Hours Unavailable` (null), and skeleton loading state (`isLoading: true`)
    - [ ] Add unit tests in `components/winery/__tests__/mobile-winery-drawer.test.tsx` verifying peek badge displays `🟢 OPEN NOW`, `🔴 CLOSED`, and `⚪ HOURS UNAVAILABLE`
    - [ ] Add unit tests in `components/__tests__/winery-card-thumbnail.test.tsx` verifying thumbnail badge renders `Hours Unavailable` (null) or omitted cleanly without defaulting to `Closed`
    - [ ] Confirm all tests fail against current binary logic (Red phase)
- [ ] Task: Implement tri-state status badge and schedule fallbacks across presentational components
    - [ ] Refactor `components/winery/winery-info-card.tsx` to handle tri-state `isOpen`, loading skeleton, and hours fallback with website link
    - [ ] Refactor `components/winery/mobile-winery-drawer.tsx` peek status badge to handle tri-state `isOpen` with `⚪ HOURS UNAVAILABLE`
    - [ ] Update `components/winery-card-thumbnail.tsx` to support tri-state badge handling
    - [ ] Re-run component unit tests via Jest container to confirm Green status (Green phase)
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Tri-State Operational Status & UI Resilience' (Protocol in workflow.md)

## Phase 2: On-Demand Enrichment & Numeric ID Resolution Hardening (TDD)
- [ ] Task: Write failing unit and integration tests for numeric ID on-demand enrichment
    - [ ] Add unit tests in `lib/stores/__tests__/wineryStore.test.ts` verifying that calling `ensureWineryDetails('2988')` when Postgres RPC returns data without `opening_hours` resolves `google_place_id` and invokes Edge Function `get-winery-details`
    - [ ] Add test cases verifying error resilience when Edge Function fails and background revalidation deduplication sets (`inFlightRevalidations`) do not deadlock
    - [ ] Confirm tests fail against current `wineryStore.ts` implementation (Red phase)
- [ ] Task: Implement numeric ID on-demand enrichment in wineryStore
    - [ ] Update `ensureWineryDetails` in `lib/stores/wineryStore.ts` to inspect `dbData.google_place_id` and trigger Edge Function enrichment if `opening_hours` is missing
    - [ ] Maintain `loadingWineryId` active during pending on-demand enrichment
    - [ ] Audit and standardize modal opening callers to provide `winery.id` (Place ID) where available
    - [ ] Re-run unit tests to confirm Green status (Green phase)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: On-Demand Enrichment & Numeric ID Resolution Hardening' (Protocol in workflow.md)

## Phase 3: PWA Cache Invalidation & Post-Update Store Rehydration (TDD)
- [ ] Task: Write failing unit tests for store version migration and PWA update rehydration
    - [ ] Add unit tests in `lib/stores/__tests__/wineryStore.persist.test.ts` verifying Zustand `version: 2` migration purges records lacking `last_enriched_at` or `openingHours`
    - [ ] Add unit tests in `hooks/__tests__/use-pwa-update.test.ts` asserting `_PWA_JUST_UPDATED` timestamp is stored on `applyUpdate` and re-fetch trigger is dispatched on reload
    - [ ] Confirm tests fail (Red phase)
- [ ] Task: Implement store version 2 migration and post-update reload rehydration
    - [ ] Configure `version: 2` and `migrate` callback in `lib/stores/wineryStore.ts`
    - [ ] Update `hooks/use-pwa-update.ts` to manage `_PWA_JUST_UPDATED` flag and trigger `fetchWineryData` on startup
    - [ ] Re-run tests to confirm Green status (Green phase)
- [ ] Task: Conductor - User Manual Verification 'Phase 3: PWA Cache Invalidation & Post-Update Store Rehydration' (Protocol in workflow.md)

## Phase 4: Scaffolding Cleanup & Final Regression Verification (TDD)
- [ ] Task: Audit and clean up temporary scaffolding tests
    - [ ] Review all test files created or modified during the track
    - [ ] Remove temporary harness fixtures and scaffolding tests, preserving permanent regression test suites
- [ ] Task: Execute full automated test suite and type verification
    - [ ] Run containerized unit and integration test suite (`./scripts/run-jest-container.sh`)
    - [ ] Run TypeScript type check (`npm run db:check-types:local` / `tsc --noEmit`)
    - [ ] Run E2E Playwright verification (`./scripts/run-e2e-container.sh webkit e2e/winery-hours-resilience.spec.ts`)
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Scaffolding Cleanup & Final Regression Verification' (Protocol in workflow.md)
