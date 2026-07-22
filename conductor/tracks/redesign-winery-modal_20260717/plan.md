# Implementation Plan: Redesign Winery Modal UX/UI (`plan.md`)

## Phase 1: Test Scaffolding & Red Phase Verification
- [x] Task: Write Failing Unit Tests (TDD Red Phase)
    - [x] Add unit test assertions in `components/__tests__/winery-modal.test.tsx` verifying responsive rendering (Drawer on mobile, Dialog on desktop)
    - [x] Verify that consolidated `WineryCommunityTab` properly merges friend avatars and review details (retaining text reviews and uploaded photos)
    - [x] Verify that quick action buttons contain a Share button and retain individual item privacy locks (`favorite-privacy-toggle`, `wishlist-privacy-toggle`)
    - [x] Add unit test assertions in `components/__tests__/WineryDetails.test.tsx` for Amenities tab list clicking behavior (including reservations and tasting fee keys) and Side-Sheet / Sub-Drawer reviews panel trigger
    - [x] Verify that new unit tests fail initially on the existing modal implementation
- [x] Task: Adapt E2E Test Suite and Write Failing E2E Tests (TDD Red Phase)
    - [x] Update [winery-qa-fallback.spec.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/e2e/winery-qa-fallback.spec.ts) to adapt it to trigger Q&A reviews using the new Amenity row clicks rather than the legacy `qna-select` dropdown.
    - [x] Create a new E2E test file `e2e/winery-modal-redesign.spec.ts` (using Playwright) to verify viewport resizing, switching bottom/right tabs, clicking the segmented control triggers, clicking any of the 8 amenities to trigger Side-Sheet/Sub-Drawer reviews, and clicking the "Route From Current" action
    - [x] Verify that E2E tests fail initially
- [x] Task: Conductor - User Manual Verification 'Phase 1: Test Scaffolding & Red Phase Verification' (Protocol in workflow.md)

## Phase 2: Core Components & Layout Implementation (Green Phase)
- [x] Task: Refactor Winery Modal Structure (Desktop Dialog & Mobile Drawer) [commit: 440fc79]
    - [x] Refactor `winery-modal.tsx` to render the shadcn/ui `Drawer` component on viewports `< sm` (using Vaul drawer) and `Dialog` component on viewports `>= sm`
    - [x] Implement the desktop two-column grid layout (`max-w-4xl`) and mobile single-column stacking
    - [x] Implement the dynamic Right Column / Bottom drawer `Tabs` component with 4 flat navigation tabs (Community, Amenities, My Visits, Add to Trip) using underline active indicators (no backgrounds)
- [x] Task: Refactor Actions, Social Feed, & Visits [commit: 5e48c37]
    - [x] Refactor `WineryActionsPresentational.tsx` to add the Share button and redesign individual Favorite/Wishlist privacy locks into a decluttered compact layout, keeping `favorite-privacy-toggle` and `wishlist-privacy-toggle` test IDs and click handlers intact
    - [x] Consolidate `FriendActivity.tsx` and `FriendRatings.tsx` into `WineryCommunityTab.tsx`. Display the friend avatar summaries at the top, and a feed of detailed friend review cards (name, rating stars, written text reviews, and photo uploads) below. Remove standalone files.
    - [x] Refactor `MapNavigation.tsx` to support `latitude` and `longitude` coordinate-based routing, add Waze support (coordinates-based routing `waze://?ll=lat,lng`), allow a custom trigger child, and support dropdown menu style popovers on desktop to choose maps.
    - [x] Refactor `VisitCardHistory.tsx` to display a horizontal strip of thumbnail previews of photos uploaded for each visit. Ensure '+ Log Visit' and 'Edit Visit' triggers route to the global `VisitFormModal` via `useUIStore.openVisitForm` to reuse `VisitForm.tsx` and preserve E2E testing hooks.
- [x] Task: Implement the Segmented Details Card [commit: bae048a]
    - [x] Build the Segmented Details Card with an iOS-style pill switcher bar at the top (Overview vs. AI Insights) using encapsulated capsule active slide animations
    - [x] Implement Overview segment (Open status, Web/Phone/Email icons, Address, Expandable weekly hours dropdown)
    - [x] Add the "Route From Current Location" button next to the address, wrapping it with the refactored `MapNavigation` component to present a choice of Google Maps, Apple Maps, or Waze.
    - [x] Implement AI Insights segment (Gemini generative summary and Neighborhood area description)
