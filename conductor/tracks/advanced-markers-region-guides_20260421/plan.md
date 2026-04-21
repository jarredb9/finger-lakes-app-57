# Implementation Plan: Global Advanced Markers & Regional Guides

### Phase 1: Global Region Infrastructure (PostGIS)
- [ ] Task: Enable PostGIS & Create `regions` Table
    - [ ] Create Supabase migration to enable `postgis` and create `regions` table (id, name, slug, boundary [geography], ai_summary, last_updated)
    - [ ] Apply migration to the **Local Supabase Stack** (`127.0.0.1:54321`)
    - [ ] Verify PostGIS functionality and RLS using Tier 3 (Real Data) E2E tests locally
    - [ ] Seed the database with initial boundaries for "The Big Three" (Seneca, Cayuga, Keuka) for testing
- [ ] Task: Implement Region Discovery API
    - [ ] Write failing test for fetching regions within a bounding box
    - [ ] Implement `app/api/regions/list/route.ts` using `ST_Intersects` for map-view discovery
- [ ] Task: Conductor - User Manual Verification 'Global Region Infrastructure' (Protocol in workflow.md)

### Phase 2: Advanced Marker Migration (TDD)
- [ ] Task: Configure Map ID & Advanced Marker Component
    - [ ] Update `google-maps-provider.tsx` with a valid Map ID
    - [ ] Create `AdvancedWineryMarker.tsx` merging status colors with new Attribute Emblems (Dogs, EV)
- [ ] Task: Refactor Marker Clustering
    - [ ] Update `generic-marker-clusterer.tsx` for `AdvancedMarkerElement` compatibility
- [ ] Task: Conductor - User Manual Verification 'Advanced Marker Migration' (Protocol in workflow.md)

### Phase 3: Hybrid Region Guide UI (TDD)
- [ ] Task: Implement Map Overlay Layer
    - [ ] Write unit tests for GeoJSON rendering in `WineryMap.tsx`
    - [ ] Implement polygon rendering and Regional Anchor Labels
- [ ] Task: Build Navigation-Stacked Info Panel
    - [ ] Create `RegionGuidePanel.tsx` with Radix UI
    - [ ] Implement the navigation flow (Region -> Winery -> Region) within the tray/sidebar
- [ ] Task: Conductor - User Manual Verification 'Hybrid Region Guide UI' (Protocol in workflow.md)

### Phase 4: Lazy Enrichment & Content (TDD)
- [ ] Task: Implement Regional AI Summaries
    - [ ] Write failing test for the Cache-First summary fetch
    - [ ] Implement `app/api/regions/guide/route.ts` with Google Places v1 integration
- [ ] Task: Performance Audit & E2E Verification
    - [ ] Verify 100+ marker performance on mobile
    - [ ] Verify deduplication and caching for regional summaries
- [ ] Task: Conductor - User Manual Verification 'Lazy Enrichment & Content' (Protocol in workflow.md)
