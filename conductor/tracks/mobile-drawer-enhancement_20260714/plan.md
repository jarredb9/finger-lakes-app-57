# Implementation Plan - Mobile Bottom Navigation and Drawer Enhancement

This plan covers transitioning the mobile navigation to a modern floating pill layout, implementing active highlight pills, and maintaining docking alignment with the bottom sheet drawer.

## Phase 1: Planning & TDD Setup [checkpoint: a0adca8]
- [x] Task: Design Refinement and Test Setup (be0976d)
    - [x] Research the CSS/Tailwind classes for centered floating container and custom transitions.
    - [x] Create E2E test file `e2e/mobile-nav-drawer.spec.ts` under mobile viewport configuration to test layout (floating, rounded corners, blur, border), active state styling, and sheet docking.
    - [x] Run the E2E test to confirm failures (TDD Red Phase).
- [x] Task: Conductor - User Manual Verification 'Phase 1: Planning & TDD Setup' (Protocol in workflow.md)

## Phase 2: Floating Navigation Bar and Tab Styling
- [x] Task: Implement Floating Pill Layout and Active Tab Styling (3861445)
    - [ ] Update `components/app-shell.tsx` mobile navigation container: convert to centered floating card with backdrop-blur, rounded-2xl, and border.
    - [ ] Refactor tab button styling in `components/app-shell.tsx`: add active highlight pill background and scale-105 transition effects for active tabs.
    - [ ] Update `e2e/smoke.spec.ts` and other tests to be resilient to the new bottom placement (avoiding strict `bottom-0` selector class checks).
    - [ ] Verify test failures in `e2e/mobile-nav-drawer.spec.ts` have changed or pass for nav-bar elements.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Floating Navigation Bar and Tab Styling' (Protocol in workflow.md)

## Phase 3: Bottom Sheet Docking Integration & Verification
- [x] Task: Adjust Sheet Docking and Verify E2E (7ace97b)
    - [ ] Adjust `InteractiveBottomSheet` styles/props in `components/app-shell.tsx` (and `components/ui/interactive-bottom-sheet.tsx` if needed) to dock cleanly above the new floating pill position (e.g. `bottom-24` instead of `bottom-16`).
    - [ ] Run E2E tests (`e2e/mobile-nav-drawer.spec.ts`, `e2e/smoke.spec.ts`) and confirm they all pass (Green Phase).
    - [ ] Check code style guides, type safety, linting, and WCAG contrast compliance.
- [x] Task: Conductor - User Manual Verification 'Phase 3: Bottom Sheet Docking Integration & Verification' (Protocol in workflow.md)
