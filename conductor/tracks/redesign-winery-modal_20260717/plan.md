# Implementation Plan: Redesign Winery Modal UX/UI (`plan.md`)

## Phase 1: Test Scaffolding & Red Phase Verification
- [ ] Task: Write Failing Unit Tests (TDD Red Phase)
    - [ ] Add unit test assertions in `components/__tests__/winery-modal.test.tsx` verifying responsive rendering (Drawer on mobile, Dialog on desktop)
    - [ ] Verify that standalone `FriendRatings` component is removed and star ratings are checked in `FriendActivity`
    - [ ] Verify that quick action buttons contain a Share button and lack privacy toggle locks
    - [ ] Add unit test assertions in `components/__tests__/WineryDetails.test.tsx` for Amenities tab list clicking behavior (including reservations and tasting fee keys) and Side-Sheet / Sub-Drawer reviews panel trigger
    - [ ] Verify that new unit tests fail initially on the existing modal implementation
- [ ] Task: Write Failing E2E Tests (TDD Red Phase)
    - [ ] Create a new E2E test file `e2e/winery-modal-redesign.spec.ts` (using Playwright) to verify viewport resizing, switching bottom/right tabs, clicking the segmented control triggers, clicking any of the 8 amenities to trigger Side-Sheet/Sub-Drawer reviews, and clicking the "Route From Current" action
    - [ ] Verify that E2E tests fail initially
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Test Scaffolding & Red Phase Verification' (Protocol in workflow.md)

## Phase 2: Core Components & Layout Implementation (Green Phase)
- [ ] Task: Refactor Winery Modal Structure (Desktop Dialog & Mobile Drawer)
    - [ ] Refactor `winery-modal.tsx` to render the shadcn/ui `Drawer` component on viewports `< sm` (using Vaul drawer) and `Dialog` component on viewports `>= sm`
    - [ ] Implement the desktop two-column grid layout (`max-w-4xl`) and mobile single-column stacking
    - [ ] Implement the dynamic Right Column / Bottom drawer `Tabs` component with 4 flat navigation tabs (Community, Amenities, My Visits, Add to Trip) using underline active indicators (no backgrounds)
- [ ] Task: Refactor Actions, Social Feed, & Visits
    - [ ] Refactor `WineryActionsPresentational.tsx` to add the Share button and remove individual Favorite/Wishlist privacy locks, keeping only toggle states
    - [ ] Delete `FriendRatings.tsx` and remove its references in `winery-modal.tsx`
    - [ ] Refactor `FriendActivity.tsx` / `FriendActivityFeed.tsx` to display the friend's star rating directly inside their activity feed cards
    - [ ] Refactor `VisitCardHistory.tsx` to display a horizontal strip of thumbnail previews of photos uploaded for each visit
- [ ] Task: Implement the Segmented Details Card
    - [ ] Build the Segmented Details Card with an iOS-style pill switcher bar at the top (Overview vs. AI Insights) using encapsulated capsule active slide animations
    - [ ] Implement Overview segment (Open status, Web/Phone/Email icons, Address, Expandable weekly hours dropdown)
    - [ ] Add the "Route From Current Location" button next to the address, connecting it to the map routing triggers
    - [ ] Implement AI Insights segment (Gemini generative summary and Neighborhood area description)
- [ ] Task: Implement Interactive Amenities Tab & Sliding Reviews Sheet
    - [ ] List all 8 logistics checklist rows inside the Amenities Tab (Parking, Restrooms, Tasting Room, Dog Friendly, Picnic Area, EV Charging, Reservations Required, Tasting Fee)
    - [ ] Build the sliding Side-Sheet (`Sheet` component from shadcn/ui) that slides in from the right edge of the modal on desktop (covering the tabs)
    - [ ] Build the sub-drawer (`Drawer` component from shadcn/ui) that slides up from the bottom of the screen on mobile (covering the lower 50%)
    - [ ] Make all 8 logistics rows in the Amenities Tab clickable to launch this reviews panel overlay
    - [ ] Refactor `WineryQnA.tsx` to act as the reviews panel content, removing the select dropdown trigger, and integrating pagination controls (Arrows `<` and `>`) and status indicator (e.g. "1 of 3")
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
