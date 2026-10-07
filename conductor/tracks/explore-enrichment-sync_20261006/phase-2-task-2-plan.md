# Implementation Plan: Phase 2 Task 2 - Synchronize TypeScript Types, E2E Fixtures, and `standardizeWineryData` (TDD)

**Track:** `explore-enrichment-sync_20261006` (Issue [#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44))  
**Phase:** 2 (Database Map Markers RPC Expansion, Type Synchronization & Fixture Hardening)  
**Task:** 2 (Synchronize TypeScript types, E2E fixtures, and `standardizeWineryData` (TDD))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Following the database marker RPC expansion in Phase 2 Task 1 (`public.get_map_markers` returning ratings, user rating count, Vibe Tag columns, and enrichment tier), synchronize the TypeScript type definitions, test fixtures, E2E network mocks, and the frontend standardizer (`standardizeWineryData`):
1. **TypeScript Parity:** Update `MapMarkerRpc` in `lib/types.ts` and `lib/database.types.ts` to reflect all 17 returned columns from `get_map_markers`, and add `db:gen-types` to `package.json`.
2. **Fixture Hardening:** Update `createMockMapMarkerRpc` in `lib/test-utils/fixtures.ts`, `MOCK_MARKERS` in `e2e/fixtures/utils/mock-wineries.ts`, and network route mocking in `e2e/fixtures/handlers/favorites.handler.ts` to include expanded marker columns.
3. **Tri-State Vibe Tag Handling (`standardizeWineryData`):** Implement `parseTriStateBoolean` in `lib/utils/winery.ts` and ensure `standardizeWineryData` preserves strict `boolean | null` for `allows_dogs`, `good_for_children`, `outdoor_seating`, `has_ev_charging`, and `serves_wine` (preventing coercion of `null` to `false`).
4. **Rating & Review Count Mapping:** Map `google_rating` and `user_rating_count` on `MapMarkerRpc` to `rating` and `userRatingCount` on the standardized winery entity.
5. **Ghost Visit Invariant:** Enforce that if a source reports `user_visited === false` or `userVisited === false`, the `visits` array is cleared.

### 1.2 Development Methodology: Strict TDD
- **Red Phase:**
  1. Update `MapMarkerRpc` in `lib/types.ts` and `lib/database.types.ts`.
  2. Add unit tests in `lib/utils/__tests__/winery.test.ts` asserting:
     - `standardizeWineryData` preserves `null` for un-enriched records with `allows_dogs: null`, `good_for_children: null`, `outdoor_seating: null`, `has_ev_charging: null`, and `serves_wine: null` (fails against current code which coerces `null` to `false`).
     - `standardizeWineryData` maps `google_rating` and `user_rating_count` from `MapMarkerRpc`.
     - `standardizeWineryData` prevents basic markers with `null` vibe tags from overwriting existing enriched vibe tags (`allows_dogs: true`).
     - `standardizeWineryData` clears existing visits when `user_visited === false` (ghost visit invariant).
  3. Run unit tests via `./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts` and verify failure (Red).
- **Green Phase:**
  1. Implement `parseTriStateBoolean` in `lib/utils/winery.ts`.
  2. Update `standardizeWineryData` in `lib/utils/winery.ts` to use `parseTriStateBoolean`, map `user_rating_count` for `MapMarkerRpc`, and enforce ghost visit clearing.
  3. Update `e2e/fixtures/handlers/favorites.handler.ts`, `e2e/fixtures/utils/mock-wineries.ts`, and `lib/test-utils/fixtures.ts`.
  4. Run unit tests via `./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts` and verify 100% green pass.
  5. Run typecheck via `npm run type-check`.
- **Refactor / Commit:** Commit changes following conventional commit syntax, record git notes summary, and update track plan.

---

## 2. Invariants & Critical Guardrails

1. **Production Database Safety (`AGENTS.md` Guardrail 1):**
   - Strictly zero mutations or migrations against the remote Supabase project (`jfsxclrdxmvftxacjuqf`).
2. **Container & Shell Execution Permissions (`AGENTS.md` Section 3):**
   - RHEL 8 glibc (2.28) is incompatible with Next.js 16.3+ native SWC. All Jest tests must run via the Podman container runner with `BypassSandbox: true`:
     - Command: `./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts`
   - Git mutation operations (`git add`, `git commit`, `git notes`) require `BypassSandbox: true`.
3. **Tri-State Vibe Tag Invariant (`spec.md` Section 3 & `CONTEXT.md`):**
   - Un-enriched wineries must retain `null` for `allows_dogs`, `good_for_children`, `outdoor_seating`, `has_ev_charging`, and `serves_wine`. They must NEVER be coerced to `false`.
   - Vibe tag filtering in downstream hooks (`use-winery-filter.ts`) strictly requires `=== true`, meaning un-enriched wineries with `null` are not falsely marked as "prohibiting dogs" or "prohibiting outdoor seating".
4. **Ghost Visit Invariant (`AGENTS.md` Section 4 & `spec.md` Section 3):**
   - If a source reports `user_visited: false`, clear the `visits` array in `standardizeWineryData` to prevent ghost visits from persisting in cache.
5. **No Scope Creep / Scoped Strictness (`spec.md` Section 93 & 111):**
   - Strictly avoid touching unrelated legacy types (e.g. `trip_info?: any` in `lib/types.ts` or test fuzz `as any` casts in other files). Changes are bounded strictly to the marker data synchronization seam.
6. **Modal Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - Execution must halt for explicit affirmative user confirmation via `ask_question` before modifying any codebase files.

---

## 3. Exact Code Blocks & Line Anchors

### 3.1 Target File 1: `package.json`

#### Edit 1: Add `db:gen-types` script
- **Line Anchor:** Line 41
- **Target Content:**
```json
    "db:check-types:local": "restorecon -RF ./supabase/functions && export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase gen types typescript --local --schema public > lib/database.types.tmp.ts && diff lib/database.types.ts lib/database.types.tmp.ts && rm lib/database.types.tmp.ts",
    "session:inspect": "node scripts/inspect-session.mjs",
```
- **Replacement Content:**
```json
    "db:check-types:local": "restorecon -RF ./supabase/functions && export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase gen types typescript --local --schema public > lib/database.types.tmp.ts && diff lib/database.types.ts lib/database.types.tmp.ts && rm lib/database.types.tmp.ts",
    "db:gen-types": "restorecon -RF ./supabase/functions && export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock && npx supabase gen types typescript --local --schema public > lib/database.types.ts",
    "session:inspect": "node scripts/inspect-session.mjs",
```

---

### 3.2 Target File 2: `lib/types.ts`

#### Edit 1: Expand `MapMarkerRpc` interface with rating, review count, Vibe Tag, and enrichment tier columns
- **Line Anchor:** Lines 45–60
- **Target Content:**
```typescript
// RPC Return Types
export interface MapMarkerRpc {
  id: WineryDbId;
  google_place_id: GooglePlaceId;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  is_favorite: boolean;
  on_wishlist: boolean;
  user_visited: boolean;
  is_favorite_private?: boolean;
  on_wishlist_private?: boolean;
  google_rating?: number | null;
  opening_hours?: Json | null;
  phone?: string | null;
}
```
- **Replacement Content:**
```typescript
// RPC Return Types
export interface MapMarkerRpc {
  id: WineryDbId;
  google_place_id: GooglePlaceId;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  is_favorite: boolean;
  on_wishlist: boolean;
  user_visited: boolean;
  is_favorite_private?: boolean;
  on_wishlist_private?: boolean;
  google_rating?: number | null;
  user_rating_count?: number | null;
  allows_dogs?: boolean | null;
  good_for_children?: boolean | null;
  outdoor_seating?: boolean | null;
  has_ev_charging?: boolean | null;
  enrichment_tier?: 'basic' | 'enriched' | 'full' | string | null;
  opening_hours?: Json | null;
  phone?: string | null;
}
```

---

### 3.3 Target File 3: `lib/database.types.ts`

#### Edit 1: Synchronize `get_map_markers` RPC return signature
- **Line Anchor:** Lines 718–732
- **Target Content:**
```typescript
      get_map_markers: {
        Args: { p_user_id?: string }
        Returns: {
          google_place_id: string
          id: number
          is_favorite: boolean
          is_favorite_private: boolean
          latitude: number
          longitude: number
          name: string
          on_wishlist: boolean
          on_wishlist_private: boolean
          user_visited: boolean
        }[]
      }
```
- **Replacement Content:**
```typescript
      get_map_markers: {
        Args: { p_user_id?: string }
        Returns: {
          allows_dogs: boolean | null
          enrichment_tier: string | null
          good_for_children: boolean | null
          google_place_id: string
          google_rating: number | null
          has_ev_charging: boolean | null
          id: number
          is_favorite: boolean
          is_favorite_private: boolean
          latitude: number
          longitude: number
          name: string
          on_wishlist: boolean
          on_wishlist_private: boolean
          outdoor_seating: boolean | null
          user_rating_count: number | null
          user_visited: boolean
        }[]
      }
```

---

### 3.4 Target File 4: `lib/test-utils/fixtures.ts`

#### Edit 1: Update `createMockMapMarkerRpc` with expanded columns
- **Line Anchor:** Lines 120–133
- **Target Content:**
```typescript
export const createMockMapMarkerRpc = (overrides: Partial<MapMarkerRpc> = {}): MapMarkerRpc => ({
  id: 1 as WineryDbId,
  google_place_id: 'ch-mock-winery-1' as GooglePlaceId,
  name: 'Mock Winery One',
  address: '123 Mockingbird Lane, Fakeville, FK 12345',
  latitude: 42.7,
  longitude: -76.9,
  is_favorite: false,
  on_wishlist: false,
  user_visited: false,
  is_favorite_private: false,
  on_wishlist_private: false,
  ...overrides,
});
```
- **Replacement Content:**
```typescript
export const createMockMapMarkerRpc = (overrides: Partial<MapMarkerRpc> = {}): MapMarkerRpc => ({
  id: 1 as WineryDbId,
  google_place_id: 'ch-mock-winery-1' as GooglePlaceId,
  name: 'Mock Winery One',
  address: '123 Mockingbird Lane, Fakeville, FK 12345',
  latitude: 42.7,
  longitude: -76.9,
  is_favorite: false,
  on_wishlist: false,
  user_visited: false,
  is_favorite_private: false,
  on_wishlist_private: false,
  google_rating: 4.8,
  user_rating_count: 125,
  allows_dogs: null,
  good_for_children: null,
  outdoor_seating: null,
  has_ev_charging: null,
  enrichment_tier: 'basic',
  ...overrides,
});
```

---

### 3.5 Target File 5: `e2e/fixtures/utils/mock-wineries.ts`

#### Edit 1: Expand `MOCK_MARKERS` fixture objects with realistic Vibe Tag and rating data
- **Line Anchor:** Lines 7–35
- **Target Content:**
```typescript
export const MOCK_MARKERS: MapMarkerRpc[] = [
  createMockMapMarkerRpc({
    id: 1 as WineryDbId,
    google_place_id: 'ch-12345-mock-winery-1' as GooglePlaceId,
    name: 'Mock Winery One',
    address: '123 Vineyard Way, NY',
    latitude: 42.5,
    longitude: -76.8,
    google_rating: 4.8,
  }),
  createMockMapMarkerRpc({
    id: 2 as WineryDbId,
    google_place_id: 'ch-67890-mock-winery-2' as GooglePlaceId,
    name: 'Vineyard of Illusion',
    address: '456 Mirage Ln, NY',
    latitude: 42.6,
    longitude: -76.9,
    google_rating: 4.7,
  }),
  createMockMapMarkerRpc({
    id: 3 as WineryDbId,
    google_place_id: 'ch-abcde-mock-winery-3' as GooglePlaceId,
    name: 'The Phantom Cellar',
    address: '789 Ethereal Rd, NY',
    latitude: 42.7,
    longitude: -77.0,
    google_rating: 4.9,
  }),
];
```
- **Replacement Content:**
```typescript
export const MOCK_MARKERS: MapMarkerRpc[] = [
  createMockMapMarkerRpc({
    id: 1 as WineryDbId,
    google_place_id: 'ch-12345-mock-winery-1' as GooglePlaceId,
    name: 'Mock Winery One',
    address: '123 Vineyard Way, NY',
    latitude: 42.5,
    longitude: -76.8,
    google_rating: 4.8,
    user_rating_count: 120,
    allows_dogs: true,
    good_for_children: false,
    outdoor_seating: true,
    has_ev_charging: false,
    enrichment_tier: 'enriched',
  }),
  createMockMapMarkerRpc({
    id: 2 as WineryDbId,
    google_place_id: 'ch-67890-mock-winery-2' as GooglePlaceId,
    name: 'Vineyard of Illusion',
    address: '456 Mirage Ln, NY',
    latitude: 42.6,
    longitude: -76.9,
    google_rating: 4.7,
    user_rating_count: 85,
    allows_dogs: null,
    good_for_children: null,
    outdoor_seating: null,
    has_ev_charging: null,
    enrichment_tier: 'basic',
  }),
  createMockMapMarkerRpc({
    id: 3 as WineryDbId,
    google_place_id: 'ch-abcde-mock-winery-3' as GooglePlaceId,
    name: 'The Phantom Cellar',
    address: '789 Ethereal Rd, NY',
    latitude: 42.7,
    longitude: -77.0,
    google_rating: 4.9,
    user_rating_count: 210,
    allows_dogs: false,
    good_for_children: true,
    outdoor_seating: true,
    has_ev_charging: true,
    enrichment_tier: 'enriched',
  }),
];
```

---

### 3.6 Target File 6: `e2e/fixtures/handlers/favorites.handler.ts`

#### Edit 1: Include expanded marker columns in `dynamicMarkers`
- **Line Anchor:** Lines 148–158
- **Target Content:**
```typescript
        const dynamicMarkers = markers.map(m => {
          const keys = getEquivalentWineryIds(m.google_place_id || m.id, markers);
          return {
            ...m,
            is_favorite: !!(userFavorites && keys.some(k => userFavorites.has(k))),
            is_favorite_private: !!(userFavPriv && keys.some(k => userFavPriv.has(k))),
            on_wishlist: !!(userWishlist && keys.some(k => userWishlist.has(k))),
            on_wishlist_private: !!(userWishPriv && keys.some(k => userWishPriv.has(k))),
          };
        });
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(dynamicMarkers) });
```
- **Replacement Content:**
```typescript
        const dynamicMarkers = markers.map(m => {
          const keys = getEquivalentWineryIds(m.google_place_id || m.id, markers);
          return {
            ...m,
            is_favorite: !!(userFavorites && keys.some(k => userFavorites.has(k))),
            is_favorite_private: !!(userFavPriv && keys.some(k => userFavPriv.has(k))),
            on_wishlist: !!(userWishlist && keys.some(k => userWishlist.has(k))),
            on_wishlist_private: !!(userWishPriv && keys.some(k => userWishPriv.has(k))),
            google_rating: m.google_rating ?? 4.8,
            user_rating_count: m.user_rating_count ?? 125,
            allows_dogs: m.allows_dogs ?? null,
            good_for_children: m.good_for_children ?? null,
            outdoor_seating: m.outdoor_seating ?? null,
            has_ev_charging: m.has_ev_charging ?? null,
            enrichment_tier: m.enrichment_tier ?? 'basic',
          };
        });
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(dynamicMarkers) });
```

#### Edit 2: Include expanded columns in `get_winery_details_by_id` response
- **Line Anchor:** Lines 175–198
- **Target Content:**
```typescript
        const detail = {
          address: marker?.address || '123 Mock St',
          google_place_id: gId,
          google_rating: 4.5,
          id: wineryId || marker?.id || 12345,
          is_favorite: !!(userFavs && keys.some(k => userFavs.has(k))),
          is_favorite_private: !!(userFavPriv && keys.some(k => userFavPriv.has(k))),
          latitude: marker?.latitude || 42.7,
          longitude: marker?.longitude || -76.9,
          lat: marker?.latitude || 42.7,
          lng: marker?.longitude || -76.9,
          name: marker?.name || 'Mock Winery One',
          on_wishlist: !!(userWishs && keys.some(k => userWishs.has(k))),
          on_wishlist_private: !!(userWishPriv && keys.some(k => userWishPriv.has(k))),
          opening_hours: null,
          phone: '555-0123',
          reservable: false,
          reviews: [],
          trip_info: [],
          user_visited: false,
          visits: [],
          website: 'https://example.com',
        };
```
- **Replacement Content:**
```typescript
        const detail = {
          address: marker?.address || '123 Mock St',
          google_place_id: gId,
          google_rating: marker?.google_rating ?? 4.5,
          user_rating_count: marker?.user_rating_count ?? 100,
          id: wineryId || marker?.id || 12345,
          is_favorite: !!(userFavs && keys.some(k => userFavs.has(k))),
          is_favorite_private: !!(userFavPriv && keys.some(k => userFavPriv.has(k))),
          latitude: marker?.latitude || 42.7,
          longitude: marker?.longitude || -76.9,
          lat: marker?.latitude || 42.7,
          lng: marker?.longitude || -76.9,
          name: marker?.name || 'Mock Winery One',
          on_wishlist: !!(userWishs && keys.some(k => userWishs.has(k))),
          on_wishlist_private: !!(userWishPriv && keys.some(k => userWishPriv.has(k))),
          opening_hours: null,
          phone: '555-0123',
          reservable: false,
          reviews: [],
          trip_info: [],
          user_visited: false,
          visits: [],
          website: 'https://example.com',
          allows_dogs: marker?.allows_dogs ?? null,
          good_for_children: marker?.good_for_children ?? null,
          outdoor_seating: marker?.outdoor_seating ?? null,
          has_ev_charging: marker?.has_ev_charging ?? null,
          enrichment_tier: marker?.enrichment_tier ?? 'basic',
        };
```

---

### 3.7 Target File 7: `lib/utils/winery.ts`

#### Edit 1: Implement `parseTriStateBoolean` helper
- **Line Anchor:** Line 365
- **Target Content:**
```typescript
  return result;
}


/**
 * Standardizes winery data from various sources (DB, Google API, Mixed) into a single Winery object.
```
- **Replacement Content:**
```typescript
  return result;
}

/**
 * Helper to safely parse tri-state booleans (true, false, null).
 * Returns undefined if value is not present or unrecognized.
 */
export function parseTriStateBoolean(val: unknown): boolean | null | undefined {
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === null) return null;
  return undefined;
}

/**
 * Standardizes winery data from various sources (DB, Google API, Mixed) into a single Winery object.
```

#### Edit 2: Handle `user_rating_count` on `isMapMarkerRpc(source)` and Google places
- **Line Anchor:** Lines 528–537
- **Target Content:**
```typescript
  let rawUserRatingCount: unknown;
  if (isGoogleWinery(source)) {
    rawUserRatingCount = source.userRatingCount;
  } else if (isWineryDetailsRpc(source)) {
    rawUserRatingCount = source.user_rating_count ?? ('userRatingCount' in record ? record['userRatingCount'] : undefined);
  } else if (isRawDbWinery(source)) {
    rawUserRatingCount = 'user_rating_count' in record ? record['user_rating_count'] : undefined;
  } else {
    rawUserRatingCount = record['user_rating_count'] ?? record['userRatingCount'] ?? null;
  }
```
- **Replacement Content:**
```typescript
  let rawUserRatingCount: unknown;
  if (isGoogleWinery(source)) {
    rawUserRatingCount = source.userRatingCount ?? ('user_rating_count' in record ? record['user_rating_count'] : undefined);
  } else if (isWineryDetailsRpc(source) || isMapMarkerRpc(source)) {
    rawUserRatingCount = source.user_rating_count ?? ('userRatingCount' in record ? record['userRatingCount'] : undefined);
  } else if (isRawDbWinery(source)) {
    rawUserRatingCount = 'user_rating_count' in record ? record['user_rating_count'] : undefined;
  } else {
    rawUserRatingCount = record['user_rating_count'] ?? record['userRatingCount'] ?? null;
  }
```

#### Edit 3: Preserve strict tri-state `boolean | null` for Vibe Tags
- **Line Anchor:** Lines 627–631
- **Target Content:**
```typescript
  const allowsDogs = mergeField(record['allows_dogs'] !== undefined ? Boolean(record['allows_dogs']) : null, existing?.allows_dogs);
  const hasEvCharging = mergeField(record['has_ev_charging'] !== undefined ? Boolean(record['has_ev_charging']) : null, existing?.has_ev_charging);
  const servesWine = mergeField(record['serves_wine'] !== undefined ? Boolean(record['serves_wine']) : null, existing?.serves_wine);
  const goodForChildren = mergeField(record['good_for_children'] !== undefined ? Boolean(record['good_for_children']) : null, existing?.good_for_children);
  const outdoorSeating = mergeField(record['outdoor_seating'] !== undefined ? Boolean(record['outdoor_seating']) : null, existing?.outdoor_seating);
```
- **Replacement Content:**
```typescript
  const rawAllowsDogs = record['allows_dogs'] !== undefined ? record['allows_dogs'] : record['allowsDogs'];
  const rawHasEvCharging = record['has_ev_charging'] !== undefined ? record['has_ev_charging'] : record['hasEvCharging'];
  const rawServesWine = record['serves_wine'] !== undefined ? record['serves_wine'] : record['servesWine'];
  const rawGoodForChildren = record['good_for_children'] !== undefined ? record['good_for_children'] : record['goodForChildren'];
  const rawOutdoorSeating = record['outdoor_seating'] !== undefined ? record['outdoor_seating'] : record['outdoorSeating'];

  const allowsDogs = mergeField(parseTriStateBoolean(rawAllowsDogs), existing?.allows_dogs) ?? null;
  const hasEvCharging = mergeField(parseTriStateBoolean(rawHasEvCharging), existing?.has_ev_charging) ?? null;
  const servesWine = mergeField(parseTriStateBoolean(rawServesWine), existing?.serves_wine) ?? null;
  const goodForChildren = mergeField(parseTriStateBoolean(rawGoodForChildren), existing?.good_for_children) ?? null;
  const outdoorSeating = mergeField(parseTriStateBoolean(rawOutdoorSeating), existing?.outdoor_seating) ?? null;
```

#### Edit 4: Enforce ghost visit clearing when `userVisited === false`
- **Line Anchor:** Lines 664–671
- **Target Content:**
```typescript
  if (
    ('user_visited' in record && record['user_visited'] === false) ||
    ('userVisited' in record && record['userVisited'] === false) ||
    record['user_visited'] === false ||
    record['userVisited'] === false
  ) {
      visits = [];
  }
```
- **Replacement Content:**
```typescript
  if (
    ('user_visited' in record && (record['user_visited'] === false || record['user_visited'] === 0)) ||
    ('userVisited' in record && record['userVisited'] === false) ||
    userVisited === false
  ) {
      visits = [];
  }
```

---

### 3.8 Target File 8: `lib/utils/__tests__/winery.test.ts`

#### Edit 1: Import `parseTriStateBoolean`
- **Line Anchor:** Lines 1–11
- **Target Content:**
```typescript
import {
  standardizeWineryData,
  isRecord,
  isGoogleWinery,
  isMapMarkerRpc,
  isWineryDetailsRpc,
  isRawDbWinery,
  parseOpeningHoursJson,
  parseParkingOptionsJson,
  parseAccessibilityOptionsJson,
} from '../winery';
```
- **Replacement Content:**
```typescript
import {
  standardizeWineryData,
  isRecord,
  isGoogleWinery,
  isMapMarkerRpc,
  isWineryDetailsRpc,
  isRawDbWinery,
  parseOpeningHoursJson,
  parseParkingOptionsJson,
  parseAccessibilityOptionsJson,
  parseTriStateBoolean,
} from '../winery';
```

#### Edit 2: Add test suite for `parseTriStateBoolean`, tri-state Vibe Tag parsing, rating mapping, and ghost visit clearing
- **Line Anchor:** Line 417
- **Target Content:**
```typescript
      expect(result?.favoriteIsPrivate).toBe(true);
    });
  });
});

describe('Winery Type Guards & Invariant Protection (Issue #53 - Red Phase)', () => {
```
- **Replacement Content:**
```typescript
      expect(result?.favoriteIsPrivate).toBe(true);
    });
  });

  describe('tri-state Vibe Tag parsing, rating mapping, and ghost visit clearing (Issue #44 / Phase 2 Task 2)', () => {
    describe('parseTriStateBoolean', () => {
      it('returns true for boolean true and string "true"', () => {
        expect(parseTriStateBoolean(true)).toBe(true);
        expect(parseTriStateBoolean('true')).toBe(true);
      });

      it('returns false for boolean false and string "false"', () => {
        expect(parseTriStateBoolean(false)).toBe(false);
        expect(parseTriStateBoolean('false')).toBe(false);
      });

      it('returns null for null', () => {
        expect(parseTriStateBoolean(null)).toBeNull();
      });

      it('returns undefined for undefined or non-boolean primitives', () => {
        expect(parseTriStateBoolean(undefined)).toBeUndefined();
        expect(parseTriStateBoolean('')).toBeUndefined();
        expect(parseTriStateBoolean(1)).toBeUndefined();
        expect(parseTriStateBoolean({})).toBeUndefined();
      });
    });

    describe('Vibe Tag tri-state preservation', () => {
      it('preserves null for un-enriched Vibe Tags and does not coerce null to false', () => {
        const unenrichedMarker: MapMarkerRpc = {
          ...createMockMapMarkerRpc(),
          allows_dogs: null,
          good_for_children: null,
          outdoor_seating: null,
          has_ev_charging: null,
          enrichment_tier: 'basic',
        };

        const result = standardizeWineryData(unenrichedMarker);

        expect(result).not.toBeNull();
        expect(result?.allows_dogs).toBeNull();
        expect(result?.good_for_children).toBeNull();
        expect(result?.outdoor_seating).toBeNull();
        expect(result?.has_ev_charging).toBeNull();
        expect(result?.serves_wine).toBeNull();
      });

      it('preserves true and false flags when explicitly provided', () => {
        const enrichedMarker: MapMarkerRpc = {
          ...createMockMapMarkerRpc(),
          allows_dogs: true,
          good_for_children: false,
          outdoor_seating: true,
          has_ev_charging: false,
          enrichment_tier: 'enriched',
        };

        const result = standardizeWineryData(enrichedMarker);

        expect(result).not.toBeNull();
        expect(result?.allows_dogs).toBe(true);
        expect(result?.good_for_children).toBe(false);
        expect(result?.outdoor_seating).toBe(true);
        expect(result?.has_ev_charging).toBe(false);
      });

      it('prevents basic marker with null Vibe Tags from overwriting an already-enriched winery', () => {
        const existingEnriched: Winery = {
          ...createMockWinery(),
          enrichment_tier: 'enriched',
          allows_dogs: true,
          outdoor_seating: true,
          has_ev_charging: true,
        };

        const basicMarker: MapMarkerRpc = {
          ...createMockMapMarkerRpc(),
          id: (existingEnriched.dbId || 1) as WineryDbId,
          google_place_id: existingEnriched.id,
          allows_dogs: null,
          outdoor_seating: null,
          has_ev_charging: null,
          enrichment_tier: 'basic',
        };

        const result = standardizeWineryData(basicMarker, existingEnriched);

        expect(result).not.toBeNull();
        expect(result?.allows_dogs).toBe(true);
        expect(result?.outdoor_seating).toBe(true);
        expect(result?.has_ev_charging).toBe(true);
      });
    });

    describe('Rating and review count mapping', () => {
      it('maps google_rating and user_rating_count from MapMarkerRpc to standardized winery', () => {
        const marker: MapMarkerRpc = {
          ...createMockMapMarkerRpc(),
          google_rating: 4.75,
          user_rating_count: 342,
        };

        const result = standardizeWineryData(marker);

        expect(result).not.toBeNull();
        expect(result?.rating).toBe(4.75);
        expect(result?.userRatingCount).toBe(342);
      });

      it('preserves existing rating and review count when incoming basic marker omits or has null ratings', () => {
        const existing: Winery = {
          ...createMockWinery(),
          rating: 4.8,
          userRatingCount: 200,
        };

        const unratedMarker: MapMarkerRpc = {
          ...createMockMapMarkerRpc(),
          id: (existing.dbId || 1) as WineryDbId,
          google_place_id: existing.id,
          google_rating: null,
          user_rating_count: null,
        };

        const result = standardizeWineryData(unratedMarker, existing);

        expect(result).not.toBeNull();
        expect(result?.rating).toBe(4.8);
        expect(result?.userRatingCount).toBe(200);
      });
    });

    describe('Ghost visit prevention', () => {
      it('clears existing visits when incoming record has user_visited: false', () => {
        const existing: Winery = {
          ...createMockWinery(),
          userVisited: true,
          visits: [createMockVisitWithWinery()],
        };

        const marker: MapMarkerRpc = {
          ...createMockMapMarkerRpc(),
          id: (existing.dbId || 1) as WineryDbId,
          google_place_id: existing.id,
          user_visited: false,
        };

        const result = standardizeWineryData(marker, existing);

        expect(result).not.toBeNull();
        expect(result?.userVisited).toBe(false);
        expect(result?.visits).toEqual([]);
      });

      it('clears existing visits when incoming record has userVisited: false (camelCase)', () => {
        const existing: Winery = {
          ...createMockWinery(),
          userVisited: true,
          visits: [createMockVisitWithWinery()],
        };

        const update = {
          id: existing.id,
          name: existing.name,
          latitude: existing.latitude,
          longitude: existing.longitude,
          userVisited: false,
        };

        const result = standardizeWineryData(update, existing);

        expect(result).not.toBeNull();
        expect(result?.userVisited).toBe(false);
        expect(result?.visits).toEqual([]);
      });
    });
  });
});

describe('Winery Type Guards & Invariant Protection (Issue #53 - Red Phase)', () => {
```

---

## 4. Execution Verification Protocol

Every test addition and code modification MUST be verified empirically using the container runners.

### Step 4.1: Red Phase Verification (failing tests)
Run unit test suite targeting `lib/utils/__tests__/winery.test.ts` via the Jest container runner:
```bash
./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts
```
*(Requires `BypassSandbox: true`)*  
**Expected Outcome:** Failure in `Vibe Tag tri-state preservation` test because current `standardizeWineryData` coerces `null` to `false` via `Boolean(record['allows_dogs'])`.

### Step 4.2: Green Phase Verification (all tests passing)
Apply changes to `lib/utils/winery.ts`, `lib/types.ts`, `lib/database.types.ts`, `lib/test-utils/fixtures.ts`, `e2e/fixtures/utils/mock-wineries.ts`, and `e2e/fixtures/handlers/favorites.handler.ts`.  
Run unit test suite targeting `lib/utils/__tests__/winery.test.ts`:
```bash
./scripts/run-jest-container.sh lib/utils/__tests__/winery.test.ts
```
*(Requires `BypassSandbox: true`)*  
**Expected Outcome:** 100% passing tests (all suites and assertions green).

### Step 4.3: TypeScript Compilation & Type Safety Verification
Run TypeScript typecheck across entire repository:
```bash
npm run type-check
```
*(Can run sandboxed)*  
**Expected Outcome:** Zero type errors.

### Step 4.4: Local Database Type Verification
Run type regeneration check against local Supabase stack:
```bash
npm run db:check-types:local
```
*(Requires `BypassSandbox: true`)*  
**Expected Outcome:** Exits with code 0 (no diff between generated types and `lib/database.types.ts`).

---

## 5. Task Completion & Commit Protocol

1. Update `conductor/tracks/explore-enrichment-sync_20261006/plan.md` to check off Phase 2 Task 2 sub-tasks:
   - `[x] Task: Synchronize TypeScript types, E2E fixtures, and standardizeWineryData (TDD)`
2. Stage modified files:
   ```bash
   git add package.json lib/types.ts lib/database.types.ts lib/test-utils/fixtures.ts e2e/fixtures/utils/mock-wineries.ts e2e/fixtures/handlers/favorites.handler.ts lib/utils/winery.ts lib/utils/__tests__/winery.test.ts conductor/tracks/explore-enrichment-sync_20261006/plan.md
   ```
3. Commit with message:
   ```bash
   git commit -m "feat(explore): Synchronize TypeScript types, E2E fixtures, and standardizeWineryData (TDD)"
   ```
4. Record Git notes summary on HEAD detailing task objectives, files modified, and test verification outcomes.
