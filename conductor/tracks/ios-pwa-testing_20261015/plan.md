# Implementation Plan: Automated iOS PWA Standalone Testing Matrix & Domain Refactoring

## Phase 1: Unit & Component Test Matrix

- [ ] Task: Implement `usePwa` standalone permutation test suite
    - [ ] Create `hooks/__tests__/use-pwa.test.ts`
    - [ ] Test standard browser mode (`standalone: false`, `display-mode: browser`)
    - [ ] Test iOS WebClip mode (`(window.navigator as any).standalone = true`)
    - [ ] Test W3C Standalone mode (`window.matchMedia('(display-mode: standalone)').matches = true`)
    - [ ] Test Android referrer mode (`document.referrer.includes('android-app://')`)
    - [ ] Verify test execution via `./scripts/run-jest-container.sh hooks/__tests__/use-pwa.test.ts`
- [ ] Task: Update `PwaHandler` defense-in-depth and implement component suppression tests
    - [ ] Update `components/pwa-handler.tsx` to guard against `isStandalone`
    - [ ] Add standalone suppression test in `components/__tests__/PwaHandler.test.tsx`
    - [ ] Add `components/__tests__/user-nav.test.tsx` asserting `"Install App"` / `"Add to Home Screen"` is hidden when `isStandalone: true`
    - [ ] Verify both component suites pass via `./scripts/run-jest-container.sh`
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Unit & Component Test Matrix' (Protocol in workflow.md)

## Phase 2: Domain Refactoring & Compatibility Seam

- [ ] Task: Refactor `useTripActions` to export canonical `handleTripNavigation` with deprecated alias
    - [ ] Export `handleTripNavigation` and provide `handleExportToMaps` as `@deprecated` alias in `hooks/use-trip-actions.ts`
    - [ ] Update `hooks/__tests__/use-trip-actions.test.ts` to test both canonical and alias exports
    - [ ] Verify via `./scripts/run-jest-container.sh hooks/__tests__/use-trip-actions.test.ts`
- [ ] Task: Update presentational trip cards for `onNavigateTrip`
    - [ ] Update `components/TripCardPresentational.tsx` to accept `onNavigateTrip` with fallback to `onExportToMaps`
    - [ ] Update `components/TripCardSimplePresentational.tsx` similarly
    - [ ] Verify existing component tests pass via `./scripts/run-jest-container.sh`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Domain Refactoring & Compatibility Seam' (Protocol in workflow.md)

## Phase 3: Playwright Standalone Fixture & E2E Verification

- [ ] Task: Implement Playwright `standalonePage` fixture / helper
    - [ ] Add `standalonePage` fixture (or `withStandaloneMode` helper) in `e2e/fixtures/` injecting `window.navigator.standalone = true` and `(display-mode: standalone)` matchMedia override
- [ ] Task: Author `e2e/trip-navigation-pwa.spec.ts` for Mobile Safari popup navigation
    - [ ] Test Apple Maps, Google Maps, and Waze dispatches under `Mobile Safari`
    - [ ] Assert `page.waitForEvent('popup')` captures external navigation without WebKit gesture blocking
    - [ ] Verify via `./scripts/run-e2e-container.sh mobile-safari e2e/trip-navigation-pwa.spec.ts`
- [ ] Task: Update `e2e/pwa-install-layout.spec.ts` for standalone mode
    - [ ] Add standalone assertions verifying install bar/card are never rendered when standalone
    - [ ] Verify via `./scripts/run-e2e-container.sh mobile-safari e2e/pwa-install-layout.spec.ts`
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Playwright Standalone Fixture & E2E Verification' (Protocol in workflow.md)

## Phase 4: Full Quality Gates & Regression Verification

- [ ] Task: Run full containerized test suites, type checking, and linting
    - [ ] Run `npm run type-check`
    - [ ] Run `npm run lint`
    - [ ] Run full unit test suite `./scripts/run-jest-container.sh`
    - [ ] Run Mobile Safari E2E tests `./scripts/run-e2e-container.sh mobile-safari`
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Full Quality Gates & Regression Verification' (Protocol in workflow.md)
