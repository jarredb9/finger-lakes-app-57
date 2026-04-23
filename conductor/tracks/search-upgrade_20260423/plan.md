# Implementation Plan: Search Function Upgrade

## Phase 1: Foundation & Geolocation Logic
- [ ] Task: Create geolocation utility and hook
    - [ ] Create `lib/utils/geolocation.ts` to wrap `navigator.geolocation`
    - [ ] Implement `useGeolocation` hook for tracking and one-off position requests
- [ ] Task: Update Search Logic in `useWineryMap`
    - [ ] Implement `handleSearchMyLocation` function to zoom and search
    - [ ] Write unit tests for location-to-search conversion logic
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Foundation' (Protocol in workflow.md)

## Phase 2: "My Location" UI Components
- [ ] Task: Update `MapControls` presentational component
    - [ ] Add crosshair button to the search input area
    - [ ] Write tests for button click handler propagation
- [ ] Task: Create Map FAB Component
    - [ ] Implement a floating action button for the map
    - [ ] Position it appropriately for mobile and desktop
- [ ] Task: Integrate "My Location" Buttons
    - [ ] Connect both buttons to `handleSearchMyLocation`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: UI Components' (Protocol in workflow.md)

## Phase 3: "Search This Area" Floating Button
- [ ] Task: Implement `FloatingSearchButton` component
    - [ ] Create a top-center button that appears/disappears with animations
- [ ] Task: Implement Visibility Logic
    - [ ] Track map bounds changes and compare with last searched bounds
    - [ ] Only show if `autoSearch` is false and view is "dirty"
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Search Area UX' (Protocol in workflow.md)

## Phase 4: Auto-Search Initialization
- [ ] Task: Create Auto-Search Prompt Dialog
    - [ ] Implement a modal for first-time users to choose auto-search behavior
- [ ] Task: Implement Initialization Logic
    - [ ] Track "first load" status in `localStorage` or user settings
    - [ ] Trigger prompt on mount if status is unknown
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Initialization' (Protocol in workflow.md)

## Phase 5: Verification & Polish
- [ ] Task: E2E Testing
    - [ ] Create `e2e/search-upgrade.spec.ts`
    - [ ] Verify "My Location" flow across multiple viewports
    - [ ] Verify "Search This Area" visibility logic
- [ ] Task: Mobile UX Polish
    - [ ] Verify touch targets and spacing on mobile
    - [ ] Ensure no collisions with the bottom drawer
- [ ] Task: Conductor - User Manual Verification 'Phase 5: Final Polish' (Protocol in workflow.md)
