# Plan: Fix Trip Navigation on iOS PWA

## 1. Problem Analysis & Root Cause
In Issue #63, triggering Trip Navigation on mobile iOS PWA causes a prompt for device location access, followed by failure to launch external navigation, leaving the launch button permanently disabled.

### Root Causes:
1. **User Gesture Token Loss via Async Geolocation:** In WebKit / iOS Safari (especially in standalone PWA mode), invoking `navigator.geolocation.getCurrentPosition()` is an asynchronous operation. By the time the geolocation callback resolves, the user gesture activation window has expired. Attempting `window.open()` or protocol navigation after this callback triggers Safari's popup blocker or fails silently.
2. **Unnecessary Geolocation Latency:** Navigation providers (Google Maps, Apple Maps, and Waze) natively default the trip origin to the user's current location when no explicit origin coordinates are passed. Blocking navigation on a new GPS fix is unnecessary.
3. **iOS Standalone PWA Link Handling:** Standalone PWAs on iOS do not handle standard `window.open(..., '_blank')` calls reliably; they require direct window navigation (`window.location.assign` or `window.location.href`) or universal/protocol links to hand off to native apps.
4. **Unreset Loading State:** An error or lost execution in the navigation flow leaves loading flags set to `true`, permanently disabling the button.
5. **Provider Choice Missing:** Expected behavior requires prompting users to choose between **Google Maps**, **Apple Maps**, or **Waze**, with fallback mechanisms to app store links if uninstalled.

---

## 2. Technical Architecture & Invariants
- **Domain Model Compliance:** Use `Trip Navigation` terminology throughout UI and code comments (avoid "maps export" or "route export").
- **Provider Support:**
  - **Apple Maps:** `maps://?daddr=...` (or `https://maps.apple.com/?daddr=...`). Multiple stops supported via sequential waypoints where applicable.
  - **Google Maps:** `https://www.google.com/maps/dir/?api=1&destination=...&waypoints=...` or `comgooglemaps://`.
  - **Waze:** `https://waze.com/ul?ll=lat,lng&navigate=yes` (navigates to next/first stop).
- **Preserve User Gesture:** Provider selection occurs via a modal/action sheet. Clicking the provider icon immediately triggers navigation synchronously without waiting for fresh GPS location requests.
- **App Store Fallbacks:** Provide App Store (iOS) / Play Store (Android) fallback URLs if an app protocol fails or is specified by the user.
- **State Reset:** Ensure UI state resets properly with try/finally blocks and a short debounce.

---

## 3. Implementation Steps

### Phase 1: Test-Driven URL & Provider Logic (`lib/utils/map-utils.ts`)
- **Task 1 (TDD Red):** Add unit tests in `lib/utils/__tests__/map-utils.test.ts` for:
  - Building turn-by-turn navigation URLs for Google Maps, Apple Maps, and Waze from an array of `TripStop`s.
  - Omitting origin to allow native apps to route from current GPS position.
  - Detecting iOS standalone PWA environment.
  - Fallback store URLs for iOS and Android.
- **Task 2 (TDD Green):** Implement helper functions in `lib/utils/map-utils.ts`:
  - `getTripNavigationUrl(provider, stops, userLocation?)`
  - `getAppStoreUrl(provider, platform)`
  - `launchTripNavigation(provider, stops, options)`

### Phase 2: Trip Navigation Component Update (`components/MapNavigation.tsx`)
- **Task 3 (TDD Red):** Add tests in `components/__tests__/MapNavigation.test.tsx` verifying:
  - Dialog / Sheet opens presenting Google Maps, Apple Maps, and Waze options.
  - Provider button immediately invokes navigation launch synchronously.
  - Export button does not remain disabled if modal closes or after launching.
  - Works gracefully when geolocation is not provided.
- **Task 4 (TDD Green):** Refactor `components/MapNavigation.tsx`:
  - Replace direct blocking geolocation lookup with immediate provider picker modal.
  - Support Google Maps, Apple Maps, and Waze.
  - Implement safe protocol / universal link launching for iOS PWA standalone mode.
  - Ensure button disabled states reset in `finally`.

### Phase 3: Integration & Verification
- Run container unit tests: `./scripts/run-jest-container.sh components/__tests__/MapNavigation.test.tsx lib/utils/__tests__/map-utils.test.ts`
- Verify TypeScript compliance: `npm run db:check-types:local`
- Verify no regression in trip planning views.