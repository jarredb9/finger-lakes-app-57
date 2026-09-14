# Specification: Global Advanced Markers & Regional Guides

## Overview
This track upgrades the core map experience to a global-ready architecture using Google Maps **Advanced Markers** and a **PostGIS-powered Regional Guide system**. 

**CRITICAL MANDATE:** All development must follow TDD and adhere to the "Supabase Native" mandate (Edge Functions/RPCs for all CRUD logic).

## Functional Requirements
1.  **Global Region Infrastructure (PostGIS & Edge Functions):**
    *   Enable PostGIS and create the `regions` table.
    *   **Edge Function Discovery**: Implement `regions-discovery` Edge Function using `ST_Intersects` to return boundaries based on the map viewport.
    *   **NO Next.js API Routes**: All region-related logic must reside in Supabase Edge Functions.
2.  **Centralized Enrichment Integration:**
    *   Utilize the shared **`EnrichmentService`** (from the migration track) to manage AI summary freshness for wine regions.
3.  **Advanced Markers Implementation:**
    *   Migrate to `AdvancedMarkerElement`.
    *   **Dynamic UI**: Merge user status (Visited) with attribute emblems (Dogs, EV) provided by the migration track.
4.  **Hybrid Region Guides:**
    *   **Visual Anchor**: Display transparent region polygons and clickable labels.
    *   **UI Pattern**: Navigation-Stacked side panel/tray.
    *   **Lazy Enrichment**: Fetch Gemini summaries only on request via the `regions-guide` Edge Function.

## Quality & Testing Requirements
1.  **Geospatial Tests**: Unit tests for boundary detection using PostGIS locally.
2.  **TDD**: All new Edge Functions and components must have failing tests first.
3.  **Mock Integrity**: Update `MockMapsManager` to support v1 GeoJSON layers.

## Acceptance Criteria
*   Map renders PostGIS polygons for wine regions.
*   Advanced Markers display status and attributes correctly.
*   Region summaries use the centralized enrichment logic and are served via Edge Functions.
*   The UI transition between Region Guide and Winery Detail is smooth.
