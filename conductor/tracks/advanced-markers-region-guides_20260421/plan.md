# Implementation Plan: Advanced Markers & Region Guides

### Phase 1: Infrastructure & Marker Migration
- [ ] Task: Configure Map ID & Provider
    - [ ] Update `components/google-maps-provider.tsx` to include a `mapId`.
    - [ ] Update `tech-stack.md` to reflect the requirement for a Google Maps Map ID.
- [ ] Task: Implement Advanced Marker Component
    - [ ] Create `components/map/AdvancedWineryMarker.tsx` using `google.maps.marker.AdvancedMarkerElement`.
    - [ ] **MANDATORY:** Migrate existing status-based coloration (Visited, Wishlist, Favorite) into the new component logic.
    - [ ] Implement the `content` property to merge status colors with Attribute Emblems (Dogs, EV).
    - [ ] Implement **Dynamic Scaling** (e.g., Favorites are 1.2x size).
- [ ] Task: Refactor Marker Clustering
    - [ ] Update `components/generic-marker-clusterer.tsx` to support the new `AdvancedMarkerElement`.
- [ ] Task: Conductor - User Manual Verification 'Infrastructure & Marker Migration' (Protocol in workflow.md)

### Phase 2: Region Guide Backend & Caching (TDD)
- [ ] Task: Create `region_summaries` Table
    - [ ] Create a Supabase migration for a `region_summaries` table (ID, region_name, geometry/bounds, summary_text, top_picks_json, last_updated).
- [ ] Task: Implement Region Guide API Route
    - [ ] Write failing unit test for the **Cache-First** logic.
    - [ ] Implement `app/api/regions/guide/route.ts` with deduplication and Google Places "Area Summary" integration.
- [ ] Task: Conductor - User Manual Verification 'Region Guide Backend' (Protocol in workflow.md)

### Phase 3: Region Guide UI (TDD)
- [ ] Task: Build Region Info Panel
    - [ ] Write unit tests for the responsive Side Panel / Bottom Drawer component.
    - [ ] Implement `components/RegionGuidePanel.tsx` using Radix UI primitives.
- [ ] Task: Implement Trigger Logic on Map
    - [ ] Add explicit region trigger (e.g., a floating "Explore This Area" button that appears when the map is centered on a major lake).
    - [ ] Implement the "In-Flight" guard (disable button during fetch).
- [ ] Task: Conductor - User Manual Verification 'Region Guide UI' (Protocol in workflow.md)

### Phase 4: Polish & Performance
- [ ] Task: Implement Interactive Animations
    - [ ] Add CSS/Web Animations for marker scaling and transitions.
- [ ] Task: Performance Audit & E2E Verification
    - [ ] Run Playwright tests to ensure smooth marker clustering with 100+ points.
    - [ ] Verify that no duplicate API calls are made for cached regions.
- [ ] Task: Conductor - User Manual Verification 'Polish & Performance' (Protocol in workflow.md)
