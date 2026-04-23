# Implementation Plan: Global Advanced Markers & Regional Guides

### Phase 1: Global Region Infrastructure (PostGIS & Edge Functions)
- [ ] Task: Enable PostGIS & Create `regions` Table
    - [ ] Create migration for `regions` table (boundary [geography], ai_summary, etc.).
- [ ] Task: Implement Region Discovery Edge Function (TDD)
    - [ ] Create `supabase/functions/regions-discovery/index.ts`.
    - [ ] Use `ST_Intersects` for map-view discovery.
    - [ ] **MANDATORY**: Set `search_path = public, auth` in any supporting RPCs.
- [ ] Task: Conductor - User Manual Verification 'Global Region Infrastructure'

### Phase 2: Advanced Marker Migration (TDD)
- [ ] Task: Configure Map ID & Advanced Marker Component
    - [ ] Update `AdvancedWineryMarker.tsx` to use the attribute data (Dogs, EV) from the migration track.
- [ ] Task: Refactor Marker Clustering
    - [ ] Update `generic-marker-clusterer.tsx` for `AdvancedMarkerElement` compatibility.
- [ ] Task: Conductor - User Manual Verification 'Advanced Marker Migration'

### Phase 3: Hybrid Region Guide UI (TDD)
- [ ] Task: Implement Map Overlay Layer
    - [ ] Implement polygon rendering and Regional Anchor Labels in `WineryMap.tsx`.
- [ ] Task: Build Navigation-Stacked Info Panel
    - [ ] Create `RegionGuidePanel.tsx` with Radix UI.
    - [ ] Implement the nav flow (Region -> Winery -> Region).
- [ ] Task: Conductor - User Manual Verification 'Hybrid Region Guide UI'

### Phase 4: Lazy Enrichment & Content (TDD)
- [ ] Task: Implement Regional AI Summaries (Edge Function)
    - [ ] Create `supabase/functions/regions-guide/index.ts`.
    - [ ] Use the shared **`EnrichmentService`** to enforce 30-day freshness.
- [ ] Task: Performance Audit & E2E Verification
    - [ ] Verify 100+ Advanced Marker performance on mobile.
- [ ] Task: Conductor - User Manual Verification 'Lazy Enrichment & Content'
