# Specification: Advanced Map Markers & Region Guides

## Overview
This track focuses on upgrading the core exploration experience by implementing Google Maps **Advanced Markers** and introducing **Region Guides**. Advanced Markers will provide immediate visual context for winery attributes and user status (Visited, Wishlist, Favorite) directly on the map, while Region Guides will offer Gemini-powered summaries and curated recommendations for specific sub-regions.

## Functional Requirements
1.  **Advanced Markers Implementation:**
    *   Migrate from legacy `google.maps.Marker` to `google.maps.marker.AdvancedMarkerElement`.
    *   **Attribute Emblems:** Display icons for key attributes (e.g., dog-friendly, EV charging) directly on the marker pins using the `content` property.
    *   **Status-Based Coloration:** Inherit existing coloration (Green: Visited, Blue: Wishlist, Default: Map default) and merge with attribute icons.
    *   **Dynamic Scaling:** Implement scaling based on status (e.g., Favorites are 1.2x size) and interactive scaling/pop animations on hover/selection.
2.  **Region Guides:**
    *   **Trigger:** Add an explicit interaction (e.g., a "Explore Region" button or clicking a defined map boundary) to activate a guide, including "in-flight" guards to prevent duplicate calls.
    *   **AI Region Summaries:** Fetch and display Gemini-powered overviews of the selected area's viticultural characteristics and "vibe."
    *   **Cache-First Logic:** Store and retrieve summaries from a `region_summaries` table in Supabase to minimize API costs and prevent spam.
    *   **Local Top Picks:** Display a curated list of the top 3 wineries in the region based on ratings and friend activity.
3.  **UI/UX:**
    *   Implement a responsive **Side Panel (Desktop) / Bottom Drawer (Mobile)** using Radix UI primitives to display Region Guide content.

## Quality & Testing Requirements
1.  **TDD Protocol:** Each component and utility must be preceded by failing tests.
2.  **E2E Standards:** Verify marker interaction states (hover/scale) and region guide activation flows using Playwright.
3.  **Performance:** Ensure that rendering 100+ Advanced Markers does not cause frame-rate drops on mobile devices.

## Acceptance Criteria
*   Map markers show clear icons for attributes like "Dog Friendly" while maintaining status colors.
*   Markers scale and animate smoothly on interaction.
*   Clicking a region trigger opens a panel with valid AI summaries and top winery picks.
*   The UI remains responsive and does not block map navigation.
*   The system does not make redundant API calls for cached region data.

## Out of Scope
*   Custom 3D modeling for markers.
*   Real-time "Region Chat" or social forums within the guides.
