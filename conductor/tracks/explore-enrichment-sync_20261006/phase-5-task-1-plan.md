# Implementation Plan: Phase 5 Task 1 - Failing Unit Tests for Haversine Distance and FloatingSearchAreaButton (TDD Red Phase)

**Track:** `explore-enrichment-sync_20261006` (Issue [#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44))  
**Phase:** 5 (Viewport Search UX & Map Event Sync)  
**Task:** 1 (Write failing unit tests for Haversine distance and FloatingSearchAreaButton (TDD Red phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Establish failing unit and component test suites (TDD Red phase) for the viewport distance calculation utility (`calculateDistanceKm`) and the `FloatingSearchAreaButton` overlay before implementing their production logic in Task 2:
1. **Haversine Distance Utility (`lib/utils/map-utils.ts` & `lib/utils/__tests__/map-utils.test.ts`)**:
   - Introduce strict TypeScript interface `CoordinatePoint` supporting both `{ latitude, longitude }` and `{ lat, lng }` coordinate representations.
   - Author comprehensive unit tests asserting:
     - Distance between identical coordinates is `0 km`.
     - Accurate great-circle distance for real-world Finger Lakes landmarks (Geneva, NY `42.868, -76.980` to Watkins Glen, NY `42.380, -76.874` is approximately `54.8 km`).
     - Coordinate shape flexibility across both `{ latitude, longitude }` and `{ lat, lng }` formats.
     - Distance threshold boundary checks for viewport triggering (e.g., verifying `3 km` is `<= 5 km` and `7 km` is `> 5 km`).
     - Global distance verification (Equator `0, 0` to North Pole `90, 0` is approximately `10007.5 km`).
     - Safe handling of missing/invalid coordinates.
2. **Floating "Search this area" Button Component (`components/map/floating-search-area-button.tsx` & `components/map/__tests__/floating-search-area-button.test.tsx`)**:
   - Define strict TypeScript interface `FloatingSearchAreaButtonProps`.
   - Author isolated component tests asserting:
     - Does **NOT** render when `autoSearch` is `true`.
     - Does **NOT** render when `lastSearchedBounds` is `null` (initial load / no prior search).
     - Does **NOT** render when the distance between current viewport center and `lastSearchedBounds` center is `<= 5 km`.
     - **Renders** when `autoSearch` is `false` and distance from `lastSearchedBounds` center exceeds `5 km`.
     - Invokes `onClick` and dismisses/hides button on click.
     - Displays spinner and disabled state when `isSearching` is `true`.
     - Hydrates state from `useMapStore` in container mode when optional props are omitted.
3. **WineryMap Canvas Integration Tests (`components/__tests__/WineryMap.test.tsx`)**:
   - Assert `WineryMap` embeds `FloatingSearchAreaButton` at top-center of the map canvas.
   - Assert `WineryMap` connects the button click to `handleManualSearchArea()` from `useWineryMapContext()`.

### 1.2 Development Methodology: Strict TDD (Red Phase)
- In this Red phase, stub implementations returning dummy values (`return 0` for `calculateDistanceKm`, `return null` for `FloatingSearchAreaButton`) are established alongside strict type declarations.
- Running the Jest suite via the container runner (`./scripts/run-jest-container.sh`) MUST cleanly compile and execute, failing precisely on the newly introduced functional assertions.
- The Green phase (Task 2) will implement the production Haversine formula, component layout, and map resize listeners.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Red Phase Invariant (`spec.md` Section 21 & `AGENTS.md` Section 5):**
   - All newly added tests must fail with clear assertion failures against stub implementations.
   - Do not implement production math or UI logic during this Red phase.
2. **Container Runner Requirement (`AGENTS.md` Section 3):**
   - RHEL 8 glibc (2.28) is incompatible with Next.js 16.3+ native SWC. All Jest test runs MUST use the Podman container runner with `BypassSandbox: true`:
     ```bash
     ./scripts/run-jest-container.sh lib/utils/__tests__/map-utils.test.ts components/map/__tests__/floating-search-area-button.test.tsx components/__tests__/WineryMap.test.tsx
     ```
3. **Type Safety & Scoped Strictness (`spec.md` Section 93):**
   - Strictly zero `any` types in newly added signatures. `CoordinatePoint` and `FloatingSearchAreaButtonProps` must be fully typed.
4. **Coordinate Normalization Standard (`AGENTS.md` Section 4 & `spec.md` Section 14):**
   - Support both canonical domain `{ latitude, longitude }` and store `{ lat, lng }` coordinates seamlessly without requiring runtime conversions at call sites.
5. **Modal Approval Gate (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - Halts and requires explicit affirmative user confirmation before any code changes are applied.

---

## 3. Target Files & Line Anchors

### File 1: `lib/utils/map-utils.ts`
- **Location Anchor:** Lines 128–131 (end of file).
- **Modification:** Export `CoordinatePoint` interface and `calculateDistanceKm` stub function returning `0`.

### File 2: `lib/utils/__tests__/map-utils.test.ts`
- **Location Anchor:** Line 1 (imports) and Line 87 (prior to closing describe block).
- **Modification:** Import `calculateDistanceKm` and add `describe('calculateDistanceKm', ...)` unit test suite.

### File 3: `components/map/floating-search-area-button.tsx` (New File)
- **Location:** `components/map/floating-search-area-button.tsx`.
- **Modification:** Create new file defining `FloatingSearchAreaButtonProps` interface and a stub `FloatingSearchAreaButton` component returning `null`.

### File 4: `components/map/__tests__/floating-search-area-button.test.tsx` (New File)
- **Location:** `components/map/__tests__/floating-search-area-button.test.tsx`.
- **Modification:** Create comprehensive unit tests for button rendering, distance calculation triggers, autoSearch bypass, click handling, and store hydration.

### File 5: `components/__tests__/WineryMap.test.tsx`
- **Location Anchor:** Lines 1–4 (imports) and Line 80 (end of describe block).
- **Modification:** Import `useMapStore` and `fireEvent`, add test cases asserting `WineryMap` embeds `FloatingSearchAreaButton` and wires `handleManualSearchArea`.

---

## 4. Exact Drop-In Code Blocks

### 4.1 Target File 1: `lib/utils/map-utils.ts`

**Anchor:** Replace Lines 128–131 at the end of the file.

#### Exact Target Content:
```typescript
  return null;
}
```

#### Exact Replacement Content:
```typescript
  return null;
}

export interface CoordinatePoint {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
}

/**
 * Calculates the great-circle distance between two coordinates in kilometers using the Haversine formula.
 * @returns Distance in kilometers.
 */
export function calculateDistanceKm(
  _coord1: CoordinatePoint,
  _coord2: CoordinatePoint
): number {
  return 0; // Stub for TDD Red phase
}
```

---

### 4.2 Target File 2: `lib/utils/__tests__/map-utils.test.ts`

**Edit 1: Update Imports (Anchor: Line 1)**

#### Exact Target Content:
```typescript
import { coordToMapbox, mapboxToCoord, isCoordinateInBounds, getCoordinatesFromBounds } from '../map-utils';
```

#### Exact Replacement Content:
```typescript
import {
  coordToMapbox,
  mapboxToCoord,
  isCoordinateInBounds,
  getCoordinatesFromBounds,
  calculateDistanceKm,
} from '../map-utils';
```

**Edit 2: Add `calculateDistanceKm` Test Suite (Anchor: Line 87 before closing `});`)**

#### Exact Target Content:
```typescript
    });
  });
});
```

#### Exact Replacement Content:
```typescript
    });
  });

  describe('calculateDistanceKm', () => {
    it('returns 0 when coordinates are identical', () => {
      const coord = { latitude: 42.7, longitude: -76.9 };
      expect(calculateDistanceKm(coord, coord)).toBe(0);
    });

    it('calculates accurate Haversine distance in km between known landmarks', () => {
      // Geneva, NY to Watkins Glen, NY: ~54.8 km
      const geneva = { latitude: 42.868, longitude: -76.980 };
      const watkinsGlen = { latitude: 42.380, longitude: -76.874 };

      const distance = calculateDistanceKm(geneva, watkinsGlen);
      expect(distance).toBeCloseTo(54.8, 1);
    });

    it('supports both { latitude, longitude } and { lat, lng } coordinate formats', () => {
      const p1 = { lat: 42.868, lng: -76.980 };
      const p2 = { lat: 42.380, lng: -76.874 };
      const p3 = { latitude: 42.380, longitude: -76.874 };

      expect(calculateDistanceKm(p1, p2)).toBeCloseTo(54.8, 1);
      expect(calculateDistanceKm(p1, p3)).toBeCloseTo(54.8, 1);
    });

    it('correctly discriminates viewport distance threshold of 5 km', () => {
      const center = { latitude: 42.7000, longitude: -76.9000 };
      // Small shift (~3.0 km north)
      const nearPoint = { latitude: 42.7270, longitude: -76.9000 };
      // Larger shift (~7.0 km north)
      const farPoint = { latitude: 42.7630, longitude: -76.9000 };

      const nearDistance = calculateDistanceKm(center, nearPoint);
      const farDistance = calculateDistanceKm(center, farPoint);

      expect(nearDistance).toBeLessThan(5);
      expect(farDistance).toBeGreaterThan(5);
    });

    it('calculates large global distances accurately (Equator to North Pole)', () => {
      const equator = { lat: 0, lng: 0 };
      const northPole = { lat: 90, lng: 0 };

      // Quarter circumference of Earth (~10,007.5 km)
      expect(calculateDistanceKm(equator, northPole)).toBeCloseTo(10007.5, 0);
    });

    it('handles missing or invalid coordinate fields gracefully', () => {
      expect(calculateDistanceKm({} as any, { lat: 42.7, lng: -76.9 })).toBeNaN();
      expect(calculateDistanceKm(undefined as any, { lat: 42.7, lng: -76.9 })).toBeNaN();
    });
  });
});
```

---

### 4.3 Target File 3: `components/map/floating-search-area-button.tsx` (New File)

#### Full File Content:
```tsx
"use client";

import React from "react";
import { SerializableBounds } from "@/lib/stores/mapStore";

export interface FloatingSearchAreaButtonProps {
  onClick?: () => void;
  autoSearch?: boolean;
  isSearching?: boolean;
  currentCenter?: { lat: number; lng: number };
  lastSearchedBounds?: SerializableBounds | null;
  className?: string;
}

export function FloatingSearchAreaButton(_props: FloatingSearchAreaButtonProps) {
  return null; // Stub for TDD Red phase
}

export default FloatingSearchAreaButton;
```

---

### 4.4 Target File 4: `components/map/__tests__/floating-search-area-button.test.tsx` (New File)

#### Full File Content:
```tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingSearchAreaButton } from "../floating-search-area-button";
import { useMapStore, SerializableBounds } from "@/lib/stores/mapStore";

describe("FloatingSearchAreaButton", () => {
  const sampleSearchedBounds: SerializableBounds = {
    north: 42.75,
    south: 42.65,
    east: -76.85,
    west: -76.95,
  }; // Center: lat 42.70, lng -76.90

  beforeEach(() => {
    useMapStore.getState().reset();
  });

  describe("Visibility Logic", () => {
    it("does not render when autoSearch is true", () => {
      // 11 km away, but autoSearch is true
      render(
        <FloatingSearchAreaButton
          autoSearch={true}
          lastSearchedBounds={sampleSearchedBounds}
          currentCenter={{ lat: 42.80, lng: -76.90 }}
        />
      );
      expect(screen.queryByRole("button", { name: /search this area/i })).not.toBeInTheDocument();
    });

    it("does not render when lastSearchedBounds is null", () => {
      render(
        <FloatingSearchAreaButton
          autoSearch={false}
          lastSearchedBounds={null}
          currentCenter={{ lat: 42.80, lng: -76.90 }}
        />
      );
      expect(screen.queryByRole("button", { name: /search this area/i })).not.toBeInTheDocument();
    });

    it("does not render when current center is within 5 km of last search center", () => {
      // ~2.2 km shift
      render(
        <FloatingSearchAreaButton
          autoSearch={false}
          lastSearchedBounds={sampleSearchedBounds}
          currentCenter={{ lat: 42.72, lng: -76.90 }}
        />
      );
      expect(screen.queryByRole("button", { name: /search this area/i })).not.toBeInTheDocument();
    });

    it("renders floating button when autoSearch is false and center distance exceeds 5 km", () => {
      // ~11.1 km shift
      render(
        <FloatingSearchAreaButton
          autoSearch={false}
          lastSearchedBounds={sampleSearchedBounds}
          currentCenter={{ lat: 42.80, lng: -76.90 }}
        />
      );
      const button = screen.getByRole("button", { name: /search this area/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe("User Interactions & Loading State", () => {
    it("invokes onClick when clicked", () => {
      const handleClick = jest.fn();
      render(
        <FloatingSearchAreaButton
          autoSearch={false}
          lastSearchedBounds={sampleSearchedBounds}
          currentCenter={{ lat: 42.80, lng: -76.90 }}
          onClick={handleClick}
        />
      );

      const button = screen.getByRole("button", { name: /search this area/i });
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("displays disabled state and loading indicator when isSearching is true", () => {
      render(
        <FloatingSearchAreaButton
          autoSearch={false}
          lastSearchedBounds={sampleSearchedBounds}
          currentCenter={{ lat: 42.80, lng: -76.90 }}
          isSearching={true}
        />
      );

      const button = screen.getByRole("button", { name: /search this area/i });
      expect(button).toBeDisabled();
      expect(button.querySelector("svg")).toBeInTheDocument();
    });
  });

  describe("Store Hydration (Container Mode)", () => {
    it("reads autoSearch, bounds, and center from useMapStore when props are omitted", () => {
      useMapStore.setState({
        autoSearch: false,
        lastSearchedBounds: sampleSearchedBounds,
        center: { lat: 42.80, lng: -76.90 },
      });

      render(<FloatingSearchAreaButton />);
      expect(screen.getByRole("button", { name: /search this area/i })).toBeInTheDocument();
    });
  });
});
```

---

### 4.5 Target File 5: `components/__tests__/WineryMap.test.tsx`

**Edit 1: Add Imports (Anchor: Line 1)**

#### Exact Target Content:
```typescript
import { render, screen } from "@testing-library/react";
import WineryMap from "../WineryMap";
import { useWineryMapContext } from "@/components/winery-map-context";
```

#### Exact Replacement Content:
```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import WineryMap from "../WineryMap";
import { useWineryMapContext } from "@/components/winery-map-context";
import { useMapStore } from "@/lib/stores/mapStore";
```

**Edit 2: Add Context Default & Viewport Tests (Anchor: Line 30 & Line 81)**

Update `defaultContext` in `WineryMap.test.tsx` to include `handleManualSearchArea: jest.fn()`, and add viewport tracking tests before the final `});`:

#### Exact Target Content (Line 29–31):
```typescript
    selectedTrip: null,
  };

  beforeEach(() => {
```

#### Exact Replacement Content:
```typescript
    selectedTrip: null,
    handleManualSearchArea: jest.fn(),
  };

  beforeEach(() => {
```

#### Exact Target Content (Line 80–82):
```typescript
    expect(screen.getByTestId("map-view-mock")).toBeInTheDocument();
  });
});
```

#### Exact Replacement Content:
```typescript
    expect(screen.getByTestId("map-view-mock")).toBeInTheDocument();
  });

  it("renders FloatingSearchAreaButton when center distance from last search exceeds 5 km and autoSearch is false", () => {
    (useWineryMapContext as jest.Mock).mockReturnValue(defaultContext);
    useMapStore.setState({
      autoSearch: false,
      center: { lat: 42.80, lng: -76.90 },
      lastSearchedBounds: {
        north: 42.75,
        south: 42.65,
        east: -76.85,
        west: -76.95,
      },
    });

    render(<WineryMap />);

    expect(screen.getByRole("button", { name: /search this area/i })).toBeInTheDocument();
  });

  it("triggers handleManualSearchArea from context when FloatingSearchAreaButton is clicked", () => {
    const mockManualSearch = jest.fn();
    (useWineryMapContext as jest.Mock).mockReturnValue({
      ...defaultContext,
      handleManualSearchArea: mockManualSearch,
    });
    useMapStore.setState({
      autoSearch: false,
      center: { lat: 42.80, lng: -76.90 },
      lastSearchedBounds: {
        north: 42.75,
        south: 42.65,
        east: -76.85,
        west: -76.95,
      },
    });

    render(<WineryMap />);

    const button = screen.getByRole("button", { name: /search this area/i });
    fireEvent.click(button);
    expect(mockManualSearch).toHaveBeenCalledTimes(1);
  });
});
```

---

## 5. Execution Verification Protocol

Following file creation/edits, the executor must run the following exact commands to empirically verify Red phase failures:

### 5.1 Jest Test Suite (Container Runner)
Run all three targeted test files via the Podman container runner (`BypassSandbox: true` required per `AGENTS.md`):

```bash
./scripts/run-jest-container.sh lib/utils/__tests__/map-utils.test.ts components/map/__tests__/floating-search-area-button.test.tsx components/__tests__/WineryMap.test.tsx
```

#### Expected Red Phase Assertions:
1. `lib/utils/__tests__/map-utils.test.ts`:
   - Fails on non-zero distance assertions (`expected ~54.8, received 0`).
   - Fails on threshold discrimination (`expected farDistance > 5, received 0`).
2. `components/map/__tests__/floating-search-area-button.test.tsx`:
   - Fails on rendering tests because stub returns `null` (`Unable to find an accessible element with the role "button" and name /search this area/i`).
3. `components/__tests__/WineryMap.test.tsx`:
   - Fails on floating button tests because `WineryMap` does not yet render `FloatingSearchAreaButton`.

### 5.2 TypeScript Static Typecheck
Verify strict typing with zero compiler errors inside the standard sandbox:

```bash
npm run type-check
```

**Expected Result:** Zero TypeScript compile errors.

---

## 6. Post-Execution Protocol & Git Notes

### 6.1 Update Track Plan
Update `conductor/tracks/explore-enrichment-sync_20261006/plan.md` to check off Phase 5 Task 1:
```markdown
## Phase 5: Viewport Search UX & Map Event Sync
- [x] Task: Write failing unit tests for Haversine distance and FloatingSearchAreaButton (TDD Red phase) [commit: <commit-sha>]
    - [x] Write failing unit tests for `calculateDistanceKm` in `lib/utils/__tests__/map-utils.test.ts`
    - [x] Write failing tests for viewport distance tracking: display floating button when `autoSearch` is false and center distance > 5 km from `lastSearchedBounds`
    - [x] Confirm tests fail (Red phase)
```

### 6.2 Git Commit & Git Notes
Stage modified and created files and commit using `BypassSandbox: true`:

```bash
git add lib/utils/map-utils.ts lib/utils/__tests__/map-utils.test.ts components/map/floating-search-area-button.tsx components/map/__tests__/floating-search-area-button.test.tsx components/__tests__/WineryMap.test.tsx conductor/tracks/explore-enrichment-sync_20261006/plan.md conductor/tracks/explore-enrichment-sync_20261006/phase-5-task-1-plan.md
git commit -m "test(explore): Write failing unit tests for Haversine distance and FloatingSearchAreaButton (TDD Red phase)"
```

Attach git notes using the standard fields:
```bash
git notes add -m "Task: Write failing unit tests for Haversine distance and FloatingSearchAreaButton (TDD Red phase)
Summary: Introduced failing unit and component test suites for Haversine distance calculation (calculateDistanceKm) and FloatingSearchAreaButton overlay. Added unit tests in map-utils.test.ts for distance accuracy, coordinate flexibility ({ latitude, longitude } vs { lat, lng }), and the 5 km viewport threshold. Added component unit tests in floating-search-area-button.test.tsx verifying suppression with autoSearch true, suppression within 5 km, display beyond 5 km, loading state, click dispatch, and store hydration. Added WineryMap integration tests for button embedding and handleManualSearchArea dispatch.
Files: lib/utils/map-utils.ts, lib/utils/__tests__/map-utils.test.ts, components/map/floating-search-area-button.tsx, components/map/__tests__/floating-search-area-button.test.tsx, components/__tests__/WineryMap.test.tsx, conductor/tracks/explore-enrichment-sync_20261006/phase-5-task-1-plan.md
Rationale: Enforces strict TDD Red phase invariant for Issue #44 Phase 5 Task 1, validating failure semantics before implementing Green phase utilities and overlay components."
```
