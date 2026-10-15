# Implementation Plan: Automated iOS PWA Standalone Testing Matrix & Domain Refactoring

## Phase 1: Unit & Component Test Matrix [checkpoint: 98052054]

- [x] Task: Write failing tests for `usePwa` hook and standalone installability suppression (TDD Red phase) [commit: 037ca019]
    - [x] Create `hooks/__tests__/use-pwa.test.ts`
    - [x] Test standard Browser Mode (`standalone: false`, `display-mode: browser` -> `isStandalone: false`, `isInstallable: true`)
    - [x] Test Standalone Mode via iOS WebClip signal (`(window.navigator as any).standalone = true`)
    - [x] Test Standalone Mode via W3C matchMedia signal (`window.matchMedia('(display-mode: standalone)').matches = true`)
    - [x] Test Standalone Mode via Android referrer signal (`document.referrer.includes('android-app://')`)
    - [x] Assert `isInstallable: false` when `isStandalone: true` even if `beforeinstallprompt` is fired (fails against unhardened `usePwa`)
    - [x] Verify failing tests via `./scripts/containers/run-jest-container.sh hooks/__tests__/use-pwa.test.ts`
- [x] Task: Implement `usePwa` hook hardening and standalone invariant (TDD Green phase) [commit: 9532c5f6]
    - [x] Update `hooks/use-pwa.ts` to enforce boolean casting on `isStandalone`
    - [x] Enforce invariant `isInstallable: !isStandalone && !!installPrompt`
    - [x] Verify test suite passes via `./scripts/containers/run-jest-container.sh hooks/__tests__/use-pwa.test.ts`
- [x] Task: Write failing component tests for `PwaHandler` and `UserNav` standalone suppression (TDD Red phase) [commit: 6e571d35]
    - [x] Add test in `components/__tests__/PwaHandler.test.tsx` asserting install banner/card is suppressed (`null`) when `isStandalone: true` (fails against current component)
    - [x] Add test in `components/nav/__tests__/user-nav.test.tsx` asserting `"Install App"` / `"Add to Home Screen"` item is hidden when `isStandalone: true`
    - [x] Verify failing tests via `./scripts/containers/run-jest-container.sh components/__tests__/PwaHandler.test.tsx components/nav/__tests__/user-nav.test.tsx`
- [x] Task: Implement `PwaHandler` standalone guard (TDD Green phase) [commit: a068797a]
    - [x] Update `components/pwa-handler.tsx` to guard `if (!isInstallable || isStandalone || isDismissed) return null;`
    - [x] Verify both component test suites pass via `./scripts/containers/run-jest-container.sh components/__tests__/PwaHandler.test.tsx components/nav/__tests__/user-nav.test.tsx`
- [x] Task: Conductor - User Manual Verification 'Phase 1: Unit & Component Test Matrix' (Protocol in workflow.md) [commit: 98052054]

## Phase 2: Domain Refactoring & Compatibility Seam

- [x] Task: Write failing tests for canonical `handleTripNavigation` in `useTripActions` (TDD Red phase) [commit: 1ed0abe4]
    - [x] Update `hooks/__tests__/use-trip-actions.test.ts` asserting synchronous dispatch of canonical `handleTripNavigation` for Apple Maps, Google Maps, and Waze (fails against current hook)
    - [x] Assert `@deprecated handleExportToMaps` alias delegates directly to `handleTripNavigation`
    - [x] Verify failing tests via `./scripts/containers/run-jest-container.sh hooks/__tests__/use-trip-actions.test.ts`
- [ ] Task: Implement canonical `handleTripNavigation` in `useTripActions` (TDD Green phase)
    - [ ] Export `handleTripNavigation` and provide `handleExportToMaps` as `@deprecated` alias in `hooks/use-trip-actions.ts`
    - [ ] Verify test suite passes via `./scripts/containers/run-jest-container.sh hooks/__tests__/use-trip-actions.test.ts`
- [ ] Task: Write failing component tests for TripCard `onNavigateTrip` delegation (TDD Red phase)
    - [ ] Update `components/__tests__/trip-card-simple.test.tsx` asserting delegation to `onNavigateTrip` while maintaining backwards compatibility for `onExportToMaps` (fails against current containers)
    - [ ] Verify failing tests via `./scripts/containers/run-jest-container.sh components/__tests__/trip-card-simple.test.tsx`
- [ ] Task: Implement `onNavigateTrip` in TripCard containers and presentational components (TDD Green phase)
    - [ ] Update `components/trip-card.tsx` and `components/trip-card-simple.tsx` to bind `onNavigateTrip` and `onExportToMaps`
    - [ ] Update `components/TripCardPresentational.tsx` and `components/TripCardSimplePresentational.tsx` to accept `onNavigateTrip` with fallback to `onExportToMaps`
    - [ ] Verify container and presentational suites pass via `./scripts/containers/run-jest-container.sh components/__tests__/trip-card-simple.test.tsx`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Domain Refactoring & Compatibility Seam' (Protocol in workflow.md)

## Phase 3: Playwright Standalone Fixture & E2E Verification

- [ ] Task: Implement Playwright `standalonePage` fixture and `enableStandaloneMode` helper
    - [ ] Add `enableStandaloneMode` helper in `e2e/fixtures/` injecting `window.navigator.standalone = true` and `(display-mode: standalone)` matchMedia override
    - [ ] Add `standalonePage` fixture in `e2e/fixtures/index.ts` and re-export in `e2e/utils.ts`
- [ ] Task: Author `e2e/trip-navigation-pwa.spec.ts` for Mobile Safari popup navigation
    - [ ] Add context route interception for `maps.apple.com`, `google.com/maps`, and `waze.com` to prevent container DNS timeouts
    - [ ] Pre-seed mock trip with winery stops in `mockMaps.state.trips` to ensure navigation button is enabled
    - [ ] Assert Apple Maps, Google Maps, and Waze dispatches under `Mobile Safari` trigger `page.waitForEvent('popup')`
    - [ ] Assert popup URL query parameters and verify WebKit transient user gesture preservation without popup blocking
    - [ ] Verify via `./scripts/containers/run-e2e-container.sh mobile-safari e2e/trip-navigation-pwa.spec.ts`
- [ ] Task: Update `e2e/pwa-install-layout.spec.ts` for Standalone Mode suppression
    - [ ] Add standalone assertions using `enableStandaloneMode(page)` verifying install bar/card are never rendered
    - [ ] Verify via `./scripts/containers/run-e2e-container.sh mobile-safari e2e/pwa-install-layout.spec.ts`
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Playwright Standalone Fixture & E2E Verification' (Protocol in workflow.md)

## Phase 4: Full Quality Gates & Regression Verification

- [ ] Task: Run full containerized test suites, type checking, and linting
    - [ ] Run `npm run type-check`
    - [ ] Run `npm run lint`
    - [ ] Run full unit test suite `./scripts/containers/run-jest-container.sh`
    - [ ] Run Mobile Safari E2E tests `./scripts/containers/run-e2e-container.sh mobile-safari`
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Full Quality Gates & Regression Verification' (Protocol in workflow.md)
