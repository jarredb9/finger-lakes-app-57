# Implementation Plan: Runtime Invariant Protection & Branded ID Ergonomics (PR 1 / Issue #53)

## Phase 1: Branded ID Ergonomics & Type Guards Foundation [checkpoint: 5e49957]
Focuses on establishing nominal branded ID constructors, runtime type guards, and adopting them across offline sync service boundaries.

- [x] Task: Branded ID Constructors & Type Guards in `lib/types.ts` (dcc8452)
    - [x] Write unit tests for `isGooglePlaceId`, `isWineryDbId`, `toGooglePlaceId`, and `toWineryDbId` in `lib/__tests__/types.test.ts` (testing valid values, null/undefined overloads, empty/negative inputs, and dev warning outputs)
    - [x] Implement `isGooglePlaceId`, `isWineryDbId`, `toGooglePlaceId`, and `toWineryDbId` in `lib/types.ts` with nullable overloads and dev-mode validation warnings
    - [x] Verify tests pass and run `npm run type-check`
- [x] Task: Write Failing Unit Tests for Sync Service Branded ID Mutations (Red Phase) (46fc2c6)
    - [x] Add unit test assertions in `lib/services/__tests__/syncService.test.ts` verifying `log_visit`, `toggle_favorite`, and `toggle_wishlist` properly construct `p_winery_data` with branded `id` (`toGooglePlaceId`) and `dbId` (`toWineryDbId`)
    - [x] Run containerized sync service tests (`npm run test:container -- lib/services/__tests__/syncService.test.ts`) and confirm failures or gaps on unbranded mutation payloads (Red phase verification)
- [x] Task: Replace Winery ID `as any` Casts in `lib/services/syncService.ts` (Green Phase) (4d42fcf)
    - [x] Update `lib/services/syncService.ts` lines 313-314, 559-560, and 572-573 to replace `as any` casts with `toGooglePlaceId` and `toWineryDbId`
    - [x] Run sync service unit tests (`npm run test:container -- lib/services/__tests__/syncService.test.ts`) and verify all tests pass (Green phase verification)
    - [x] Verify static type check passes (`npm run type-check`)
- [x] Task: Conductor - User Manual Verification 'Phase 1: Branded ID Ergonomics & Type Guards Foundation' (Protocol in workflow.md) (5e49957)

## Phase 2: Invariant Protection & Safe Navigation in Core Utilities [checkpoint: b4bb92c]
Hardens winery type guards against `null`/`undefined` crash bugs, eliminates untyped `as any` assertions in winery standardizer, and implements safe navigation in opening hours calculation.

- [x] Task: Write Failing Tests for Winery Type Guards & Invariant Protection (Red Phase) (84d1a15)
    - [x] Write unit tests in `lib/utils/__tests__/winery.test.ts` asserting that `isRecord`, `isGoogleWinery`, `isMapMarkerRpc`, `isWineryDetailsRpc`, and `isRawDbWinery` return `false` on `null`, `undefined`, numbers, strings, booleans, arrays, and malformed objects without throwing `TypeError`
    - [x] Run containerized winery tests (`npm run test:container -- lib/utils/__tests__/winery.test.ts`) to verify tests fail on `null`/`undefined` inputs under the current implementation (Red phase verification)
- [x] Task: Harden Winery Standardizer Type Guards & Invariants in `lib/utils/winery.ts` (Green Phase) (154d956)
    - [x] Implement and export `isRecord(val: unknown): val is Record<string, unknown>` (excluding arrays) in `lib/utils/winery.ts`
    - [x] Update and export `isGoogleWinery`, `isMapMarkerRpc`, `isWineryDetailsRpc`, and `isRawDbWinery` in `lib/utils/winery.ts` to accept `source: unknown` and evaluate `isRecord(source)` before property checks
    - [x] Refactor 20+ `(source as any)` assertions in `standardizeWineryData` to use structured narrowing and typed access
    - [x] Run winery standardizer unit tests (`npm run test:container -- lib/utils/__tests__/winery.test.ts`) and verify all pass (Green phase verification)
    - [x] Verify static type check passes (`npm run type-check`)
- [x] Task: Harden Winery Standardizer Branded IDs & Deep Invariants (da964d7)
    - [x] Add unit tests in `lib/utils/__tests__/winery.test.ts` verifying whitespace/invalid Google Place IDs return `null`, primitive `parking_options` and `accessibility_options` are sanitized to `null`, invalid `enrichment_tier` strings fall back to domain defaults, and type guards reject undefined/empty IDs
    - [x] Adopt `toGooglePlaceId` and `toWineryDbId` constructors in `standardizeWineryData` in `lib/utils/winery.ts` and reject invalid place IDs (`!isGooglePlaceId(googleId)`)
    - [x] Tighten `isGoogleWinery`, `isMapMarkerRpc`, and `isWineryDetailsRpc` to enforce non-empty string IDs and object geometries
    - [x] Enforce `isRecord` validation on `parking_options` and `accessibility_options` before assignment or merging
    - [x] Validate `enrichment_tier` against canonical domain values `['basic', 'enriched', 'full']`
    - [x] Guard timestamp parsing in `parseReviewsJson` against `NaN`
    - [x] Run containerized winery tests (`npm run test:container -- lib/utils/__tests__/winery.test.ts`) and verify all pass
    - [x] Verify static type check passes (`npm run type-check`)
