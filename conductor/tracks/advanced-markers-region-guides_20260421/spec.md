# Specification: Global Advanced Markers & Regional Guides

## Overview
This track upgrades the core map experience to a global-ready architecture. It implements Google Maps **Advanced Markers** for rich winery visualization and introduces a **PostGIS-powered Regional Guide system**. Users can discover world-famous wine regions (AVAs, AOCs) via interactive map overlays that provide Gemini-powered narrative summaries and curated top picks.

**CRITICAL MANDATE:** All development must follow TDD and adhere to `project-testing-best-practices`.

## Functional Requirements
1.  **Global Region Infrastructure (PostGIS):**
    *   Enable PostGIS in Supabase to support geographic boundary queries (`ST_Contains`, `ST_Intersects`).
    *   Create a `regions` table to store GeoJSON boundaries and cached AI summaries.
    *   Implement an API that returns region boundaries based on the user's current map viewport.
2.  **Advanced Markers Implementation:**
    *   Migrate to `AdvancedMarkerElement`.
    *   **Dynamic UI:** Merge user status (Visited, etc.) with attribute emblems (Dog-Friendly, EV) and dynamic scaling for favorites.
3.  **Hybrid Region Guides:**
    *   **Visual Anchor:** Display semi-transparent region boundaries and clickable "Regional Labels" on the map.
    *   **UI Pattern:** Implement a "Navigation-Stacked" bottom sheet/side panel.
    *   **Lazy Enrichment:** Fetch Gemini summaries for a region only upon user request and cache them in the database.
4.  **Interaction Flow:**
    *   Clicking a region polygon opens the Region Guide.
    *   Clicking a winery within that guide transitions the UI to the Winery Detail view with a "Back" button.

## Quality & Testing Requirements
1.  **Geospatial Tests:** Write unit tests for boundary detection (ensuring wineries map to the correct regions).
2.  **TDD:** All new API routes and components must have failing tests first.
3.  **Mock Integrity:** Update `MockMapsManager` to support v1 Places API and GeoJSON layers.

## Acceptance Criteria
*   Map renders polygons for pre-defined wine regions.
*   Advanced Markers display status and attributes correctly.
*   Region summaries are fetched on-demand and cached in Supabase.
*   The UI transition between Region Guide and Winery Detail is smooth.
