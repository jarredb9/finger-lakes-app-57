# Specification: Runtime Invariant Protection & Branded ID Ergonomics (PR 1 / Issue #53)

## 1. Overview
Fast-tracked hardening track addressing [GitHub Issue #53](https://github.com/jarredb9/finger-lakes-app-57/issues/53) as part of parent Epic #52 (TypeScript Code Health & Remediation Roadmap). Focuses exclusively on Priority 1 (P1) findings from the proposal ([conductor/proposals/Typescript-Code-Health-ANY.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/proposals/Typescript-Code-Health-ANY.md)). The objective is to eliminate active and latent runtime `TypeError` crashes and safeguard store state integrity without introducing breaking changes across client consumers.

---

## 1.1 Invariant Architecture & Planning Directives (Mandatory for Planning Agents)

All agents generating task plans or implementing changes across this track MUST follow these four core invariants to prevent shallow refactoring:

1. **No Compiler-Silencing Type Assertions (`as TargetType`):**
   - Eliminating `as any` does **not** mean replacing it with `as Record<string, any>` or `as TargetType`.
   - At runtime ingestion boundaries (external APIs, RPCs, IndexedDB, store mutation inputs), types MUST be narrowed through runtime guards (`isRecord`, `Array.isArray`, `typeof === 'string'`) or validated constructors (`toGooglePlaceId`, `toWineryDbId`).
   - If an input fails validation, it must be rejected (`return null`) or sanitized to a safe fallback (`null`, default value), not force-cast.

2. **Adversarial Red-Phase Testing Requirements:**
   - Red-phase tests MUST NOT test only happy paths and basic `null`/`undefined` inputs.
   - Every Red-phase test plan must include **adversarial test cases**:
     - Explicit `undefined` properties (e.g. `{ place_id: undefined }`) to catch false positives in `'key' in object` checks.
     - Whitespace-only strings (`'   '`) and empty strings for nominal IDs.
     - Primitive values passed where records/arrays are expected (e.g. `parking_options: "free"`).
     - Extraneous / unwhitelisted keys passed into mutation inputs.
     - Non-integer numbers or `NaN` where database sequence IDs are expected.
     - Unparseable date strings causing `NaN` in timestamp calculations.

3. **End-to-End Invariant Continuity:**
   - Once a branded constructor or guard is introduced (e.g. `toGooglePlaceId`, `toWineryDbId`, `isRecord`), subsequent tasks MUST actively use it when normalizing IDs or shapes across the module. Do not leave legacy raw type assertions (`as GooglePlaceId`) in place.

4. **Runtime Mutation Whitelisting (Not Compile-Time Only):**
   - For store mutation hardening (Phase 3), defining a TypeScript interface (e.g. `TripUpdateInput`) is necessary but insufficient.
   - State mutation helpers MUST actively sanitize input payloads at runtime (e.g. via key allowlists like `ALLOWED_KEYS = ['name', 'trip_date']`) before spreading into state or passing to database RPCs, logging dev-mode warnings for stripped keys.

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

### 2.2 Winery Standardizer Branded IDs & Deep Invariant Protections (`lib/utils/winery.ts`)
- **Branded ID Constructor Adoption:** Replace raw `as GooglePlaceId` and `as WineryDbId` assertions in `standardizeWineryData` with nominal branded constructors `toGooglePlaceId(rawGoogleId)` and `toWineryDbId(resolvedDbId)`. Halt and return `null` if `!googleId || !isGooglePlaceId(googleId)` to prevent empty/whitespace strings (`"   "`) from polluting local and persistent stores.
- **Strict Type Guard Verification:**
  - Tighten `isGoogleWinery` to require `typeof source.place_id === 'string' && source.place_id.trim().length > 0 && isRecord(source.geometry)` (preventing false positives on `{ place_id: undefined }`).
  - Tighten `isMapMarkerRpc` and `isWineryDetailsRpc` to enforce `isGooglePlaceId(source.google_place_id) || (typeof source.id === 'string' && source.id.trim().length > 0)`.
- **Primitive Sanitization on Store Dictionaries:** Enforce `isRecord` validation on `parking_options` and `accessibility_options` before assignment or merging to prevent raw primitive strings/numbers from leaking into store state.
- **Domain Union Validation for Enrichment Tier:** Validate `incomingTier` against canonical domain values `['basic', 'enriched', 'full']` (defined in `CONTEXT.md`), falling back to `existingTier || 'basic'` on unvetted strings.
- **Defensive Review Timestamp Parsing:** Guard timestamp conversion in `parseReviewsJson` against `NaN` from invalid `publishTime` inputs.

### 2.3 Safe Opening Hours Property Navigation (`lib/utils/opening-hours.ts` & `lib/types.ts`)
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
- **Planning Watch-Outs for Opening Hours (Mandatory for Agent):**
  - *24/7 Establishments:* A period may specify `open` without a `close` point (e.g. open 24 hours). The loop must safely navigate optional `close`.
  - *Malformed Point Objects:* `parseTime` must safely return `NaN` on empty objects `{}` or points with missing/invalid `time`, `hour`, or `minute` without throwing uncaught exceptions.
  - *Defensive Comparison:* Callers must verify `!isNaN(...)` before using parsed timestamps in arithmetic or interval checks.
  - *No Type Assertions:* Prohibit `(period as any)` or `(point as any)`.

### 2.4 Branded ID Constructors & Guards (`lib/types.ts`)
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

### 2.5 Strict Zustand Mutation State Merges (`lib/stores/slices/tripMutationHelpers.ts` & `lib/stores/slices/tripDataSlice.ts`)
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
- **Planning Watch-Outs for Zustand Mutations (Mandatory for Agent):**
  - *Runtime Key Whitelisting:* Do not simply do `{ ...existingTrip, ...updates }`. Filter incoming keys against an explicit whitelist (`['name', 'trip_date']`) at runtime.
  - *Prevent Field Leakage:* Arbitrary, injected, or unpermitted fields (e.g. `user_id`, `id`, `created_at`, `notes`) must be stripped and logged via `console.warn` in dev mode.
  - *Type and Value Validation:* Verify `name` is a string (if defined) and `trip_date` is a valid date string (if defined) before committing to store state.

### 2.6 Branded ID Adoption in Sync Service (`lib/services/syncService.ts`)
- Replace `as any` casts for winery IDs (e.g. lines 313-314, 559-560, and 572-573) with `toGooglePlaceId(...)` and `toWineryDbId(...)`.

### 2.7 Gold-Standard Structural Boundary Parsers & Domain Amenity Interfaces (`lib/types.ts` & `lib/utils/winery.ts`)
- Define strongly-typed closed domain interfaces `ParkingOptions` and `AccessibilityOptions` in `lib/types.ts` capturing known Google Places boolean flags (`freeParkingLot`, `wheelchairAccessibleParking`, etc.) and synthesized convenience attributes (`freeParking`).
- Update `Winery.parking_options` and `Winery.accessibility_options` to use `ParkingOptions | null` and `AccessibilityOptions | null`, eliminating `Record<string, any>`.
- Implement gold-standard parsers in `lib/utils/winery.ts` with zero `as` assertions:
  - `parseOpeningHoursJson(json: unknown): OpeningHours | null | undefined`: Resilient period filtering that drops corrupt period objects, validates `day` (0-6) and time points, filters `weekday_text` for string elements, and returns clean typed `OpeningHours`.
  - `parseParkingOptionsJson(json: unknown): ParkingOptions | null`: Validates `isRecord`, extracts known boolean flags, synthesizes `freeParking`, and returns `null` if no recognized flags are present.
  - `parseAccessibilityOptionsJson(json: unknown): AccessibilityOptions | null`: Validates `isRecord`, extracts known boolean flags, and returns `null` if no recognized flags are present.
- Strengthen RPC type guards (`isGoogleWinery`, `isMapMarkerRpc`, `isWineryDetailsRpc`, `isRawDbWinery`): require string `name`, valid coordinates, and non-empty IDs.
- Collapse redundant `toGooglePlaceId` and `toWineryDbId` overload signatures in `lib/types.ts` into single nullable signatures.

### 2.8 Sync Service Error Routing to DLQ & Cast Cleanup (`lib/services/syncService.ts`)
- Unify error handling for privacy toggle mutations (`toggle_favorite_privacy`, `toggle_wishlist_privacy`): when `payload.wineryDbId` fails `toWineryDbId` validation, route immediately to DLQ as a permanent 400 validation failure and remove from queue, preventing silent mutation drops.
- Clean up redundant `(item as any)` casts accessing `nextRetryAt` and `createdAt` now that they are natively declared on `SyncItem`.

### 2.9 Runtime Mutation Allowlisting for Trip Creation (`lib/stores/slices/tripMutationHelpers.ts`)
- Mirror `updateTripHelper` in `createTripHelper`: enforce `ALLOWED_CREATE_TRIP_KEYS = ['name', 'trip_date', 'wineries']`, strip injected keys (`id`, `user_id`, `created_at`) with dev-mode warnings, and validate `name` (string) and `trip_date` (valid date string falling back to `getTodayLocal()`).

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
- [ ] `standardizeWineryData` adopts `toGooglePlaceId` and `toWineryDbId` and rejects invalid/whitespace IDs (`return null`).
- [ ] `isGoogleWinery`, `isMapMarkerRpc`, and `isWineryDetailsRpc` enforce non-empty string IDs and object geometries.
- [ ] `parking_options` and `accessibility_options` are sanitized with `isRecord` to prevent primitive leakage.
- [ ] `enrichment_tier` validates against canonical domain values `['basic', 'enriched', 'full']`.
- [ ] `lib/utils/opening-hours.ts` safely navigates malformed `firstPeriod` and periods without throwing `TypeError`.
- [ ] `OpeningHoursPoint` and `OpeningHoursPeriod` in `lib/types.ts` eliminate all 7 `// @ts-ignore` comments in `lib/utils/__tests__/opening-hours.test.ts`.
- [ ] `toGooglePlaceId` and `toWineryDbId` constructors and type guards are exported from `lib/types.ts` with nullable overloads.
- [ ] `updateTripHelper` strictly types `updates` parameter using `TripUpdateInput` and sanitizes input properties at runtime.
- [ ] `TripDataSlice.updateTrip` in `lib/stores/slices/tripDataSlice.ts` is updated to accept `TripUpdateInput`.
- [ ] `syncService.ts` replaces winery ID `as any` casts with branded ID constructors.
- [ ] Dedicated unit regression tests added for all updated type guards, constructors, and opening hours utility.
- [ ] Automated tests pass in container (`npm run test:container`) and `npm run type-check` succeeds with 0 errors.
- [ ] Purely scaffolding/scratch tests created during this track are cleaned up to ensure a pristine test suite.
- [ ] `parseOpeningHoursJson` performs resilient period and weekday parsing with 0 `as` assertions.
- [ ] `ParkingOptions` and `AccessibilityOptions` domain interfaces defined and applied to `Winery` in `lib/types.ts`.
- [ ] `parseParkingOptionsJson` and `parseAccessibilityOptionsJson` implemented with zero `as` assertions in `lib/utils/winery.ts`.
- [ ] Missing/invalid `wineryDbId` on privacy mutations in `syncService.ts` routes to DLQ as permanent 400 error.
- [ ] Residual `(item as any)` casts on `SyncItem` fields (`nextRetryAt`, `createdAt`) are eliminated.
- [ ] `createTripHelper` enforces runtime key allowlisting and dev warnings on stripped properties.

