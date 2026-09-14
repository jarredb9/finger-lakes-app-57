# Implementation Plan: Search Function Upgrade (TDD)

### Phase 0: Architectural Foundation
- [ ] Task: Create Geolocation Service
    - [ ] Create `lib/services/geolocationService.ts` as a singleton.
- [ ] Task: Update Mock Infrastructure for Geolocation
    - [ ] Update `e2e/helpers.ts` with `mockGeolocation` utility.
- [ ] Task: Map Store & State Cleanup
    - [ ] Add `isViewDirty` and `hasPromptedAutoSearch` to `useMapStore`.
    - [ ] **NOTE**: `selectedTrip` state removal has been moved to the `pwa-resilience` track.
- [ ] Task: Conductor - User Manual Verification 'Phase 0: Foundation'

### Phase 1: Logic & Hooks (TDD)
- [ ] Task: Implement `useGeolocation` hook
    - [ ] Write failing test in `hooks/__tests__/use-geolocation.test.ts`.
- [ ] Task: Refactor `useWineryMap` & Decouple Search Logic
    - [ ] Extract search-triggering logic into `hooks/useMapSearchTrigger.ts`.
    - [ ] Implement `handleSearchMyLocation` action chain.
- [ ] Task: Implement "Dirty View" Detection Logic
    - [ ] Implement reactive bounds-tracking (Geometric Tolerance >10%) to toggle "dirty" state.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Logic & Hooks'

### Phase 2: UI Components (TDD)
- [ ] Task: Implement Map FAB (Floating Action Button)
    - [ ] Create `components/map/MapLocationFab.tsx` (z-30, bottom-right).
- [ ] Task: Update `MapControls` Search Bar
    - [ ] Add crosshair icon and handler to the search input.
- [ ] Task: Implement `FloatingSearchButton` (Top-Center)
    - [ ] **THE VERTICAL STACK RULE**: Ensure it stacks vertically with the `OfflineMapWarning` (z-5).
    - [ ] Create `components/map/FloatingSearchButton.tsx`.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: UI Components'

### Phase 3: Onboarding & Initialization (TDD)
- [ ] Task: Implement Auto-Search Prompt Modal
    - [ ] **MANDATORY**: Use React Portals to render into `#modal-root`.
    - [ ] Create the dialog using `shadcn/ui` primitives.
- [ ] Task: Implement Initialization Logic
    - [ ] Integrate the prompt into the map container with `localStorage` persistence.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Onboarding'

### Phase 4: Verification & E2E Integration
- [ ] Task: Comprehensive E2E Search Flow
    - [ ] Create `e2e/search-upgrade.spec.ts`.
    - [ ] Verify "My Location" and "Search This Area" flows across mobile/desktop.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Verification'
