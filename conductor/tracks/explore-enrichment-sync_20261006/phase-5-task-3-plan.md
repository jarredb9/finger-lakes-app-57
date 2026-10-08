# Implementation Plan: Phase 5 Task 3 - Implement Haversine Distance Utility and FloatingSearchAreaButton Overlay (TDD Green Phase)

**Track:** `explore-enrichment-sync_20261006` (Issue [#44](https://github.com/jarredb9/finger-lakes-app-57/issues/44))  
**Phase:** 5 (Viewport Search UX & Map Event Sync)  
**Task:** 3 (Implement Haversine distance utility and FloatingSearchAreaButton overlay (TDD Green phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  

---

## 1. Executive Summary & Objective

### 1.1 Objective
Transition all unit, component, and Playwright E2E tests authored in Tasks 1 and 2 from failing (Red phase) to passing (Green phase) by implementing:
1. **Haversine Distance Utility (`lib/utils/map-utils.ts`)**:
   - Implement production great-circle distance calculation `calculateDistanceKm(coord1, coord2)` using the standard Haversine formula with mean Earth radius $R = 6371\text{ km}$.
   - Safely extract coordinates from either canonical `{ latitude, longitude }` or store `{ lat, lng }` shapes.
   - Return `NaN` gracefully for missing or invalid coordinate numbers.
2. **Landmark Assertion Alignment (`lib/utils/__tests__/map-utils.test.ts`)**:
   - Align the real-world Finger Lakes landmark test assertion from estimated `54.8` to the true mathematical Haversine result `55.0` km (Geneva, NY `42.868, -76.980` to Watkins Glen, NY `42.380, -76.874` is $54.95\text{ km}$), satisfying Jest's strict `toBeCloseTo(..., 1)` tolerance threshold ($0.05\text{ km}$).
3. **Floating "Search this area" Button Component (`components/map/floating-search-area-button.tsx`)**:
   - Implement production `FloatingSearchAreaButton` overlay with Zustand store hydration (`autoSearch`, `lastSearchedBounds`, `center`, `isSearching`).
   - Suppress button rendering when `autoSearch` is `true`, when `lastSearchedBounds` is `null`, or when distance from `lastSearchedBounds` center is $\le 5\text{ km}$.
   - Render accessible button (`data-testid="floating-search-area-button"`) positioned top-center over the map canvas when distance $> 5\text{ km}$ and `autoSearch` is `false`.
   - Show `Loader2` spinner and disabled state when `isSearching` is `true`.
4. **WineryMap Canvas Overlay Integration (`components/WineryMap.tsx`)**:
   - Destructure `handleManualSearchArea` from `useWineryMapContext()`.
   - Embed `<FloatingSearchAreaButton onClick={handleManualSearchArea} />` directly at top-center of the map container.
5. **Map Center & Bounds Synchronization (`hooks/use-winery-map.ts`)**:
   - Destructure `setCenter` from `useMapStore()`.
   - In `handleMapMovement`, synchronize both `setBounds` and `setCenter` when viewport moves or resizes.
   - Attach map `'resize'` listener to `mapInstance` so container dimensions recalculate viewport bounds.
   - Enhance `handleManualSearchArea()` to adopt current viewport bounds into `lastSearchedBounds` immediately, ensuring instant button dismissal upon user click.
6. **Container Resize Observer (`components/map/MapView.tsx`)**:
   - Attach `ResizeObserver` (with `typeof ResizeObserver !== "undefined"` SSR/test guard) to the map container to trigger `map.resize()` on sidebar expand/collapse.

### 1.2 Development Methodology: Strict TDD (Green Phase)
- All production code blocks provided below are drop-in replacements designed to turn existing unit test suites (`map-utils.test.ts`, `floating-search-area-button.test.tsx`, `WineryMap.test.tsx`) and the real-browser E2E suite (`e2e/map-viewport.spec.ts`) completely green.

---

## 2. Invariants & Critical Guardrails

1. **Strict TDD Green Phase Invariant (`spec.md` Section 21 & `AGENTS.md` Section 5):**
   - Implement only the logic required to satisfy the specification and existing test assertions.
   - Retain full backwards compatibility and adhere strictly to Container/Presentational component patterns.
2. **Container Runner Requirement (`AGENTS.md` Section 3):**
   - Unit tests must be executed via `./scripts/run-jest-container.sh` with `BypassSandbox: true`.
   - Playwright E2E tests must be executed via `./scripts/run-e2e-container.sh webkit e2e/map-viewport.spec.ts` with `BypassSandbox: true`.
3. **Modal & Plan Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - Halts and requires explicit affirmative user confirmation via interactive GUI modal (`ask_question`) before executing any code changes.
4. **Global Discovery Scope Alignment (`AGENTS.md` Section 4 & ADR 0004):**
   - Viewport distance calculations and manual area searches are globally unconstrained.
5. **Type Safety & Scoped Strictness (`spec.md` Section 93):**
   - Strictly zero new `any` types introduced. `calculateDistanceKm`, `FloatingSearchAreaButtonProps`, and store handlers are fully typed.

---

## 3. Target Files & Line Anchors

### File 1: `lib/utils/map-utils.ts`
- **Location Anchor:** Lines 137–148.
- **Modification:** Replace stub `calculateDistanceKm` with production Haversine great-circle distance algorithm.

### File 2: `lib/utils/__tests__/map-utils.test.ts`
- **Location Anchor:** Lines 101–118.
- **Modification:** Align landmark test assertion from `54.8` to `55.0` km so Jest's `toBeCloseTo(..., 1)` passes against true Haversine distance ($54.95\text{ km}$).

### File 3: `components/map/floating-search-area-button.tsx`
- **Location Anchor:** Lines 1–19 (Full File).
- **Modification:** Implement production `FloatingSearchAreaButton` component with store hydration, distance threshold check, loading state, and styling.

### File 4: `components/WineryMap.tsx`
- **Location Anchor:** Lines 19–37 and Lines 56–58.
- **Modification:** Import `FloatingSearchAreaButton`, destructure `handleManualSearchArea` from `useWineryMapContext()`, and embed the button overlay at top-center of the canvas.

### File 5: `hooks/use-winery-map.ts`
- **Location Anchor:** Lines 23–27, Lines 84–148, and Lines 268–273.
- **Modification:** Destructure `setCenter`, synchronize center and bounds in `handleMapMovement`, listen to map `resize` events, and update `handleManualSearchArea` to immediately adopt current bounds.

### File 6: `components/map/MapView.tsx`
- **Location Anchor:** Lines 54–65 and Lines 215–220.
- **Modification:** Add container `ResizeObserver` to trigger `map.resize()` on layout/sidebar changes.

---

## 4. Exact Drop-In Code Blocks

### 4.1 Target File 1: `lib/utils/map-utils.ts`

**Anchor:** Replace Lines 137–148 at the end of the file.

#### Exact Target Content:
```typescript
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

#### Exact Replacement Content:
```typescript
/**
 * Calculates the great-circle distance between two coordinates in kilometers using the Haversine formula.
 * @param coord1 First coordinate point (supports { latitude, longitude } or { lat, lng })
 * @param coord2 Second coordinate point (supports { latitude, longitude } or { lat, lng })
 * @returns Great-circle distance in kilometers, or NaN if coordinates are invalid or missing.
 */
export function calculateDistanceKm(
  coord1: CoordinatePoint,
  coord2: CoordinatePoint
): number {
  if (!coord1 || !coord2) return NaN;

  const lat1 = coord1.latitude ?? coord1.lat;
  const lng1 = coord1.longitude ?? coord1.lng;
  const lat2 = coord2.latitude ?? coord2.lat;
  const lng2 = coord2.longitude ?? coord2.lng;

  if (
    lat1 === undefined ||
    lng1 === undefined ||
    lat2 === undefined ||
    lng2 === undefined ||
    Number.isNaN(lat1) ||
    Number.isNaN(lng1) ||
    Number.isNaN(lat2) ||
    Number.isNaN(lng2)
  ) {
    return NaN;
  }

  // Mean radius of Earth in kilometers
  const R = 6371;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
```

---

### 4.2 Target File 2: `lib/utils/__tests__/map-utils.test.ts`

**Anchor:** Replace Lines 101–118 in `describe('calculateDistanceKm')`.

#### Exact Target Content:
```typescript
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
```

#### Exact Replacement Content:
```typescript
    it('calculates accurate Haversine distance in km between known landmarks', () => {
      // Geneva, NY to Watkins Glen, NY: ~55.0 km (Haversine great-circle: ~54.95 km)
      const geneva = { latitude: 42.868, longitude: -76.980 };
      const watkinsGlen = { latitude: 42.380, longitude: -76.874 };

      const distance = calculateDistanceKm(geneva, watkinsGlen);
      expect(distance).toBeCloseTo(55.0, 1);
    });

    it('supports both { latitude, longitude } and { lat, lng } coordinate formats', () => {
      const p1 = { lat: 42.868, lng: -76.980 };
      const p2 = { lat: 42.380, lng: -76.874 };
      const p3 = { latitude: 42.380, longitude: -76.874 };

      expect(calculateDistanceKm(p1, p2)).toBeCloseTo(55.0, 1);
      expect(calculateDistanceKm(p1, p3)).toBeCloseTo(55.0, 1);
    });
```

---

### 4.3 Target File 3: `components/map/floating-search-area-button.tsx`

**Anchor:** Replace Lines 1–19 (Entire file).

#### Exact Target Content:
```typescript
"use client";

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

#### Exact Replacement Content:
```typescript
"use client";

import { useMapStore, SerializableBounds } from "@/lib/stores/mapStore";
import { calculateDistanceKm } from "@/lib/utils/map-utils";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FloatingSearchAreaButtonProps {
  onClick?: () => void;
  autoSearch?: boolean;
  isSearching?: boolean;
  currentCenter?: { lat: number; lng: number };
  lastSearchedBounds?: SerializableBounds | null;
  className?: string;
}

export function FloatingSearchAreaButton({
  onClick,
  autoSearch: autoSearchProp,
  isSearching: isSearchingProp,
  currentCenter: currentCenterProp,
  lastSearchedBounds: lastSearchedBoundsProp,
  className,
}: FloatingSearchAreaButtonProps) {
  const storeAutoSearch = useMapStore((s) => s.autoSearch);
  const storeLastSearchedBounds = useMapStore((s) => s.lastSearchedBounds);
  const storeCenter = useMapStore((s) => s.center);
  const storeIsSearching = useMapStore((s) => s.isSearching);

  const resolvedAutoSearch = autoSearchProp ?? storeAutoSearch;
  const resolvedLastSearchedBounds =
    lastSearchedBoundsProp !== undefined
      ? lastSearchedBoundsProp
      : storeLastSearchedBounds;
  const resolvedCenter = currentCenterProp ?? storeCenter;
  const resolvedIsSearching = isSearchingProp ?? storeIsSearching;

  // Visibility conditions:
  // 1. Suppressed if autoSearch is true
  if (resolvedAutoSearch) {
    return null;
  }

  // 2. Suppressed if no previous search bounds exist or center is unknown
  if (!resolvedLastSearchedBounds || !resolvedCenter) {
    return null;
  }

  // 3. Compute distance between current viewport center and last searched bounds center
  const lastCenterLat =
    (resolvedLastSearchedBounds.north + resolvedLastSearchedBounds.south) / 2;
  const lastCenterLng =
    (resolvedLastSearchedBounds.east + resolvedLastSearchedBounds.west) / 2;

  const distanceKm = calculateDistanceKm(resolvedCenter, {
    lat: lastCenterLat,
    lng: lastCenterLng,
  });

  // 4. Suppressed if within 5 km threshold or distance calculation is invalid
  if (isNaN(distanceKm) || distanceKm <= 5) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      data-testid="floating-search-area-button"
      disabled={resolvedIsSearching}
      onClick={onClick}
      className={cn(
        "absolute top-4 left-1/2 -translate-x-1/2 z-30 shadow-lg rounded-full px-4 py-2 bg-background/95 backdrop-blur-sm border text-xs font-medium hover:bg-accent transition-all duration-200 pointer-events-auto flex items-center gap-1.5",
        className
      )}
    >
      {resolvedIsSearching ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <MapPin className="h-3.5 w-3.5" />
      )}
      <span>Search this area</span>
    </Button>
  );
}

export default FloatingSearchAreaButton;
```

---

### 4.4 Target File 4: `components/WineryMap.tsx`

**Edit 1: Add Import & Destructure `handleManualSearchArea` (Anchor: Lines 19–37)**

#### Exact Target Content:
```typescript
import MapView from "./map/MapView";
import { useWineryMapContext } from "@/components/winery-map-context";

interface WineryMapProps {
  className?: string;
}

export default function WineryMap({ className }: WineryMapProps) {
  const {
    error,
    isLoading,
    mapWineries,
    filter,
    handleOpenModal,
    proposedWinery,
    setProposedWinery,
    selectedTrip,
  } = useWineryMapContext();
```

#### Exact Replacement Content:
```typescript
import MapView from "./map/MapView";
import { useWineryMapContext } from "@/components/winery-map-context";
import FloatingSearchAreaButton from "./map/floating-search-area-button";

interface WineryMapProps {
  className?: string;
}

export default function WineryMap({ className }: WineryMapProps) {
  const {
    error,
    isLoading,
    mapWineries,
    filter,
    handleOpenModal,
    proposedWinery,
    setProposedWinery,
    selectedTrip,
    handleManualSearchArea,
  } = useWineryMapContext();
```

**Edit 2: Mount `FloatingSearchAreaButton` Overlay (Anchor: Lines 55–58)**

#### Exact Target Content:
```typescript
      {/* Main Map View - Always mounted to prevent destruction on transient search/data errors */}
      <div className="w-full h-full">
        <MapView
          discoveredWineries={mapWineries.discovered}
          visitedWineries={mapWineries.visited}
          wishlistWineries={mapWineries.wishlist}
          favoriteWineries={mapWineries.favorites}
          filter={filter}
          onMarkerClick={handleOpenModal}
          selectedTrip={selectedTrip}
        />
      </div>

      {/* Floating Non-Destructive Error Overlay */}
```

#### Exact Replacement Content:
```typescript
      {/* Main Map View - Always mounted to prevent destruction on transient search/data errors */}
      <div className="w-full h-full">
        <MapView
          discoveredWineries={mapWineries.discovered}
          visitedWineries={mapWineries.visited}
          wishlistWineries={mapWineries.wishlist}
          favoriteWineries={mapWineries.favorites}
          filter={filter}
          onMarkerClick={handleOpenModal}
          selectedTrip={selectedTrip}
        />
      </div>

      {/* Floating "Search this area" Button Overlay */}
      <FloatingSearchAreaButton onClick={handleManualSearchArea} />

      {/* Floating Non-Destructive Error Overlay */}
```

---

### 4.5 Target File 5: `hooks/use-winery-map.ts`

**Edit 1: Destructure `setCenter` (Anchor: Lines 23–27)**

#### Exact Target Content:
```typescript
    autoSearch,
    setAutoSearch,
    setBounds,
    error: mapError,
  } = useMapStore();
```

#### Exact Replacement Content:
```typescript
    autoSearch,
    setAutoSearch,
    setBounds,
    setCenter,
    error: mapError,
  } = useMapStore();
```

**Edit 2: Update `handleMapMovement` & Add Resize Listener (Anchor: Lines 84–148)**

#### Exact Target Content:
```typescript
    const handleMapMovement = () => {
      try {
        const currentBounds = typeof mapInstance.getBounds === "function" ? mapInstance.getBounds() : null;
        if (currentBounds) {
          setBounds(currentBounds);
        }

        // Auto-dismiss previous search errors when user begins panning/navigating
        if (useMapStore.getState().error) {
          useMapStore.getState().setError(null);
        }

        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
        
        debounceTimeoutRef.current = setTimeout(() => {
          const state = useMapStore.getState();

          // Only trigger search on map movement if autoSearch is enabled
          if (!state.autoSearch) return;
          
          if (!currentBounds) return;

          const lastSearched = state.lastSearchedBounds;
          const lastSearchedZoom = state.lastSearchedZoom;
          const hitApiLimit = state.hitApiLimit;
          const currentZoom = typeof mapInstance.getZoom === "function" ? mapInstance.getZoom() : (mapInstance as any).zoom;

          if (lastSearched) {
            const coords = getCoordinatesFromBounds(currentBounds);
            if (coords) {
              const isContained = isCoordinateInBounds({ latitude: coords.neLat, longitude: coords.neLng }, lastSearched) && 
                                  isCoordinateInBounds({ latitude: coords.swLat, longitude: coords.swLng }, lastSearched);
              
              // If we are fully contained in the last search area AND we didn't hit the API limit,
              // we normally skip. HOWEVER, if we zoomed in AT ALL, we should search again
              // because Google Places hides results at lower zoom levels.
              if (isContained && !hitApiLimit) {
                if (currentZoom && lastSearchedZoom && (currentZoom > lastSearchedZoom)) {
                  // Force search: Zoomed in.
                } else {
                  return;
                }
              }
            }
          }
          
          executeSearchRef.current(undefined, currentBounds);

        }, 750);
      } catch (err) {
        console.error("Error during map movement handler:", err);
      }
    };

    if (typeof mapInstance.on === "function") {
      mapInstance.on("moveend", handleMapMovement);
      // Trigger initial search/bounds population immediately upon map mount/availability
      handleMapMovement();
      return () => {
        mapInstance.off("moveend", handleMapMovement);
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      };
    }
    return () => {};
  }, [mapInstance, setBounds]);
```

#### Exact Replacement Content:
```typescript
    const handleMapMovement = () => {
      try {
        const currentBounds = typeof mapInstance.getBounds === "function" ? mapInstance.getBounds() : null;
        if (currentBounds) {
          setBounds(currentBounds);
        }

        if (typeof mapInstance.getCenter === "function") {
          const c = mapInstance.getCenter();
          if (c) {
            const lat = typeof c.lat === "function" ? c.lat() : c.lat;
            const lng = typeof c.lng === "function" ? c.lng() : (c.lng ?? c.lon);
            if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
              setCenter({ lat, lng });
            }
          }
        } else if (currentBounds) {
          const coords = getCoordinatesFromBounds(currentBounds);
          if (coords) {
            setCenter({
              lat: (coords.neLat + coords.swLat) / 2,
              lng: (coords.neLng + coords.swLng) / 2,
            });
          }
        }

        // Auto-dismiss previous search errors when user begins panning/navigating
        if (useMapStore.getState().error) {
          useMapStore.getState().setError(null);
        }

        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
        
        debounceTimeoutRef.current = setTimeout(() => {
          const state = useMapStore.getState();

          // Only trigger search on map movement if autoSearch is enabled
          if (!state.autoSearch) return;
          
          if (!currentBounds) return;

          const lastSearched = state.lastSearchedBounds;
          const lastSearchedZoom = state.lastSearchedZoom;
          const hitApiLimit = state.hitApiLimit;
          const currentZoom = typeof mapInstance.getZoom === "function" ? mapInstance.getZoom() : (mapInstance as any).zoom;

          if (lastSearched) {
            const coords = getCoordinatesFromBounds(currentBounds);
            if (coords) {
              const isContained = isCoordinateInBounds({ latitude: coords.neLat, longitude: coords.neLng }, lastSearched) && 
                                  isCoordinateInBounds({ latitude: coords.swLat, longitude: coords.swLng }, lastSearched);
              
              // If we are fully contained in the last search area AND we didn't hit the API limit,
              // we normally skip. HOWEVER, if we zoomed in AT ALL, we should search again
              // because Google Places hides results at lower zoom levels.
              if (isContained && !hitApiLimit) {
                if (currentZoom && lastSearchedZoom && (currentZoom > lastSearchedZoom)) {
                  // Force search: Zoomed in.
                } else {
                  return;
                }
              }
            }
          }
          
          executeSearchRef.current(undefined, currentBounds);

        }, 750);
      } catch (err) {
        console.error("Error during map movement handler:", err);
      }
    };

    if (typeof mapInstance.on === "function") {
      mapInstance.on("moveend", handleMapMovement);
      mapInstance.on("resize", handleMapMovement);
      // Trigger initial search/bounds population immediately upon map mount/availability
      handleMapMovement();
      return () => {
        mapInstance.off("moveend", handleMapMovement);
        mapInstance.off("resize", handleMapMovement);
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      };
    }
    return () => {};
  }, [mapInstance, setBounds, setCenter]);
```

**Edit 3: Enhance `handleManualSearchArea` (Anchor: Lines 268–273)**

#### Exact Target Content:
```typescript
  const handleManualSearchArea = () => {
    if (mapInstance) {
      useMapStore.getState().setLastSearchedBounds(null);
      executeSearch(undefined, mapInstance.getBounds());
    }
  };
```

#### Exact Replacement Content:
```typescript
  const handleManualSearchArea = () => {
    const currentBounds =
      (mapInstance && typeof mapInstance.getBounds === "function" ? mapInstance.getBounds() : null) ||
      useMapStore.getState().bounds;

    if (currentBounds) {
      useMapStore.getState().setLastSearchedBounds(currentBounds);
      executeSearch(undefined, currentBounds);
    } else if (mapInstance) {
      useMapStore.getState().setLastSearchedBounds(null);
      executeSearch(undefined, mapInstance.getBounds());
    }
  };
```

---

### 4.6 Target File 6: `components/map/MapView.tsx`

**Edit 1: Add `containerRef` and `ResizeObserver` (Anchor: Lines 54–65)**

#### Exact Target Content:
```typescript
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const mounted = useMounted();
  const mapRef = useRef<MapRef>(null);
  const closeWineryModal = useUIStore((s) => s.closeWineryModal);
  const [mapStyle, setMapStyle] = useState<"streets" | "outdoors">("streets");
  const [cursor, setCursor] = useState<string>("");
  const [mapboxFailed, setMapboxFailed] = useState<boolean>(false);

  const handleMapLoad = useCallback(() => {
    mapRef.current?.getMap()?.resize?.();
  }, []);
```

#### Exact Replacement Content:
```typescript
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const mounted = useMounted();
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeWineryModal = useUIStore((s) => s.closeWineryModal);
  const [mapStyle, setMapStyle] = useState<"streets" | "outdoors">("streets");
  const [cursor, setCursor] = useState<string>("");
  const [mapboxFailed, setMapboxFailed] = useState<boolean>(false);

  const handleMapLoad = useCallback(() => {
    mapRef.current?.getMap()?.resize?.();
  }, []);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.getMap()?.resize?.();
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);
```

**Edit 2: Attach `containerRef` to Map View Canvas Container (Anchor: Lines 215–220)**

#### Exact Target Content:
```typescript
  return (
    <div
      data-testid="map-view-canvas"
      data-state="ready"
      className="relative h-full w-full min-h-[300px] bg-muted overflow-hidden"
    >
```

#### Exact Replacement Content:
```typescript
  return (
    <div
      ref={containerRef}
      data-testid="map-view-canvas"
      data-state="ready"
      className="relative h-full w-full min-h-[300px] bg-muted overflow-hidden"
    >
```

---

## 5. Execution Verification Protocol

### 5.1 Verification Commands
During the execution phase, run the following verification suite using the container runners:

#### 1. Unit & Component Test Suite Verification (Jest Container Runner)
```bash
./scripts/run-jest-container.sh lib/utils/__tests__/map-utils.test.ts components/map/__tests__/floating-search-area-button.test.tsx components/__tests__/WineryMap.test.tsx components/map/__tests__/MapView.test.tsx
```

#### 2. End-to-End Viewport & Floating Button Verification (Playwright Container Runner)
```bash
./scripts/run-e2e-container.sh webkit e2e/map-viewport.spec.ts
```

*(Optional Chromium E2E verification: `./scripts/run-e2e-container.sh chromium e2e/map-viewport.spec.ts`)*

### 5.2 Expected Green Semantics (Validation Criteria)
1. **Haversine Distance Unit Tests (`map-utils.test.ts`)**:
   - `calculateDistanceKm` returns `0` for identical coords.
   - Accurately computes great-circle distance between Finger Lakes landmarks (~55.0 km) within precision tolerance.
   - Accurately supports both `{ latitude, longitude }` and `{ lat, lng }` coordinate formats.
   - Accurately computes global distances (Equator to North Pole: ~10,007.5 km).
   - Gracefully returns `NaN` for invalid or missing coordinates.
2. **FloatingSearchAreaButton Component Tests (`floating-search-area-button.test.tsx`)**:
   - Suppresses rendering when `autoSearch` is true.
   - Suppresses rendering when `lastSearchedBounds` is null.
   - Suppresses rendering when viewport center is within 5 km of last search center.
   - Renders floating button when `autoSearch` is false and center distance exceeds 5 km.
   - Fires `onClick` when clicked.
   - Shows disabled state and loading spinner when `isSearching` is true.
   - Hydrates successfully from `useMapStore`.
3. **WineryMap Canvas Integration Tests (`WineryMap.test.tsx`)**:
   - Renders `FloatingSearchAreaButton` when center distance exceeds 5 km.
   - Dispatches `handleManualSearchArea` from context on click.
4. **MapView Container Tests (`MapView.test.tsx`)**:
   - All MapView rendering and cluster tests pass with `ResizeObserver` attached.
5. **Playwright E2E Tests (`e2e/map-viewport.spec.ts`)**:
   - All 6 browser tests pass, verifying initial suppression, threshold appearance at >5 km, dismissal on search click, autoSearch suppression, and canvas drag triggering.

---

## 6. Post-Execution Protocol

### 6.1 Git Commit Command
Stage and commit the modified production and test files:
```bash
git add lib/utils/map-utils.ts lib/utils/__tests__/map-utils.test.ts components/map/floating-search-area-button.tsx components/WineryMap.tsx hooks/use-winery-map.ts components/map/MapView.tsx conductor/tracks/explore-enrichment-sync_20261006/phase-5-task-3-plan.md
git commit -m "feat(explore): Implement Haversine distance utility and FloatingSearchAreaButton overlay (TDD Green phase)"
```

### 6.2 Git Notes Add Command
Format and attach the post-execution summary using the standard Conductor fields:
```bash
COMMIT_HASH=$(git log -1 --format="%H")
git notes add -m "Task: Implement Haversine distance utility and FloatingSearchAreaButton overlay (TDD Green phase)
Summary: Implemented production Haversine great-circle distance utility calculateDistanceKm in lib/utils/map-utils.ts and aligned landmark test tolerance in lib/utils/__tests__/map-utils.test.ts. Implemented FloatingSearchAreaButton overlay with Zustand store hydration in components/map/floating-search-area-button.tsx and embedded it at top-center in components/WineryMap.tsx. Updated hooks/use-winery-map.ts to synchronize center and bounds on movement and resize, and wired handleManualSearchArea to adopt current bounds immediately. Added container ResizeObserver in components/map/MapView.tsx. Verified all unit and Playwright E2E tests pass cleanly in green phase.
Files: lib/utils/map-utils.ts, lib/utils/__tests__/map-utils.test.ts, components/map/floating-search-area-button.tsx, components/WineryMap.tsx, hooks/use-winery-map.ts, components/map/MapView.tsx, conductor/tracks/explore-enrichment-sync_20261006/phase-5-task-3-plan.md
Rationale: Delivers production viewport distance tracking and manual search overlay UX for Issue #44 Phase 5 Task 3, satisfying strict TDD Green phase requirements across unit and browser E2E test suites." $COMMIT_HASH
```

### 6.3 Track Plan Update
Update `conductor/tracks/explore-enrichment-sync_20261006/plan.md`:
- Mark Phase 5 Task 3 as completed: `[x] Task: Implement Haversine distance utility and FloatingSearchAreaButton overlay (TDD Green phase) [commit: <short_sha>]`
- Stage and commit the plan:
  ```bash
  git add conductor/tracks/explore-enrichment-sync_20261006/plan.md
  git commit -m "chore(conductor): Mark Phase 5 Task 3 as complete in track plan"
  ```
