# Implementation Plan: Search Function Upgrade (TDD)

### Phase 0: Architectural Foundation
- [ ] Task: Create Geolocation Utility & Service
    - [ ] Create `lib/utils/geolocation.ts` to wrap `navigator.geolocation`.
    - [ ] Define types for location results and permission states.
- [ ] Task: Update Mock Infrastructure for Geolocation
    - [ ] Update `e2e/helpers.ts` with `mockGeolocation` utility to simulate different coordinates and permission states.
- [ ] Task: Update UI Store for Search State
    - [ ] Add `isViewDirty` and `hasPromptedAutoSearch` to `useUIStore`.
- [ ] Task: Conductor - User Manual Verification 'Phase 0: Foundation' (Protocol in workflow.md)

### Phase 1: Logic & Hooks (TDD)
- [ ] Task: Implement `useGeolocation` hook
    - [ ] Write failing test in `hooks/__tests__/use-geolocation.test.ts`.
    - [ ] Implement the hook with support for permission monitoring.
- [ ] Task: Extend `useWineryMap` with Location Search Logic
    - [ ] Write failing test for `handleSearchMyLocation` in `hooks/__tests__/use-winery-map.test.ts`.
    - [ ] Implement coordinates-to-search action chain (Move Map -> Search -> Toast).
- [ ] Task: Implement "Dirty View" Detection Logic
    - [ ] Write failing test that verifies `isViewDirty` state changes after map movement.
    - [ ] Implement event listeners for map bounds changes to toggle "dirty" state.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Logic & Hooks' (Protocol in workflow.md)

### Phase 2: UI Components (TDD)
- [ ] Task: Implement Map FAB (Floating Action Button)
    - [ ] Write unit tests for the FAB's visibility and click propagation.
    - [ ] Create `components/map/MapLocationFab.tsx`.
- [ ] Task: Update `MapControls` Search Bar
    - [ ] Write unit tests for the integrated crosshair icon in the search input.
    - [ ] Update `components/map/map-controls.tsx` to include the icon and handler.
- [ ] Task: Implement `FloatingSearchButton` (Top-Center)
    - [ ] Write unit tests for animation states (enter/exit).
    - [ ] Create `components/map/FloatingSearchButton.tsx` (appears when view is dirty).
- [ ] Task: Conductor - User Manual Verification 'Phase 2: UI Components' (Protocol in workflow.md)

### Phase 3: Onboarding & Initialization (TDD)
- [ ] Task: Implement Auto-Search Prompt Modal
    - [ ] Write unit tests for the `AutoSearchPrompt` component.
    - [ ] Create the dialog using `shadcn/ui` primitives.
- [ ] Task: Implement Initialization Logic
    - [ ] Write failing test for the "First Load" prompt trigger.
    - [ ] Integrate the prompt into the main map container with `localStorage` persistence.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Onboarding' (Protocol in workflow.md)

### Phase 4: Verification & E2E Integration
- [ ] Task: Comprehensive E2E Search Flow
    - [ ] Create `e2e/search-upgrade.spec.ts`.
    - [ ] Verify "My Location" centers and searches.
    - [ ] Verify "Search This Area" appears after panning and disappears after search.
    - [ ] Verify Auto-Search prompt appears once and respects the user's choice.
- [ ] Task: Mobile UX Audit
    - [ ] Verify touch targets and layout on iPhone/Android viewports via Playwright.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Verification' (Protocol in workflow.md)
