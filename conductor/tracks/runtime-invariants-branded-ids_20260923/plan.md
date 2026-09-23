# Implementation Plan: Runtime Invariant Protection & Branded ID Ergonomics (PR 1 / Issue #53)

## Phase 1: Branded ID Ergonomics & Type Guards Foundation
Focuses on establishing nominal branded ID constructors, runtime type guards, and adopting them across offline sync service boundaries.

- [x] Task: Branded ID Constructors & Type Guards in `lib/types.ts` (dcc8452)
    - [x] Write unit tests for `isGooglePlaceId`, `isWineryDbId`, `toGooglePlaceId`, and `toWineryDbId` in `lib/__tests__/types.test.ts` (testing valid values, null/undefined overloads, empty/negative inputs, and dev warning outputs)
    - [x] Implement `isGooglePlaceId`, `isWineryDbId`, `toGooglePlaceId`, and `toWineryDbId` in `lib/types.ts` with nullable overloads and dev-mode validation warnings
    - [x] Verify tests pass and run `npm run type-check`
- [ ] Task: Replace Winery ID `as any` Casts in `lib/services/syncService.ts`
    - [ ] Update `lib/services/syncService.ts` lines 313-314, 559-560, and 572-573 to use `toGooglePlaceId` and `toWineryDbId`
    - [ ] Run existing sync service unit tests (`npm run test:container -- lib/services/__tests__/syncService.test.ts`)
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Branded ID Ergonomics & Type Guards Foundation' (Protocol in workflow.md)

## Phase 2: Invariant Protection & Safe Navigation in Core Utilities
Hardens winery type guards against `null`/`undefined` crash bugs, eliminates untyped `as any` assertions in winery standardizer, and implements safe navigation in opening hours calculation.

- [ ] Task: Winery Standardizer Type Guards & Invariant Protection in `lib/utils/winery.ts`
    - [ ] Write unit tests asserting that `isRecord`, `isGoogleWinery`, `isMapMarkerRpc`, `isWineryDetailsRpc`, and `isRawDbWinery` return `false` on `null`, `undefined`, numbers, strings, arrays, and malformed objects without throwing
    - [ ] Implement and export `isRecord(val: unknown): val is Record<string, unknown>` (excluding arrays) and update/export all winery guards in `lib/utils/winery.ts` to accept `source: unknown`
    - [ ] Refactor 20+ `(source as any)` assertions in `standardizeWineryData` to use structured narrowing and typed access
    - [ ] Run winery standardizer unit tests (`npm run test:container -- lib/utils/__tests__/winery.test.ts`)
- [ ] Task: Safe Navigation & Schema in `lib/utils/opening-hours.ts` & `lib/types.ts`
    - [ ] Write unit tests for periods with missing `open`, missing `close`, empty arrays, and malformed period objects
    - [ ] Update `OpeningHoursPoint` and export `OpeningHoursPeriod` in `lib/types.ts` to accommodate `{ time?: string }`
    - [ ] Implement defensive handling in `parseTime(point?: OpeningHoursPoint | null)` and loop period checks (`if (!period?.open || !period?.close) continue;`) in `lib/utils/opening-hours.ts`
    - [ ] Remove all 7 `// @ts-ignore` comments in `lib/utils/__tests__/opening-hours.test.ts`
    - [ ] Run opening hours tests (`npm run test:container -- lib/utils/__tests__/opening-hours.test.ts`)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Invariant Protection & Safe Navigation in Core Utilities' (Protocol in workflow.md)

## Phase 3: Zustand Store Mutation Hardening
Types Zustand trip mutations strictly to prevent in-memory and IndexedDB state corruption.

- [ ] Task: Strict Typing for Trip Mutation Helper in `lib/stores/slices/tripMutationHelpers.ts` & `tripDataSlice.ts`
    - [ ] Write unit test verifying `updateTripHelper` handles valid updates (`name`, `trip_date`) and rejects/flags unpermitted fields
    - [ ] Define `TripUpdateInput` interface (`name?: string; trip_date?: string`)
    - [ ] Implement runtime key whitelisting and dev warning in `updateTripHelper(get, set, tripId, updates: TripUpdateInput)`
    - [ ] Update `TripDataSlice.updateTrip` method signature in `lib/stores/slices/tripDataSlice.ts` to accept `TripUpdateInput`
    - [ ] Run trip store unit tests (`npm run test:container -- lib/stores/__tests__/tripStore.test.ts`)
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Zustand Store Mutation Hardening' (Protocol in workflow.md)

## Phase 4: Test Environment Cleanup & Final Quality Gates
Consolidates permanent regression tests into canonical test files, purges temporary scaffolding tests to preserve a clean test runner environment, and validates full build and type integrity.

- [ ] Task: Scaffolding Test Cleanup & Test Suite Consolidation
    - [ ] Review all test files created or modified during the track
    - [ ] Ensure permanent regression assertions reside in canonical test suites (`lib/utils/__tests__/winery.test.ts`, `lib/utils/__tests__/opening-hours.test.ts`, `lib/__tests__/types.test.ts`)
    - [ ] Identify and delete any temporary, scratch, or transitional scaffolding test files to leave a pristine test environment
- [ ] Task: Repository-Wide Verification & Quality Gates
    - [ ] Run full TypeScript static type checking: `npm run type-check`
    - [ ] Run full containerized Jest test suite: `npm run test:container`
    - [ ] Verify zero regressions across affected modules and confirm clean git working tree
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Test Environment Cleanup & Final Quality Gates' (Protocol in workflow.md)
