# Specification: Runtime Invariant Protection & Branded ID Ergonomics (PR 1 / Issue #53)

## 1. Overview
Fast-tracked hardening track addressing [GitHub Issue #53](https://github.com/jarredb9/finger-lakes-app-57/issues/53) as part of parent Epic #52 (TypeScript Code Health & Remediation Roadmap). Focuses exclusively on Priority 1 (P1) findings from the proposal ([conductor/proposals/Typescript-Code-Health-ANY.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/proposals/Typescript-Code-Health-ANY.md)). The objective is to eliminate active and latent runtime `TypeError` crashes and safeguard store state integrity without introducing breaking changes across client consumers.

---

## 2. Functional Requirements

### 2.1 Safe Type Guard Narrowing (`lib/utils/winery.ts`)
- Implement and export a robust type guard excluding arrays:
  ```typescript
  export function isRecord(val: unknown): val is Record<string, unknown> {
    return typeof val === 'object' && val !== null && !Array.isArray(val);
  }
  ```
- Update and export `isGoogleWinery`, `isMapMarkerRpc`, `isWineryDetailsRpc`, and `isRawDbWinery` signatures to accept `source: unknown` and ensure `isRecord(source)` is evaluated before applying the `'in'` operator or property checks.
- Refactor 20+ `(source as any)` assertions in `standardizeWineryData` to use structured narrowing or safe object property lookups.

### 2.2 Safe Opening Hours Property Navigation (`lib/utils/opening-hours.ts` & `lib/types.ts`)
- Update `OpeningHoursPoint` and export `OpeningHoursPeriod` in `lib/types.ts` accommodating both Google Places `{ day, time }` and numeric `{ day, hour, minute }` schemas:
  ```typescript
  export interface OpeningHoursPoint {
    day: number;
    hour?: number;
    minute?: number;
    time?: string;
  }

  export interface OpeningHoursPeriod {
    open?: OpeningHoursPoint;
    close?: OpeningHoursPoint | null;
  }
  ```
- Implement safe defensive handling in `parseTime(point?: OpeningHoursPoint | null)`: return `NaN` when `point` is nullish or malformed.
- Require `period?.open` and `period?.close` checks before invoking `parseTime` in loop iterations, preventing unhandled `TypeError` crashes.
- Eliminate the 7 `// @ts-ignore` comments in `lib/utils/__tests__/opening-hours.test.ts` as types now cleanly align with test payloads.

### 2.3 Branded ID Constructors & Guards (`lib/types.ts`)
- Export type guards for branded types:
  ```typescript
  export function isGooglePlaceId(val: unknown): val is GooglePlaceId {
    return typeof val === 'string' && val.trim().length > 0;
  }

  export function isWineryDbId(val: unknown): val is WineryDbId {
    return typeof val === 'number' && Number.isInteger(val) && val > 0;
  }
  ```
- Export constructors with dev-mode validation warnings and nullable function overloads while guaranteeing non-throwing resilience in production:
  ```typescript
  export function toGooglePlaceId(id: string): GooglePlaceId;
  export function toGooglePlaceId(id: string | null | undefined): GooglePlaceId | undefined;
  export function toGooglePlaceId(id?: string | null): GooglePlaceId | undefined {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[toGooglePlaceId] Warning: Invalid GooglePlaceId received:`, id);
      }
      return id as unknown as GooglePlaceId;
    }
    return id as GooglePlaceId;
  }

  export function toWineryDbId(id: number): WineryDbId;
  export function toWineryDbId(id: number | null | undefined): WineryDbId | undefined;
  export function toWineryDbId(id?: number | null): WineryDbId | undefined {
    if (typeof id !== 'number' || isNaN(id) || id <= 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[toWineryDbId] Warning: Invalid WineryDbId received:`, id);
      }
      return id as unknown as WineryDbId;
    }
    return id as WineryDbId;
  }
  ```

### 2.4 Strict Zustand Mutation State Merges (`lib/stores/slices/tripMutationHelpers.ts` & `lib/stores/slices/tripDataSlice.ts`)
- In accordance with the PostgreSQL `trips` schema (`id`, `user_id`, `name`, `trip_date`, `created_at`, `updated_at`, `idempotency_key`), define strict input interface `TripUpdateInput`:
  ```typescript
  export interface TripUpdateInput {
    name?: string;
    trip_date?: string;
  }
  ```
  *(Note: `notes` belongs exclusively to `trip_wineries`, and winery ordering/removal are handled by dedicated helpers `updateWineryOrderHelper` and `removeWineryFromTripHelper`).*
- Update `updateTripHelper(get, set, tripId, updates: TripUpdateInput)` in `lib/stores/slices/tripMutationHelpers.ts` with runtime key whitelisting: only permit `name` and `trip_date`, log dev warnings for unpermitted keys, and prevent arbitrary field leakage into state or DB payloads.
- Update `TripDataSlice.updateTrip` in `lib/stores/slices/tripDataSlice.ts` to accept `TripUpdateInput` to preserve compile-time integrity across store slices.

### 2.5 Branded ID Adoption in Sync Service (`lib/services/syncService.ts`)
- Replace `as any` casts for winery IDs (e.g. lines 313-314, 559-560, and 572-573) with `toGooglePlaceId(...)` and `toWineryDbId(...)`.

---

## 3. Non-Functional Requirements & Performance
- **Zero Runtime Overhead:** Constructors and guards maintain lightweight overhead during batch winery processing.
- **Fail-Safe Resilience:** No unhandled runtime exceptions thrown in production when ingesting malformed or legacy cached data.
- **Strict Compilation:** Passes `npm run type-check` with zero diagnostic errors.

---

## 4. Out of Scope (Deferred to Future Tracks)
- Offline crypto payload typing (`encrypt`/`decrypt<T>`, `DLQEntry`, `SyncMutationPayload`) — deferred to PR 2 (Issue #54).
- Zustand store state typing (`friendStore`, `userStore`, `uiStore`) — deferred to PR 2.
- Supabase SQL RPC migrations (`RETURNS TABLE`) & Mapbox source typing — deferred to PR 3.
- Component prop cleanups and catch clause migrations (`catch (err: any)`) — deferred to PR 4.
- Test mock stubs (`({ children, ...props }: any)`) — categorized as low-ROI / leave as-is.

---

## 5. Acceptance Criteria
- [ ] `lib/utils/winery.ts` type guards safely handle `null`, `undefined`, and primitives without throwing `TypeError`.
- [ ] 20+ `(source as any)` assertions in `lib/utils/winery.ts` are eliminated or replaced with typed narrowing.
- [ ] `lib/utils/opening-hours.ts` safely navigates malformed `firstPeriod` and periods without throwing `TypeError`.
- [ ] `OpeningHoursPoint` and `OpeningHoursPeriod` in `lib/types.ts` eliminate all 7 `// @ts-ignore` comments in `lib/utils/__tests__/opening-hours.test.ts`.
- [ ] `toGooglePlaceId` and `toWineryDbId` constructors and type guards are exported from `lib/types.ts` with nullable overloads.
- [ ] `updateTripHelper` strictly types `updates` parameter using `TripUpdateInput` and sanitizes input properties at runtime.
- [ ] `TripDataSlice.updateTrip` in `lib/stores/slices/tripDataSlice.ts` is updated to accept `TripUpdateInput`.
- [ ] `syncService.ts` replaces winery ID `as any` casts with branded ID constructors.
- [ ] Dedicated unit regression tests added for all updated type guards, constructors, and opening hours utility.
- [ ] Automated tests pass in container (`npm run test:container`) and `npm run type-check` succeeds with 0 errors.
- [ ] Purely scaffolding/scratch tests created during this track are cleaned up to ensure a pristine test suite.

