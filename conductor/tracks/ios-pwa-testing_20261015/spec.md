# Specification: Automated iOS PWA Standalone Testing Matrix & Domain Refactoring

## 1. Overview
This track implements an automated testing matrix for standalone progressive web application (PWA) mode (`window.navigator.standalone = true` and `display-mode: standalone`) on iOS WebKit without requiring physical iOS or macOS hardware. It verifies transient user gesture preservation for launching external turn-by-turn navigation providers (Google Maps, Apple Maps, Waze), ensures install banner suppression in standalone mode, and refactors trip navigation handlers to adhere to the canonical domain model (`CONTEXT.md` and ADR 0006).

## 2. Functional Requirements

### 2.1 Domain & Hook Refactoring (`useTripActions`)
- Export canonical `handleTripNavigation(provider: NavigationProvider)` from `hooks/use-trip-actions.ts`.
- Retain `handleExportToMaps` as a `@deprecated` backward-compatible alias delegating directly to `handleTripNavigation`.
- Update `components/TripCardPresentational.tsx` and `components/TripCardSimplePresentational.tsx` to accept `onNavigateTrip` with fallback to `onExportToMaps`.
- Maintain synchronous invocation of `launchTripNavigation(provider, trip.wineries)` preserving transient user gesture activation.

### 2.2 Component UI Invariants in Standalone Mode
- `components/pwa-handler.tsx`: Add defense-in-depth guard `if (!isInstallable || isStandalone || isDismissed) return null;` ensuring install banners are never rendered when running in Standalone Mode.
- `components/nav/user-nav.tsx`: Verify that the `"Install App"` / `"Add to Home Screen"` dropdown menu item is hidden when `isStandalone === true`.

### 2.3 Unit & Component Testing (Jest / JSDOM)
- `hooks/__tests__/use-pwa.test.ts`: Create a comprehensive test suite verifying `usePwa` under:
  - Browser mode: `standalone: false`, `display-mode: browser` -> `isStandalone: false`.
  - iOS WebClip mode: `(window.navigator as any).standalone = true` -> `isStandalone: true`.
  - W3C Standalone mode: `window.matchMedia('(display-mode: standalone)').matches = true` -> `isStandalone: true`.
  - Android referrer mode: `document.referrer.includes('android-app://')` -> `isStandalone: true`.
- `components/__tests__/PwaHandler.test.tsx`: Verify install UI suppression when `isStandalone === true`.
- `components/__tests__/user-nav.test.tsx`: Verify `"Install App"` / `"Add to Home Screen"` item visibility in browser mode and suppression in standalone mode.
- `hooks/__tests__/use-trip-actions.test.ts`: Assert synchronous dispatch of `handleTripNavigation` for Apple Maps, Google Maps, and Waze.

### 2.4 Playwright E2E Testing (Containerized Mobile Safari / WebKit)
- Extend `e2e/fixtures` with a `standalonePage` fixture or `withStandaloneMode` helper that injects:
  - `Object.defineProperty(navigator, 'standalone', { get: () => true })`
  - `window.matchMedia` override returning `{ matches: true }` for `(display-mode: standalone)`
- Create `e2e/trip-navigation-pwa.spec.ts` under the `Mobile Safari` project:
  - Assert that clicking Apple Maps, Google Maps, or Waze emits `page.waitForEvent('popup')`.
  - Assert that the popup URL contains the expected query parameters and destination.
  - Verify that WebKit does not block popup execution due to lost user activation.
- Update `e2e/pwa-install-layout.spec.ts` to assert install banners remain hidden in standalone mode.

## 3. Non-Functional Requirements
- **Container Isolation & Host Compatibility:** All unit tests must execute via `./scripts/run-jest-container.sh` and E2E tests via `./scripts/run-e2e-container.sh mobile-safari` on RHEL 8.
- **Zero Flakiness:** All popup and DOM assertions must utilize auto-retrying Playwright locators and deterministic event listeners.
- **Backwards Compatibility:** No breaking changes to existing consumer components or tests relying on `handleExportToMaps` / `onExportToMaps`.

## 4. Acceptance Criteria
- [ ] `hooks/__tests__/use-pwa.test.ts` passes with 100% boundary coverage.
- [ ] `components/__tests__/PwaHandler.test.tsx` and `user-nav.test.tsx` pass.
- [ ] `hooks/use-trip-actions.ts` exports `handleTripNavigation` with `@deprecated` alias `handleExportToMaps`.
- [ ] `e2e/trip-navigation-pwa.spec.ts` passes in containerized Mobile Safari (`./scripts/run-e2e-container.sh mobile-safari`).
- [ ] `npm run type-check` and `npm run lint` report 0 errors.
- [ ] All 141+ existing test suites continue to pass without regressions.

## 5. Out of Scope
- Physical iOS device automation or Apple Appium Springboard automation.
- Cloud device farm integrations (BrowserStack / SauceLabs).
- Push notification handling in iOS 16.4+ WebClips.