- [x] Task: Implement Interactive Amenities Tab & Sliding Reviews Sheet [commit: 2a7b0e0, 6acbe83]
    - [x] List all 8 logistics checklist rows inside the Amenities Tab (Parking, Restrooms, Tasting Room, Dog Friendly, Picnic Area, EV Charging, Reservations Required, Tasting Fee)
    - [x] Build the sliding Side-Sheet (`Sheet` component from shadcn/ui) that slides in from the right edge of the modal on desktop (covering the tabs)
    - [x] Build the sub-drawer (`Drawer` component from shadcn/ui) that slides up from the bottom of the screen on mobile (covering the lower 50%)
    - [x] Make all 8 logistics rows in the Amenities Tab clickable to launch this reviews panel overlay
    - [x] Update `WineryQnA.tsx` to act as the reviews panel content, removing the select dropdown trigger, and integrating pagination controls (Arrows `<` and `>`) and status indicator (e.g. "1 of 3")
    - [x] Update `WineryQnA.tsx`'s question definitions array to add keyword search configurations for the 4 reviews-backed logistics rows: Restrooms, Tasting Room, Picnic Area, and Tasting Fee
- [x] Task: Verify Green Phase (Passing Tests)
    - [x] Run unit and E2E tests to verify they all pass (7/7 in `e2e/winery-modal-ux.spec.ts`)
- [x] Task: Conductor - User Manual Verification 'Phase 2: Core Components & Layout Implementation' (Protocol in workflow.md)

## Phase 3: Visual Polish, Layout Fixes, & Accessibility
- [x] Task: Minor CSS polish (micro-animations, a11y keyboard triggers, skeleton tweaks) [commit: d8b86d9]
- [x] Task: Hero Image & Overlay Layout Restructure
    - [x] Restore full-width hero image to very top of mobile `renderMobileLayout()` and desktop `renderDesktopLayout()` in `winery-modal.tsx` (remove top margins/paddings for flush drawer-edge look)
    - [x] Overlay a translucent title card directly on top of the lower part of the Hero Image containing winery name, rating stars, and short address line to save vertical space
    - [x] Update loading skeletons to include hero image placeholder and match overlay structure
- [x] Task: Quick Actions & Navigation Redesign
    - [x] Refactor `WineryActionsPresentational.tsx` from inline button row to a `grid grid-cols-4 gap-2` of vertical icon+label tiles with `bg-muted/30 rounded-xl border border-border/50` styling
    - [x] Render privacy lock toggles as small overlay badges on Favorite/Wishlist tiles (preserve `favorite-privacy-toggle` and `wishlist-privacy-toggle` data-testids)
    - [x] Add a prominent, full-width "Log Visit" outline button with a pencil icon directly below the actions grid (uses `log-visit-button` test ID)
