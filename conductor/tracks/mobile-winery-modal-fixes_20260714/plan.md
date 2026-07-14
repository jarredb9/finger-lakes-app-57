# Implementation Plan - Mobile Winery Modal & Search UX Fixes

## Phase 1: Test Suite Preparation (TDD)
- [x] Task: Setup failing E2E and Unit test cases verifying layout styles and input focus/blur behaviors (d262a3d)
    - [x] Add E2E visual/layout check in winery-ui-integrity.spec.ts for mobile top anchoring (using custom viewport configuration)
    - [x] Add tests in PlaceAutocomplete.test.tsx to assert font size classes (text-base sm:text-sm) and document.activeElement.blur() calls on select
- [x] Task: Conductor - User Manual Verification 'Phase 1: Test Suite Preparation (TDD)' (Protocol in workflow.md)

## Phase 2: Implementation of Fixes
- [x] Task: Update Mobile Search Input (PlaceAutocomplete.tsx) (d87b013)
    - [x] Modify className to use `text-base sm:text-sm` for input
    - [x] Blur focus to collapse virtual keyboard on mobile suggestion select
- [x] Task: Update Winery Modal (winery-modal.tsx) (cf67aa0)
    - [x] Anchor modal to top-4 and set translate-y-0 on mobile viewports
    - [x] Restrict horizontal panning by applying overflow-x-hidden on DialogContent and inner scroll wrapper
    - [x] Set modal width to w-[95vw] on mobile to prevent edge spill
- [x] Task: Update Winery Map Hook (use-winery-map.ts) (36cc5c7)
    - [x] Delay opening modal by 150ms on suggestion selection to allow visual viewport to stabilize after virtual keyboard collapses
- [~] Task: Conductor - User Manual Verification 'Phase 2: Implementation of Fixes' (Protocol in workflow.md)

## Phase 3: Verification & Polish
- [ ] Task: Run full test suite and verify coverage
    - [ ] Run the surgical E2E tests (`winery-ui-integrity.spec.ts`) in container
    - [ ] Assert code coverage targets are met (>80%) and check types
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Verification & Polish' (Protocol in workflow.md)
