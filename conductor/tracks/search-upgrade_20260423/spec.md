# Specification: Search Function Upgrade

## Overview
This track aims to improve the winery search experience by adding "Search My Current Location" functionality and enhancing the UX on mobile to clarify when the application is actively searching versus just panning the map.

## Functional Requirements
1. **Search My Current Location (Map FAB):**
   - Add a floating action button (FAB) on the map with a "crosshair" icon.
   - When clicked:
     - Request browser geolocation if not already granted.
     - Zoom the map to the user's current location.
     - Trigger a winery search in the new map area.
     - Display a friendly, professional success toast (e.g., "Now showing nearby wineries").

2. **Search My Current Location (Search Bar):**
   - Add a "crosshair" icon/button within the search input field or next to the search button in the drawer.
   - Functionality matches the Map FAB.

3. **"Search This Area" Visibility Improvement:**
   - Implement a floating button at the top-center of the map that appears when:
     - The user pans or zooms the map.
     - `Auto Search` is OFF.
     - The current map view has not been searched yet.
   - Clicking this button triggers `handleManualSearchArea`.

4. **Auto-Search Initialization:**
   - On the first load of the application, prompt the user to decide if they want to enable "Auto Search".

## User Experience (UX)
- **Mobile First:** Ensure the floating buttons are reachable and don't overlap with other UI elements (drawer handles, zoom controls).
- **Feedback:** Use subtle animations or transitions for the appearance of the top-center search button.
- **Tone:** Professional yet friendly.

## Non-Functional Requirements
- **Privacy:** Handle geolocation permission denials gracefully with informative alerts.
- **Performance:** Avoid redundant API calls when panning small distances if auto-search is on.

## Acceptance Criteria
- [ ] Floating "My Location" button appears on map and functions correctly.
- [ ] "My Location" icon appears in search bar and functions correctly.
- [ ] Top-center "Search this area" button appears when panning with auto-search off.
- [ ] First-load prompt for Auto Search is implemented.
- [ ] Zooming and searching on "My Location" click works as expected.

## Out of Scope
- Global search for wineries by name (this track focuses on location-based search).
- Background location tracking when the app is closed.
