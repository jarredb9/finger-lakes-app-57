# Specification: Search Function Upgrade

## Overview
This track enhances the winery search experience by introducing "Search My Current Location" functionality and proactive UX prompts for location-based searching. It addresses a critical usability gap where users are unclear about the map's search state during navigation.

**CRITICAL MANDATE:** All development must strictly follow the TDD (Test-Driven Development) workflow. No implementation code shall be written without a corresponding failing test. All testing must adhere to the senior-level architectural standards defined in the `project-testing-best-practices` skill.

## Functional Requirements
1.  **Geolocation Service & Hooks:**
    *   Implement a formal `GeolocationService` in `lib/services/geolocationService.ts` as a singleton. This service MUST wrap the browser's `navigator.geolocation` API and utilize the `navigator.permissions` API for reactive permission monitoring.
    *   Standardize error mapping within the service to provide consistent messaging across all features.
    *   Implement a `useGeolocation` hook to expose coordinates and permission status to components, allowing the UI to adapt proactively to permission changes.

2.  **"My Location" Interaction Points:**
    *   **Map FAB (Floating Action Button):** A persistent, high-visibility button on the map (crosshair icon) that centers the map on the user and triggers a search.
    *   **Search Bar Integration:** A matching crosshair icon within the `MapControls` search input for redundant, accessible location discovery.
    *   **Action Chain:** Clicking either button must:
        1. Request/Verify geolocation permissions.
        2. Smooth-pan/zoom the map to the user's coordinates.
        3. Trigger `handleManualSearchArea` to fetch wineries in the new viewport.
        4. Provide immediate success feedback via toast notification.

3.  **Proactive "Search This Area" UX:**
    *   Implement a "Dirty View" detection logic that tracks if the current map viewport has been searched since the last pan/zoom.
    *   **Geometric Tolerance:** To prevent flicker, the view should only be marked "dirty" if the current bounds overlap with `lastSearchedBounds` by less than 90%.
    *   Display a floating "Search This Area" button at the top-center of the map ONLY when:
        - The view is "dirty" (panned/zoomed).
        - `Auto Search` is currently disabled.
    *   The button should dismiss automatically once a search is triggered or if `Auto Search` is toggled on.

4.  **Auto-Search Onboarding:**
    *   Implement a "First Run" logic for the search interface.
    *   Prompt users on their first map load to decide their preferred `Auto Search` setting (Contextual Onboarding).
    *   **MANDATORY:** Utilize React Portals to render the onboarding prompt into the `#modal-root` div.
    *   **Hydration Safety:** The prompt component MUST implement a `mounted` state check to prevent SSR/Hydration mismatches.
    *   Persist this preference in `localStorage` to avoid redundant prompts.

## User Experience (UX)
*   **Visual Continuity:** Use `framer-motion` or standard CSS transitions for the top-center search button.
*   **Industry Standard Icons:** Use the standard "crosshair" or "target" icons (from `lucide-react`) for location-based actions.
*   **Mobile Ergonomics:** Ensure floating buttons are within comfortable reach of a thumb (bottom-right for FAB).
*   **UI Layering & Stacking:** 
    *   **The Vertical Stack Rule:** The `FloatingSearchButton` (top-center) must stack vertically with the `Offline Map Warning` (z-5) to prevent overlapping.
    *   The Map FAB should utilize `z-30` to stack above sidebar toggles (`z-20`) and status indicators.

## Architectural Alignment
*   **Decoupling:** Extract search-triggering logic from `useWineryMap` into a dedicated `useMapSearchTrigger` hook.
*   **State Integrity (CRITICAL):** Remove the redundant `selectedTrip` and `setSelectedTrip` state from `lib/stores/mapStore.ts`. All components must defer exclusively to `tripStore`.
*   **Performance:** Use `useStore.getState()` within map event listeners (idle, drag) instead of reactive store subscriptions to minimize redundant re-renders of the Map container.

## Quality & Testing Requirements
1.  **TDD Protocol:** Every logic change in `useWineryMap` or new utility must be preceded by a failing unit test.
2.  **Mock Geolocation:** Update `e2e/helpers.ts` with a standardized `mockGeolocation` utility using Playwright’s `setGeolocation` and `grantPermissions` to verify all permission flows.
3.  **Store Injection:** Use `page.evaluate` to inject specific map bounds and `autoSearch` states to verify the visibility of the "Search This Area" button.
4.  **Error States:** Explicitly test the "Permission Denied" flow to ensure the application remains functional and provides clear instructions to the user.

## Acceptance Criteria
- [ ] Geolocation utility handles all browser permission states correctly.
- [ ] Map FAB centers map and triggers search with success toast.
- [ ] Search Bar crosshair performs identical location-to-search chain.
- [ ] Top-center "Search This Area" button appears/disappears based on "dirty view" state.
- [ ] Auto-search onboarding modal appears on first load and persists preference.
- [ ] E2E tests verify all location and search flows across mobile/desktop viewports.