- [x] Task: Contact Card Split & Contrast Improvements
    - [x] Restructure Overview segment in `WineryDetails.tsx` as a two-column split card: Left (Open status + Today's hours with chevron dropdown) | Right (Contact & Route title + row of 4 circular buttons: Phone, Website, Email, and Directions). The Directions circular button must wrap `MapNavigation` and use `route-from-current` test ID.
    - [x] Update card backgrounds from invisible `bg-background/85` to visible `bg-muted/40 backdrop-blur-md` for real contrast (aligned with floating nav pill design language)
    - [x] Restyle amenity rows from individually bordered cards to clean list rows with subtle bottom dividers (`border-b border-border/30 last:border-0`)
- [x] Task: Scrollable Navigation Tabs
    - [x] Integrate **AI Insights** directly into the bottom navigation tab row as a 5th tab (Community, Amenities, AI Insights, Visits, Trip) and remove the old segment switcher to save height
    - [x] Restyle the tab container to be scrollable (`overflow-x-auto scrollbar-none flex-nowrap`) so headers don't squish on small screen widths (like iPhone SE/15)
- [x] Task: Accessibility (a11y) & Final Test Run
    - [x] Run full Jest unit test suite and Playwright E2E tests to verify no regressions
    - [x] Verify keyboard accessibility for all interactive elements
- [X] Task: Conductor - User Manual Verification 'Phase 3: Visual Polish, Layout Fixes, & Accessibility' (Protocol in workflow.md)

## Phase 4: Database Schema Migration & Data Layer [checkpoint: 61577b6]
- [x] Task: Create Backwards-Compatible Database Migration [commit: 53d7e24]
    - [x] Create migration script `supabase/migrations/20260721000000_add_winery_varietals_and_vibe_tags.sql` adding `varietals` (`jsonb DEFAULT '[]'::jsonb`) and `vibe_tags` (`text[] DEFAULT '{}'::text[]`) columns to `public.wineries` using expand-and-contract pattern.
    - [x] Update `lib/database.types.ts` and `lib/types.ts` to type `varietals` and `vibe_tags`.
- [x] Task: Weather Integration Service [commit: fc522d2]
    - [x] Build `lib/services/weatherService.ts` to query live weather data (temperature, wind, condition) using Open-Meteo API with client-side/in-memory caching (15-min TTL).

## Phase 5: Test Scaffolding & TDD Red Phase (New Components & Snap States)
- [x] Task: Write Failing Unit Tests (TDD Red Phase)
    - [x] Write unit tests in `components/__tests__/WineryVarietalsTab.test.tsx` verifying rendering of grape varietal cards (*Dry Riesling, Cabernet Franc, Ice Wine*), flavor profile sliders, and Gemini tasting notes.
    - [x] Write unit tests in `components/__tests__/WineryWeatherWidget.test.tsx` verifying temperature display and weather condition labels.
    - [x] Update `components/__tests__/winery-modal.test.tsx` with assertions for 3-Tier Multi-Snap Drawer states (`300px`, `550px`, `1.0`), Open/Closed tag in Peek state, and swapped `Log Visit` CTA button.
    - [x] Verify that all new unit tests fail initially (Red Phase).
- [x] Task: Adapt & Write Failing E2E Tests (TDD Red Phase)
    - [x] Create `e2e/winery-modal-snap-drawer.spec.ts` to test drawer snapping between Peek, Half, and Full states, clicking the swapped `Log Visit` button in Peek view, and interacting with Varietals tab sliders.
    - [x] Verify E2E tests fail initially (Red Phase).

## Phase 6: Green Phase Component & Layout Implementation [checkpoint: 28bf3a1]
- [x] Task: Implement Apple Maps-Style 3-Tier Multi-Snap Drawer
    - [x] Update Vaul/shadcn `Drawer` in `winery-modal.tsx` to support 3 dynamic snap points (`300px`, `550px`, `1.0`) via `snapPoints` prop and `activeSnapPoint` state tracking.
    - [x] Implement **Peek State (~300px / ~30vh)**: Render photo preview, title overlay card, explicit `🟢 OPEN NOW` / `🔴 CLOSED` status tag, `Directions` button (`route-from-current`), and `Log Visit` CTA button (`log-visit-button` opening `openVisitForm`) swapped from `Add to Trip`.
    - [x] Implement **Half State (~550px / ~60vh)**: Render hero photo carousel with pagination dots, 4-column quick action grid (*Favorite, Wishlist, Street View, Share*) with privacy badges, live outdoor weather widget (`☀️ 74°F Lake Breeze`), full-width "Log Visit" CTA button, and horizontal "At-a-Glance" Vibe & Specialty Badges scroller (`🍷 Riesling Specialist`, `🐶 Dog Friendly`, `🌅 Sunset Views`, `⚡ EV Charging`).
    - [x] Implement **Full State (1.0 / ~90vh)**: Render sticky compact header bar and 5 scrollable tabs (`Community`, `Amenities`, `AI Insights`, `Varietals & Tasting`, `Trip`).
- [x] Task: Build Swipeable Hero Photo Carousel & Lightbox
    - [x] Integrate `embla-carousel-react` or horizontal snap carousel inside `WineryDetails.tsx` to cycle through `photo_references`.
    - [x] Build full-screen image Lightbox modal trigger when tapping any photo in the carousel.
- [x] Task: Build Varietals & Tasting Profile Tab Component
    - [x] Create `WineryVarietalsTab.tsx` component to display visual wine varietal cards (*Dry Riesling, Cabernet Franc, Ice Wine*) with dual linear flavor profile sliders (Dry ↔ Sweet, Light ↔ Full Body) and Gemini AI Tasting Notes.
    - [x] Wire keyword fallback adapter for un-enriched wineries scanning `winery.reviews` for grape varietals.
- [x] Task: Mobile Drawer & Hero Layout Refactor (Remediation)
    - [x] Refactor `components/ui/drawer.tsx` to use native `vaul` drawer with bottom sheet placement (`fixed inset-x-0 bottom-0 h-full`) and controlled `snapPoints={['300px', '550px', 1]}` state so 3-tier snapping functions natively.
    - [x] Render a single static hero photo on mobile (rather than swipeable carousel) to resolve horizontal overflow scroll conflicts that hijack vertical drag gestures in Full state.
    - [x] Restore flush hero image placement to the absolute top edge of the mobile drawer (`rounded-t-[20px]`), removing block elements above the photo and rendering status badges (`🟢 OPEN NOW`, `Directions`) as absolute translucent overlay pills directly over the photo.
    - [x] Deduplicate `🟢 OPEN NOW` / `🔴 CLOSED` status badges by consolidating them into the floating hero photo overlay and removing redundant open/closed indicators from the contact card in `WineryDetails.tsx`.

## Phase 7: Feature Audit, Testing & Final Verification
- [ ] Task: Modal Component Feature Audit
    - [ ] Audit all 7 modal components (`winery-modal.tsx`, `WineryDetails.tsx`, `WineryActionsPresentational.tsx`, `WineryCommunityTab.tsx`, `TripPlannerSection.tsx`, `VisitCardHistory.tsx`, `WineryQnA.tsx`) to verify zero feature or data loss using commit d8b86d9c21c7680e0e8ca70282470407f3ccc58d as a reference for fully featured components.
    - [ ] Verify preservation of all 15+ test IDs (`favorite-privacy-toggle`, `wishlist-privacy-toggle`, `log-visit-button`, `route-from-current`, `amenity-row-*`, `close-qna-button`, `trip-badge`, etc.).
- [ ] Task: Automated Testing Suite Verification
    - [ ] Run full Jest unit test suite (`npx jest`) to achieve 100% clean test passes across all suites.
    - [ ] Run Playwright E2E tests (`./scripts/run-e2e-container.sh`) to verify full integration.
- [ ] Task: Conductor - User Manual Verification 'Phase 7: Feature Audit, Testing & Final Verification' (Protocol in workflow.md)

## Phase: Review Fixes
- [x] Task: Apply review suggestions [commit: 1aa77e1]
    - [x] Add screen reader accessible `SheetHeader` (`SheetTitle`, `SheetDescription`) and `DrawerHeader` (`DrawerTitle`, `DrawerDescription`) inside `WineryDetails.tsx` to fix Radix UI accessibility console errors.
    - [x] Update `closeButton` selector in `e2e/winery-qa-fallback.spec.ts` to target `data-testid="close-qna-button"` to resolve Playwright strict mode click violation.
- [x] Task: Resolve Mobile Drawer Gesture Conflicts, Snap Jitter, and Map Dismissal [commit: 07765c8]
    - [x] Update `components/ui/drawer.tsx` to use standard bottom sheet positioning (`fixed inset-x-0 bottom-0 h-full`) for correct Vaul translation coordinate mapping.
    - [x] Separate the non-scrollable hero photo/title header from the scrollable tabs content container in `renderMobileLayout()` to eliminate vertical scroll gesture capture conflicts.
    - [x] Remove conflicting layout transition classes (`transition-all`) to stop ResizeObserver loops and layout jitter during snapping.
    - [x] Enable native swipe-down dismissal past Peek state by setting `dismissible={true}` on `<Drawer>`, and configure empty map background clicks in `MapView.tsx` to close the modal.
    - [x] Write and verify pointer drag gesture tests in `e2e/winery-modal-snap-drawer.spec.ts` simulating dragging up to Full and down back to Peek.
- [x] Task: Fix Peek View button sizing, title card overlap, and bottom whitespace [commit: 8070690]
    - [x] Wrap MapNavigation in a flex-1 wrapper to ensure equal button sizing
    - [x] Move title card outside the overflow-hidden header wrapper to position it half-on/half-off without clipping
    - [x] Set peek view hero image height to h-48 to fill the 300px drawer height exactly

