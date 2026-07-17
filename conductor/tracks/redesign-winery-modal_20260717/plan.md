# Implementation Plan: Redesign Winery Modal UX/UI (`plan.md`)

## Phase 1: Test Scaffolding & Red Phase Verification
- [ ] Task: Write Failing Unit Tests (TDD Red Phase)
    - [ ] Add unit test assertions in `components/__tests__/winery-modal.test.tsx` verifying responsive rendering (Drawer on mobile, Dialog on desktop)
    - [ ] Verify that consolidated `WineryCommunityTab` properly merges friend avatars and review details (retaining text reviews and uploaded photos)
    - [ ] Verify that quick action buttons contain a Share button and retain individual item privacy locks (`favorite-privacy-toggle`, `wishlist-privacy-toggle`)
    - [ ] Add unit test assertions in `components/__tests__/WineryDetails.test.tsx` for Amenities tab list clicking behavior (including reservations and tasting fee keys) and Side-Sheet / Sub-Drawer reviews panel trigger
    - [ ] Verify that new unit tests fail initially on the existing modal implementation
- [ ] Task: Adapt E2E Test Suite and Write Failing E2E Tests (TDD Red Phase)
    - [ ] Update [winery-qa-fallback.spec.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/winery-qa-fallback.spec.ts) to adapt it to trigger Q&A reviews using the new Amenity row clicks rather than the legacy `qna-select` dropdown.
    - [ ] Create a new E2E test file `e2e/winery-modal-redesign.spec.ts` (using Playwright) to verify viewport resizing, switching bottom/right tabs, clicking the segmented control triggers, clicking any of the 8 amenities to trigger Side-Sheet/Sub-Drawer reviews, and clicking the "Route From Current" action
    - [ ] Verify that E2E tests fail initially
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Test Scaffolding & Red Phase Verification' (Protocol in workflow.md)

## Phase 2: Core Components & Layout Implementation (Green Phase)
- [ ] Task: Refactor Winery Modal Structure (Desktop Dialog & Mobile Drawer)
    - [ ] Refactor `winery-modal.tsx` to render the shadcn/ui `Drawer` component on viewports `< sm` (using Vaul drawer) and `Dialog` component on viewports `>= sm`
    - [ ] Implement the desktop two-column grid layout (`max-w-4xl`) and mobile single-column stacking
    - [ ] Implement the dynamic Right Column / Bottom drawer `Tabs` component with 4 flat navigation tabs (Community, Amenities, My Visits, Add to Trip) using underline active indicators (no backgrounds)
- [ ] Task: Refactor Actions, Social Feed, & Visits
    - [ ] Refactor `WineryActionsPresentational.tsx` to add the Share button and redesign individual Favorite/Wishlist privacy locks into a decluttered compact layout, keeping `favorite-privacy-toggle` and `wishlist-privacy-toggle` test IDs and click handlers intact
    - [ ] Consolidate `FriendActivity.tsx` and `FriendRatings.tsx` into `WineryCommunityTab.tsx`. Display the friend avatar summaries at the top, and a feed of detailed friend review cards (name, rating stars, written text reviews, and photo uploads) below. Remove standalone files.
    - [ ] Refactor `MapNavigation.tsx` to support `latitude` and `longitude` coordinate-based routing, add Waze support (coordinates-based routing `waze://?ll=lat,lng`), allow a custom trigger child, and support dropdown menu style popovers on desktop to choose maps.
    - [ ] Refactor `VisitCardHistory.tsx` to display a horizontal strip of thumbnail previews of photos uploaded for each visit. Ensure '+ Log Visit' and 'Edit Visit' triggers route to the global `VisitFormModal` via `useUIStore.openVisitForm` to reuse `VisitForm.tsx` and preserve E2E testing hooks.
- [ ] Task: Implement the Segmented Details Card
    - [ ] Build the Segmented Details Card with an iOS-style pill switcher bar at the top (Overview vs. AI Insights) using encapsulated capsule active slide animations
    - [ ] Implement Overview segment (Open status, Web/Phone/Email icons, Address, Expandable weekly hours dropdown)
    - [ ] Add the "Route From Current Location" button next to the address, wrapping it with the refactored `MapNavigation` component to present a choice of Google Maps, Apple Maps, or Waze.
    - [ ] Implement AI Insights segment (Gemini generative summary and Neighborhood area description)
- [ ] Task: Implement Interactive Amenities Tab & Sliding Reviews Sheet
    - [ ] List all 8 logistics checklist rows inside the Amenities Tab (Parking, Restrooms, Tasting Room, Dog Friendly, Picnic Area, EV Charging, Reservations Required, Tasting Fee)
    - [ ] Build the sliding Side-Sheet (`Sheet` component from shadcn/ui) that slides in from the right edge of the modal on desktop (covering the tabs)
    - [ ] Build the sub-drawer (`Drawer` component from shadcn/ui) that slides up from the bottom of the screen on mobile (covering the lower 50%)
    - [ ] Make all 8 logistics rows in the Amenities Tab clickable to launch this reviews panel overlay
    - [ ] Update `WineryQnA.tsx` to act as the reviews panel content, removing the select dropdown trigger, and integrating pagination controls (Arrows `<` and `>`) and status indicator (e.g. "1 of 3")
    - [ ] Update `WineryQnA.tsx`'s question definitions array to add keyword search configurations for the 4 reviews-backed logistics rows: Restrooms, Tasting Room, Picnic Area, and Tasting Fee
- [ ] Task: Verify Green Phase (Passing Tests)
    - [ ] Run unit and E2E tests to verify they all pass
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Core Components & Layout Implementation' (Protocol in workflow.md)

## Phase 3: Glassmorphism, Polish, & Accessibility Verification
- [ ] Task: UI Polish & Glassmorphic Styling
    - [ ] Apply backdrop blurs (`backdrop-blur-md bg-background/85`), transparent borders (`border-border/50`), and glowing drop shadows (`shadow-2xl shadow-primary/5`)
    - [ ] Add micro-animations (hover/active state transitions, scale effects) on action buttons and badges
    - [ ] Style the Loading Skeletons to match the final two-column / drawer layout structure perfectly to ensure DOM stability
- [ ] Task: Accessibility (a11y) & Final Test Run
    - [ ] Verify keyboard accessibility for drawer, dialog, tabs, and sheet controls
    - [ ] Run full local test suite and audit coverage to ensure >80% coverage
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Glassmorphism, Polish, & Accessibility Verification' (Protocol in workflow.md)
