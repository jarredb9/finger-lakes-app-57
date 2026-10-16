# Specification: Automated iOS PWA Standalone Testing Matrix & Domain Refactoring

## 1. Overview
This track implements an automated testing matrix for Standalone Mode (`window.navigator.standalone = true` and `display-mode: standalone`) on iOS WebKit without requiring physical iOS hardware or macOS simulator licensing. It verifies transient user gesture preservation for launching external turn-by-turn Navigation Providers (Google Maps, Apple Maps, Waze), enforces install banner suppression in Standalone Mode, and refactors trip navigation handlers to adhere to the canonical domain model (`CONTEXT.md` and ADR 0006).

All feature implementations in Phase 1 and Phase 2 strictly adhere to the repository's **TDD Task Granularity Invariant** (`AGENTS.md`), executing in sequential Red (`test(...)`) and Green (`feat(...)`) phases.

## 2. Functional Requirements

### 2.1 Domain & Hook Refactoring (`useTripActions`)
- Export canonical `handleTripNavigation(provider: NavigationProvider = 'google')` from `hooks/use-trip-actions.ts`.
- Retain `handleExportToMaps` as a `@deprecated` backward-compatible alias delegating directly to `handleTripNavigation`.
- Update `components/trip-card.tsx` and `components/trip-card-simple.tsx` to bind both `onNavigateTrip={handleTripNavigation || handleExportToMaps}` and `onExportToMaps={handleExportToMaps || handleTripNavigation}`.
- Update `components/TripCardPresentational.tsx` and `components/TripCardSimplePresentational.tsx` to accept `onNavigateTrip?: (provider: NavigationProvider) => void` with fallback to `onExportToMaps?: (provider?: NavigationProvider) => void`, invoking `const onNavigate = onNavigateTrip || onExportToMaps`.
- Maintain synchronous invocation of `launchTripNavigation(provider, trip.wineries)` preserving transient user gesture activation.

### 2.2 Hook & Component Invariants in Standalone Mode
- `hooks/use-pwa.ts`:
  - Enforce strict boolean casting for `isStandalone`: `Boolean(typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone || document.referrer.includes('android-app://')))`.
  - Enforce Standalone Installability Invariant: `isInstallable: !isStandalone && !!installPrompt` (preventing install prompts from ever becoming active when already running in Standalone Mode).
  - Maintain static evaluation during initialization without unnecessary runtime event listeners.
- `components/pwa-handler.tsx`:
  - Maintain defense-in-depth guard `if (!isInstallable || isStandalone || isDismissed) return null;` ensuring install banners are never rendered when running in Standalone Mode.
- `components/nav/user-nav.tsx`:
  - Verify that the `"Install App"` / `"Add to Home Screen"` dropdown menu item is hidden when `isStandalone === true`.

### 2.3 Unit & Component Testing (Jest / JSDOM - TDD Red/Green Protocol)
- `hooks/__tests__/use-pwa.test.ts`: Create a comprehensive test suite verifying `usePwa` under:
  - Browser Mode: `standalone: false`, `display-mode: browser` -> `isStandalone: false`, `isInstallable: true` (when prompt present).
  - Standalone Mode (iOS WebClip signal): `(window.navigator as any).standalone = true` -> `isStandalone: true`, `isInstallable: false`.
  - Standalone Mode (W3C matchMedia signal): `window.matchMedia('(display-mode: standalone)').matches = true` -> `isStandalone: true`, `isInstallable: false`.
  - Standalone Mode (Android referrer signal): `document.referrer.includes('android-app://')` -> `isStandalone: true`, `isInstallable: false`.
- `components/__tests__/PwaHandler.test.tsx`: Verify install UI suppression when `isStandalone === true`.
- `components/nav/__tests__/user-nav.test.tsx`: Explicitly assert `"Install App"` / `"Add to Home Screen"` item visibility in Browser Mode and suppression in Standalone Mode.
- `hooks/__tests__/use-trip-actions.test.ts`: Assert synchronous dispatch of canonical `handleTripNavigation` and `@deprecated` alias `handleExportToMaps` for Apple Maps, Google Maps, and Waze.
- `components/__tests__/trip-card-simple.test.tsx`: Verify container delegation to presentational card for both `onNavigateTrip` and legacy `onExportToMaps`.

