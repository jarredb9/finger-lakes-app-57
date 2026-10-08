# Phase 4 Task 4 Implementation Plan: Implement WineryCardThumbnail badges and synchronize Vibe Tag filtering (TDD Green phase)

## Overview & Scope
This plan implements the Green phase of Phase 4 Task 4 for the `explore-enrichment-sync_20261006` track. It satisfies all unit and integration assertions established in the Red phase (Phase 4 Task 3, commit `a45c6b1c`):
1. **`WineryCardThumbnail` Rating & Review Counts (`components/winery-card-thumbnail.tsx`)**:
   - Renders star rating and user review count formatted as `({winery.userRatingCount})` alongside star icon and numeric rating when `userRatingCount` is a valid positive number (`typeof winery.userRatingCount === 'number' && winery.userRatingCount > 0`).
   - Cleanly omits review count when `userRatingCount` is `null`, `undefined`, or `0`.
   - Cleanly omits the entire rating container when `winery.rating` is `null`, `undefined`, or `0`.
   - Status badges (`Favorite`, `Visited`, `Want to Go`) and status indicator strip colors (`bg-amber-500`, `bg-emerald-500`, `bg-purple-500`, `bg-muted`) are confirmed and preserved.
2. **`MapView` Synchronized Vibe Tag Filtering (`components/map/MapView.tsx`)**:
   - In `allWineries` memoization, filters the combined winery list by active Vibe Tag attributes (`allowsDogs`, `goodForChildren`, `outdoorSeating`, `hasEvCharging`) strictly matching `=== true`.
   - Excludes un-enriched records (`null`) and non-matching records (`false`).
   - Enforces strict conjunction (AND) across multiple active Vibe Tag filter attributes so GeoJSON features accurately match sidebar filter selections on initial load and subsequent user interactions.
3. **`GoogleMapFallback` Vibe Tag Filtering Parity (`components/map/google-map-fallback.tsx`)**:
   - Applies the identical Vibe Tag attribute filtering logic to `allWineries` in the fallback engine to guarantee strict behavior parity between Mapbox GL JS and Google Maps fallback rendering.

---

## Target Files & Line Anchors

### File 1: `components/winery-card-thumbnail.tsx`
- **Location Anchor**: Lines 37-43.
- **Context**: The rating badge container within the title row.
- **Modification**: Add review count rendering `({winery.userRatingCount})` conditionally when `typeof winery.userRatingCount === 'number' && winery.userRatingCount > 0`.

### File 2: `components/map/MapView.tsx`
- **Location Anchor**: Lines 69-97.
- **Context**: The `allWineries` memo hook combining categorized wineries.
- **Modification**: Extract active attributes from `filter` and filter `list` by checking each attribute strictly equals `=== true`.

### File 3: `components/map/google-map-fallback.tsx`
- **Location Anchor**: Lines 84-108.
- **Context**: The `allWineries` memo hook in the Google Map fallback.
- **Modification**: Extract active attributes from `filter` and filter `all` by checking each attribute strictly equals `=== true`.

---

## Exact Drop-In Code Blocks

### 1. `components/winery-card-thumbnail.tsx`

**Anchor**: Replace Lines 37-43.

#### Exact Target Content:
```typescript
          {typeof winery.rating === 'number' && winery.rating > 0 && (
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span>{winery.rating}</span>
            </div>
          )}
```

#### Exact Replacement Content:
```typescript
          {typeof winery.rating === 'number' && winery.rating > 0 && (
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span>{winery.rating}</span>
              {typeof winery.userRatingCount === 'number' && winery.userRatingCount > 0 && (
                <span>({winery.userRatingCount})</span>
              )}
            </div>
          )}
```

---

### 2. `components/map/MapView.tsx`

**Anchor**: Replace Lines 69-97.