- [x] Task: Write Failing Tests for Safe Opening Hours Property Navigation (Red Phase) (e43728d)
    - [x] Write unit tests in `lib/utils/__tests__/opening-hours.test.ts` for periods with missing `open`, missing `close`, empty arrays, malformed period objects, and nullish inputs to `parseTime` asserting that `isOpenNow` returns safely without throwing `TypeError`
    - [x] Run containerized opening hours tests (`npm run test:container -- lib/utils/__tests__/opening-hours.test.ts`) and confirm tests fail (Red phase verification)
- [x] Task: Safe Navigation & Schema in `lib/utils/opening-hours.ts` & `lib/types.ts` (Green Phase) (45e169e)
    - [x] Update `OpeningHoursPoint` and export `OpeningHoursPeriod` in `lib/types.ts` to accommodate `{ time?: string }` alongside numeric schemas
    - [x] Implement defensive handling in `parseTime(point?: OpeningHoursPoint | null)` returning `NaN` on nullish or malformed points in `lib/utils/opening-hours.ts`
    - [x] Implement loop period safety checks (`if (!period?.open || !period?.close) continue;`) in `lib/utils/opening-hours.ts`
    - [x] Remove all 7 `// @ts-ignore` comments in `lib/utils/__tests__/opening-hours.test.ts`
    - [x] Run opening hours tests (`npm run test:container -- lib/utils/__tests__/opening-hours.test.ts`) and verify all pass (Green phase verification)
    - [x] Verify static type check passes (`npm run type-check`)
- [x] Task: Conductor - User Manual Verification 'Phase 2: Invariant Protection & Safe Navigation in Core Utilities' (Protocol in workflow.md) (b4bb92c)

## Phase 3: Zustand Store Mutation Hardening [checkpoint: 2e0b740]
Types Zustand trip mutations strictly to prevent in-memory and IndexedDB state corruption.

- [x] Task: Write Failing Tests for Trip Mutation Key Whitelisting & Input Validation (Red Phase) (71ce71f)
    - [x] Write unit tests in `lib/stores/__tests__/tripStore.test.ts` (or `tripMutationHelpers.test.ts`) verifying `updateTripHelper` accepts valid updates (`name`, `trip_date`), strips/rejects unpermitted fields, and logs dev warnings on invalid keys
    - [x] Run containerized trip store unit tests (`npm run test:container -- lib/stores/__tests__/tripStore.test.ts`) and confirm failure against current unconstrained spread implementation (Red phase verification)
- [x] Task: Implement Strict Typing & Sanitization for Trip Mutation Helper (Green Phase) (73fb51b)
    - [x] Define `TripUpdateInput` interface (`name?: string; trip_date?: string`)
    - [x] Implement runtime key whitelisting and dev warning in `updateTripHelper(get, set, tripId, updates: TripUpdateInput)` in `lib/stores/slices/tripMutationHelpers.ts`
    - [x] Update `TripDataSlice.updateTrip` method signature in `lib/stores/slices/tripDataSlice.ts` to accept `TripUpdateInput`
    - [x] Run trip store unit tests (`npm run test:container -- lib/stores/__tests__/tripStore.test.ts`) and verify all pass (Green phase verification)
    - [x] Verify static type check passes (`npm run type-check`)
- [x] Task: Conductor - User Manual Verification 'Phase 3: Zustand Store Mutation Hardening' (Protocol in workflow.md) (2e0b740)

## Phase 4: Test Environment Cleanup & Final Quality Gates [checkpoint: 3a3da31]
Consolidates permanent regression tests into canonical test files, purges temporary scaffolding tests to preserve a clean test runner environment, and validates full build and type integrity.

- [x] Task: Scaffolding Test Cleanup & Test Suite Consolidation (98939ff)
    - [x] Review all test files created or modified during the track
    - [x] Ensure permanent regression assertions reside in canonical test suites (`lib/utils/__tests__/winery.test.ts`, `lib/utils/__tests__/opening-hours.test.ts`, `lib/__tests__/types.test.ts`, `lib/services/__tests__/syncService.test.ts`, `lib/stores/__tests__/tripStore.test.ts`)
    - [x] Identify and delete any temporary, scratch, or transitional scaffolding test files to leave a pristine test environment
- [x] Task: Repository-Wide Verification & Quality Gates (26064aa)
    - [x] Run full TypeScript static type checking: `npm run type-check`
    - [x] Run full containerized Jest test suite: `npm run test:container`
    - [x] Verify zero regressions across affected modules and confirm clean git working tree
- [x] Task: Conductor - User Manual Verification 'Phase 4: Test Environment Cleanup & Final Quality Gates' (Protocol in workflow.md)

## Phase: Review Fixes
- [x] Task: Apply review suggestions (40f77b3) for Phase 1
