# Task Plan: Issue #63 - Trip Navigation on iOS PWA

## 1. Problem Diagnosis
- On iOS standalone PWA, triggering `navigator.geolocation.getCurrentPosition` synchronously or within an async event chain causes WebKit to revoke transient user gesture activation. As a consequence, subsequent `window.open()` calls or deep-link navigation URLs are blocked by iOS popup blockers, leaving the navigation trigger in a permanently disabled/loading state.
- Furthermore, both Apple Maps and Google Maps natively default their origin (`saddr` or `origin`) to the device's real-time GPS position ("Current Location") when no explicit origin coordinate is passed. Requesting in-app geolocation prior to launching Trip Navigation is redundant, error-prone, and destroys the user activation token on iOS.
- Missing interactive provider selector: Trip Navigation should allow users on mobile or desktop to explicitly choose between Google Maps, Apple Maps, or Waze, with proper deep links and fallbacks to native app schemes, web routes, or app store listings.

## 2. Invariants & Architecture Compliance
- **Domain Model (CONTEXT.md)**: Strictly utilize canonical terminology (`Trip Navigation`, `Trip Stop`, `Trip`, `Winery`). Strictly avoid forbidden terms (`maps export`, `trip export`, `route export`).
- **Component Boundary Isolation**: Do not touch `components/MapNavigation.tsx` (which is dedicated exclusively to single-winery directions). Multi-stop trip guidance must reside in a dedicated `components/TripNavigation.tsx` and utility `lib/utils/trip-navigation.ts`.
- **Test Harness Mocks (AGENTS.md)**: `window.location` in JSDOM is non-configurable; do not attempt `Object.defineProperty(window, 'location', ...)`. Navigation launcher utilities must take an injectable window or navigation execution callback for deterministic testing.
- **React 19 / Next.js 16**: No redundant `import React from 'react'` in tests or components.

## 3. Implementation Steps

### Task 1: Trip Navigation URL & Deep Link Generator (TDD Red phase)
- Target: `lib/utils/__tests__/trip-navigation.test.ts`
- Author unit tests verifying multi-stop Trip Navigation URL generation for:
  - Apple Maps (`maps://` or `https://maps.apple.com/` with destination and waypoints without requiring upfront in-app geolocation)
  - Google Maps (`https://www.google.com/maps/dir/?api=1` with `destination` and piped `waypoints`)
  - Waze (first or next stop destination routing)
  - OS / PWA detection utilities (`isIOS`, `isStandalonePWA`)
  - Immediate, synchronous launch execution without async geolocation delays

### Task 2: Trip Navigation Utilities (TDD Green phase)
- Target: `lib/utils/trip-navigation.ts`
- Implement:
  - `getTripNavigationUrls(tripStops: TripStopWinery[])`: Returns structured deep links and web fallbacks for Apple Maps, Google Maps, and Waze.
  - `launchTripNavigation(provider: NavigationProvider, tripStops: TripStopWinery[], options?: { navigateFn?: (url: string) => void })`: Directly opens the selected map application without asynchronous permission delays.
  - Safe fallback mechanisms if a provider app is not installed.

### Task 3: TripNavigation Modal Component (TDD Red phase)
- Target: `components/__tests__/TripNavigation.test.tsx`
- Author component tests covering:
  - Renders provider choices (Apple Maps, Google Maps, Waze).
  - Selecting a provider immediately executes navigation launch.
  - Handles empty or single-stop trips gracefully with informative tooltips or disabled state.
  - Resets active state if navigation modal is dismissed or completed (prevents sticky disabled button state).

### Task 4: TripNavigation Component (TDD Green phase)
- Target: `components/TripNavigation.tsx`
- Implement dialog/sheet UI presenting Apple Maps, Google Maps, and Waze options with icons and provider badges.
- Ensure button states gracefully reset and dismiss upon selection.

### Task 5: Integrate Trip Navigation into Trip Detail View (TDD Red & Green phase)
- Targets:
  - `app/trips/[id]/__tests__/client-page.test.tsx`
  - `app/trips/[id]/client-page.tsx`
- Replace legacy export/navigation triggers with `TripNavigation`.
- Validate that launching Trip Navigation from iOS PWA environments succeeds without prompting for redundant browser geolocation or disabling the UI.

## 4. Verification
- Run `./scripts/run-jest-container.sh lib/utils/__tests__/trip-navigation.test.ts components/__tests__/TripNavigation.test.tsx app/trips/[id]/__tests__/client-page.test.tsx`.
- Run `./scripts/run-build-container.sh` to ensure type-check and SWC bundle pass without regressions.