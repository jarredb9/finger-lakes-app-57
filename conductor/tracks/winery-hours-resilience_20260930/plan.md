# Implementation Plan: Winery Operational Hours Resilience & PWA Hydration (Issue #56)

## Phase 1: Tri-State Operational Status, Decoupled Loading & UI Resilience (TDD) [checkpoint: a89d255d]
- [x] Task: Write failing unit tests for tri-state badge fallbacks, decoupled layout loading, and loading skeletons (47d7becc)
    - [x] Add unit tests in `components/winery/__tests__/winery-info-card.test.tsx` verifying `Open Now` (true), `Closed` (false), `Hours Unavailable` (null), skeleton loading pill state (`isLoading: true`), and schedule fallback with website link
    - [x] Add unit tests in `components/winery/__tests__/mobile-winery-drawer.test.tsx` verifying peek badge displays animated skeleton pill when `isLoading: true`, and renders `🟢 OPEN NOW`, `🔴 CLOSED`, or `⚪ HOURS UNAVAILABLE` when loaded
    - [x] Add unit tests in `components/__tests__/winery-card-thumbnail.test.tsx` verifying thumbnail card cleanly omits status badge when `isOpen === null` without defaulting to `Closed`
    - [x] Add unit tests in `components/winery/__tests__/desktop-winery-modal.test.tsx` and `mobile-winery-drawer.test.tsx` verifying cached wineries render content immediately when `isLoading: true` (only `!winery` renders full-screen skeleton)
    - [x] Confirm all tests fail against current binary/coupled logic (Red phase)
- [x] Task: Implement tri-state status badge, decoupled loading, and schedule fallbacks across presentational components (210fb49e)
    - [x] Refactor `DesktopWineryLayout`, `MobileWineryLayout`, and `TabletWineryLayout` to guard full-screen skeleton only on `!winery` and pass `isLoading` down through `WineryDetails` to `WineryInfoCard`
    - [x] Refactor `components/winery/winery-info-card.tsx` to handle `isLoading` skeleton pill, tri-state badge, and schedule fallback with website link
    - [x] Refactor `components/winery/mobile-winery-drawer.tsx` peek status badge to handle `isLoading` animated skeleton pill and `⚪ HOURS UNAVAILABLE`
    - [x] Update `components/winery-card-thumbnail.tsx` to cleanly omit badge when `isOpen === null`
    - [x] Re-run component unit tests via Jest container to confirm Green status (Green phase)
- [x] Task: Conductor - User Manual Verification 'Phase 1: Tri-State Operational Status, Decoupled Loading & UI Resilience' (Protocol in workflow.md)

## Phase 2: On-Demand Enrichment & Numeric ID Resolution Hardening (TDD)
- [x] Task: Write failing unit and integration tests for numeric ID on-demand enrichment (887fc12d)
    - [x] Add unit tests in `lib/stores/__tests__/wineryStore.test.ts` verifying that calling `ensureWineryDetails('2988')` when Postgres RPC returns data without `opening_hours` resolves `google_place_id` and invokes Edge Function `get-winery-details`
    - [x] Add test cases verifying error resilience when `google_place_id` is missing or Edge Function rejects: returns standardized `dbData` with null hours, clears `loadingWineryId`, and does not stall `inFlightRevalidations`
    - [x] Add test cases verifying `revalidateInBackground` handles numeric IDs by resolving `google_place_id`
    - [x] Confirm tests fail against current `wineryStore.ts` implementation (Red phase)
- [x] Task: Implement numeric ID on-demand enrichment in wineryStore (887fc12)
    - [x] Update `ensureWineryDetails` in `lib/stores/wineryStore.ts` to inspect `dbData.google_place_id` and trigger Edge Function enrichment if `opening_hours` is missing
    - [x] Maintain `loadingWineryId` active during pending on-demand enrichment and clear on completion or error
    - [x] Update `revalidateInBackground` to resolve `google_place_id` from numeric IDs
    - [x] Audit and standardize modal opening callers to provide `winery.id` (Place ID) where available
    - [x] Re-run unit tests to confirm Green status (Green phase)
- [x] Task: Conductor - User Manual Verification 'Phase 2: On-Demand Enrichment & Numeric ID Resolution Hardening' (Protocol in workflow.md)

## Phase 3: PWA Cache Invalidation, Selective Migration & Session-Backed Modal Restore (TDD) [checkpoint: 4862da47]
- [x] Task: Write failing unit tests for store version migration and session-backed PWA modal restoration (c29d399)
    - [x] Add unit tests in `lib/stores/__tests__/wineryStore.persist.test.ts` verifying Zustand `version: 2` migration selectively purges corrupt/stale enriched records lacking `openingHours` while preserving basic map marker records
    - [x] Add unit tests in `hooks/__tests__/use-pwa-update.test.ts` asserting `_PWA_JUST_UPDATED` timestamp and active modal ID (`_PWA_ACTIVE_WINERY_ID`) are stored in `sessionStorage` on `applyUpdate`
    - [x] Add unit tests in `components/modals/__tests__/authenticated-modal-host.test.tsx` verifying `_PWA_ACTIVE_WINERY_ID` triggers modal reopening and detail hydration on mount
    - [x] Confirm tests fail (Red phase)
- [x] Task: Implement store version 2 selective migration and session-backed modal restoration (ada39cff)
    - [x] Configure `version: 2` and selective `migrate` callback in `lib/stores/wineryStore.ts`
    - [x] Update `hooks/use-pwa-update.ts` to serialize `activeWineryId` to `sessionStorage` on `applyUpdate()` without coupling to data stores
    - [x] Update `components/modals/authenticated-modal-host.tsx` to restore modal and trigger `ensureWineryDetails` when `_PWA_ACTIVE_WINERY_ID` is present on mount
    - [x] Re-run tests to confirm Green status (Green phase)
- [x] Task: Conductor - User Manual Verification 'Phase 3: PWA Cache Invalidation, Selective Migration & Session-Backed Modal Restore' (Protocol in workflow.md)

## Phase 4: Test Retention Audit & Final Regression Verification (TDD)
- [x] Task: Audit test suite and verify permanent regression retention (d1794e88)
    - [x] Review all test files created or modified during the track
    - [x] Ensure all unit, integration, and E2E test suites created in Phases 1-3 are retained permanently as regression coverage
    - [x] Clean up any temporary scratch files or redundant mock spies
- [ ] Task: Execute full automated test suite and type verification
    - [ ] Run containerized unit and integration test suite (`./scripts/run-jest-container.sh`)
    - [ ] Run TypeScript type check (`npm run db:check-types:local` / `tsc --noEmit`)
    - [ ] Run E2E Playwright verification (`./scripts/run-e2e-container.sh webkit e2e/winery-hours-resilience.spec.ts`)
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Test Retention Audit & Final Regression Verification' (Protocol in workflow.md)