#### Exact Target Content:
```typescript
  // Combine and type all wineries based on selected filters
  const allWineries = useMemo(() => {
    if (_selectedTrip?.wineries?.length) {
      return _selectedTrip.wineries.map((w) => ({
        ...w,
        type: "trip",
      }));
    }

    const hasCategory = filter.some((f) =>
      ["all", "visited", "favorites", "wantToGo", "notVisited"].includes(f)
    );
    const showAll = filter.includes("all") || !hasCategory;

    const list: any[] = [];
    if (showAll || filter.includes("notVisited")) {
      list.push(...discoveredWineries.map((w) => ({ ...w, type: "discovered" })));
    }
    if (showAll || filter.includes("visited")) {
      list.push(...visitedWineries.map((w) => ({ ...w, type: "visited" })));
    }
    if (showAll || filter.includes("wantToGo")) {
      list.push(...wishlistWineries.map((w) => ({ ...w, type: "wishlist" })));
    }
    if (showAll || filter.includes("favorites")) {
      list.push(...favoriteWineries.map((w) => ({ ...w, type: "favorite" })));
    }
    return list;
  }, [discoveredWineries, visitedWineries, wishlistWineries, favoriteWineries, filter, _selectedTrip]);
```

#### Exact Replacement Content:
```typescript
  // Combine and type all wineries based on selected filters
  const allWineries = useMemo(() => {
    if (_selectedTrip?.wineries?.length) {
      return _selectedTrip.wineries.map((w) => ({
        ...w,
        type: "trip",
      }));
    }

    const hasCategory = filter.some((f) =>
      ["all", "visited", "favorites", "wantToGo", "notVisited"].includes(f)
    );
    const showAll = filter.includes("all") || !hasCategory;

    const list: any[] = [];
    if (showAll || filter.includes("notVisited")) {
      list.push(...discoveredWineries.map((w) => ({ ...w, type: "discovered" })));
    }
    if (showAll || filter.includes("visited")) {
      list.push(...visitedWineries.map((w) => ({ ...w, type: "visited" })));
    }
    if (showAll || filter.includes("wantToGo")) {
      list.push(...wishlistWineries.map((w) => ({ ...w, type: "wishlist" })));
    }
    if (showAll || filter.includes("favorites")) {
      list.push(...favoriteWineries.map((w) => ({ ...w, type: "favorite" })));
    }

    const activeAttributes = filter.filter((f) =>
      ["allowsDogs", "goodForChildren", "outdoorSeating", "hasEvCharging"].includes(f)
    );

    if (activeAttributes.length > 0) {
      return list.filter((winery) =>
        activeAttributes.every((attr) => {
          if (attr === "allowsDogs") return winery.allows_dogs === true;
          if (attr === "goodForChildren") return winery.good_for_children === true;
          if (attr === "outdoorSeating") return winery.outdoor_seating === true;
          if (attr === "hasEvCharging") return winery.has_ev_charging === true;
          return true;
        })
      );
    }

    return list;
  }, [discoveredWineries, visitedWineries, wishlistWineries, favoriteWineries, filter, _selectedTrip]);
```

---

### 3. `components/map/google-map-fallback.tsx`

**Anchor**: Replace Lines 84-108.

#### Exact Target Content:
```typescript
  const allWineries = useMemo(() => {
    const all: any[] = [];
    if (selectedTrip?.wineries?.length) {
      all.push(...selectedTrip.wineries.map((w) => ({ ...w, type: "trip" })));
    } else {
      const hasCategory = filter.some((f) =>
        ["all", "visited", "favorites", "wantToGo", "notVisited"].includes(f)
      );
      const showAll = filter.includes("all") || !hasCategory;

      if (showAll || filter.includes("notVisited")) {
        all.push(...discoveredWineries.map((w) => ({ ...w, type: "discovered" })));
      }
      if (showAll || filter.includes("visited")) {
        all.push(...visitedWineries.map((w) => ({ ...w, type: "visited" })));
      }
      if (showAll || filter.includes("wantToGo")) {
        all.push(...wishlistWineries.map((w) => ({ ...w, type: "wishlist" })));
      }
      if (showAll || filter.includes("favorites")) {
        all.push(...favoriteWineries.map((w) => ({ ...w, type: "favorite" })));
      }
    }
    return all;
  }, [discoveredWineries, visitedWineries, wishlistWineries, favoriteWineries, filter, selectedTrip]);
```