### 2.4 Playwright E2E Testing (Containerized Mobile Safari / WebKit)
- In `e2e/fixtures/`:
  - Provide `enableStandaloneMode(page: Page)` helper in `e2e/fixtures/shims/browser.shim.ts` (or `e2e/fixtures/utils/standalone.ts`) injecting `window.navigator.standalone = true` and `matchMedia('(display-mode: standalone)')` via `page.addInitScript`.
  - Provide `standalonePage` test fixture in `e2e/fixtures/index.ts` (re-exported via `e2e/utils.ts`) that applies `enableStandaloneMode` prior to page navigation.
- Create `e2e/trip-navigation-pwa.spec.ts` under the `Mobile Safari` project:
  - Intercept external navigation domains (`*maps.apple.com*`, `*google.com/maps*`, `*waze.com*`) via `page.context().route(...)` to fulfill immediately with status 204/200, preventing DNS timeouts in isolated containers.
  - Pre-seed a trip with winery stops in `mockMaps.state.trips` to ensure the Trip Navigation button is active.
  - Assert that clicking Apple Maps, Google Maps, or Waze emits `page.waitForEvent('popup')`.
  - Assert that the popup URL contains the expected query parameters and destination.
  - Verify that WebKit does not block popup execution due to lost user activation, and close the popup (`await popup.close()`).
- Update `e2e/pwa-install-layout.spec.ts`:
  - Use `enableStandaloneMode(page)` to assert install banners/cards remain completely hidden in Standalone Mode across both mobile and desktop viewports.

## 3. Non-Functional Requirements
- **TDD Rigor:** All features in Phases 1 and 2 must execute via strict Red/Green task pairs committed as `test(...)` and `feat(...)` respectively.
- **Container Isolation & Host Compatibility:** All unit tests must execute via `./scripts/containers/run-jest-container.sh` and E2E tests via `./scripts/containers/run-e2e-container.sh mobile-safari` on RHEL 8 without external network dependencies.
- **Zero Flakiness:** All popup and DOM assertions must utilize auto-retrying Playwright locators, route interception, and deterministic event listeners.
- **Backwards Compatibility:** Full preservation of legacy `handleExportToMaps` and `onExportToMaps` symbols to prevent regression across consumer components and test mocks.

## 4. Acceptance Criteria
- [ ] `hooks/__tests__/use-pwa.test.ts` passes with 100% boundary coverage across all Standalone Mode signals.
- [ ] `components/__tests__/PwaHandler.test.tsx` and `components/nav/__tests__/user-nav.test.tsx` pass with standalone suppression assertions.
- [ ] `hooks/use-trip-actions.ts` exports canonical `handleTripNavigation` with `@deprecated` alias `handleExportToMaps`.
- [ ] `components/trip-card.tsx` and `components/trip-card-simple.tsx` bind `onNavigateTrip` and `onExportToMaps`.
- [ ] `e2e/fixtures/` exports `standalonePage` fixture and `enableStandaloneMode` helper.
- [ ] `e2e/trip-navigation-pwa.spec.ts` passes under containerized Mobile Safari (`./scripts/containers/run-e2e-container.sh mobile-safari e2e/trip-navigation-pwa.spec.ts`).
- [ ] `e2e/pwa-install-layout.spec.ts` passes under containerized Mobile Safari and WebKit.
- [ ] `npm run type-check` and `npm run lint` report 0 errors.
- [ ] All 141+ existing test suites continue to pass without regressions.

## 5. Out of Scope
- Physical iOS device automation or Apple Appium Springboard automation.
- Cloud device farm integrations (BrowserStack / SauceLabs).
- Push notification handling in iOS 16.4+ WebClips.