#### Exact Replacement Content:
```typescript
  const allWineries = useMemo(() => {
    const all: any[] = [];
    if (selectedTrip?.wineries?.length) {
      all.push(...selectedTrip.wineries.map((w) => ({ ...w, type: "trip" })));
    } else {
      const hasCategory = filter.some((f) =>
        ["all", "visited", "favorites", "wantToGo", "notVisited"].includes(f)
      );
      const showAll = filter.includes("all") || !hasCategory;

      if (showAll || filter.includes("notVisited")) {
        all.push(...discoveredWineries.map((w) => ({ ...w, type: "discovered" })));
      }
      if (showAll || filter.includes("visited")) {
        all.push(...visitedWineries.map((w) => ({ ...w, type: "visited" })));
      }
      if (showAll || filter.includes("wantToGo")) {
        all.push(...wishlistWineries.map((w) => ({ ...w, type: "wishlist" })));
      }
      if (showAll || filter.includes("favorites")) {
        all.push(...favoriteWineries.map((w) => ({ ...w, type: "favorite" })));
      }
    }

    const activeAttributes = filter.filter((f) =>
      ["allowsDogs", "goodForChildren", "outdoorSeating", "hasEvCharging"].includes(f)
    );

    if (activeAttributes.length > 0) {
      return all.filter((winery) =>
        activeAttributes.every((attr) => {
          if (attr === "allowsDogs") return winery.allows_dogs === true;
          if (attr === "goodForChildren") return winery.good_for_children === true;
          if (attr === "outdoorSeating") return winery.outdoor_seating === true;
          if (attr === "hasEvCharging") return winery.has_ev_charging === true;
          return true;
        })
      );
    }

    return all;
  }, [discoveredWineries, visitedWineries, wishlistWineries, favoriteWineries, filter, selectedTrip]);
```

---

## Execution Verification Protocol

Following implementation of the drop-in blocks above, the executor must run the following exact commands to empirically verify green status:

### 1. Jest Component Tests (Container Runner)
Run all targeted component tests via the Podman container runner (`BypassSandbox: true` required per `AGENTS.md`):

```bash
./scripts/run-jest-container.sh components/__tests__/winery-card-thumbnail.test.tsx components/map/__tests__/MapView.test.tsx components/__tests__/vibe-tag-filtering.test.tsx components/map/__tests__/google-map-fallback.test.tsx
```

**Expected Results**:
- `components/__tests__/winery-card-thumbnail.test.tsx`: All tests pass (including rating, review count, and status badges).
- `components/map/__tests__/MapView.test.tsx`: All tests pass (including Vibe Tag map pin filtering strictly matching `=== true`).
- `components/__tests__/vibe-tag-filtering.test.tsx`: All 3 tests pass (Vibe Tag toggle interaction, initial load with active Vibe Tag filter, and multi-attribute conjunction AND filtering).
- `components/map/__tests__/google-map-fallback.test.tsx`: All tests pass.

### 2. TypeScript Static Typecheck
Run type-checking inside standard sandbox:

```bash
npm run type-check
```

**Expected Results**:
- Zero type errors across all touched files.

### 3. Track Plan Update
Update `conductor/tracks/explore-enrichment-sync_20261006/plan.md` to mark Phase 4 Task 4 complete:
```markdown
- [x] Task: Implement WineryCardThumbnail badges and synchronize Vibe Tag filtering (TDD Green phase)
    - [x] Update `WineryCardThumbnail` to render ratings, review counts, and status badges
    - [x] Ensure filter Vibe Tag toggles accurately filter both map pins and sidebar list on initial load
    - [x] Run component tests to verify green status
```

### 4. Git Commit
Stage modified files and commit using `BypassSandbox: true`:
```bash
git add components/winery-card-thumbnail.tsx components/map/MapView.tsx components/map/google-map-fallback.tsx conductor/tracks/explore-enrichment-sync_20261006/plan.md conductor/tracks/explore-enrichment-sync_20261006/phase-4-task-4-plan.md
git commit -m "feat(explore): Implement WineryCardThumbnail badges and synchronize Vibe Tag filtering (TDD Green phase)"
```
