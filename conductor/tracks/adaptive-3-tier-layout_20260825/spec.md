# Specification: Adaptive 3-Tier Layout Architecture (Mobile, Tablet, Desktop)

## 1. Overview
The Winery Visit Planner currently uses a binary 2-tier breakpoint system (`< 768px` mobile vs `≥ 768px` desktop). On portrait tablets (e.g., iPad 768×1024, iPad 810×1080, iPad Air 820×1180), a fixed 400px desktop sidebar consumes over 50% of the horizontal screen real estate, causing squished map strips, gesture collisions, and modal obstruction.

This track introduces an **Adaptive 3-Tier Layout Architecture** that dynamically adjusts the UI based on device ergonomics and viewport dimensions:
1. **Tier 1 (Mobile - `< 768px`):** Full-bleed Mapbox canvas + interactive Vaul bottom sheet drawer + bottom navigation bar.
2. **Tier 2 (Tablet Portrait - `768px` to `< 1024px`):** Full-screen Mapbox canvas with an elevated, collapsible floating glassmorphic card drawer (`TabletFloatingDrawer`, ~380px wide) and a non-blocking floating winery detail sheet overlay.
3. **Tier 3 (Tablet Landscape & Desktop - `≥ 1024px`):** Persistent 400px split-pane dual sidebar container (`desktop-sidebar-container`) + flex map canvas + centered modal dialog (`DesktopWineryModal`).

---

## 2. Functional Requirements

### 2.1 Unified Layout Tier Hook (`hooks/use-layout-tier.ts`)
- Centralized Breakpoint Variables:
  - `DEFAULT_TABLET_BREAKPOINT = 768` (lower bound for tablet tier)
  - `DEFAULT_DESKTOP_BREAKPOINT = 1024` (lower bound for desktop tier)
  - `LAYOUT_BREAKPOINTS` configuration constant
- Implement `useLayoutTier(options?: { tabletBreakpoint?: number; desktopBreakpoint?: number })` with SSR-safe hydration resilience.
- Provide reactive properties:
  - `tier: 'mobile' | 'tablet' | 'desktop'`
  - `isMobile: boolean` (`< tabletBreakpoint`, default `< 768px`)
  - `isTablet: boolean` (`>= tabletBreakpoint && < desktopBreakpoint`, default `768px – 1023px`)
  - `isDesktop: boolean` (`>= desktopBreakpoint`, default `≥ 1024px`)
  - `isTouch: boolean` (touch-tier / pointer detection indicator)
- Ensure zero hydration layout flash or layout shift.

### 2.2 Tablet Floating Drawer (`components/layout/TabletFloatingDrawer.tsx`)
- Rendered as an elevated overlay card (`absolute top-4 left-4 bottom-4 w-[380px] z-20`) on top of the 100% full-screen map canvas.
- Glassmorphic styling: `bg-background/95 backdrop-blur-md shadow-2xl rounded-2xl border`.
- Dual states:
  - **Expanded:** Contains search bar, filter controls, winery search results list, and trip planner tabs.
  - **Collapsed / Minimized:** Collapses into an ergonomic floating pill bar (`w-auto h-12`) displaying active search term, filter badge count, and an expand toggle button (`ChevronRight` / `PanelLeftOpen`).
- Non-blocking map gestures: Absolute floating positioning allows uninhibited pinch-to-zoom, panning, and rotation across the full underlying WebGL map canvas.

### 2.3 Responsive Winery Detail Experience
- **Mobile (`< 768px`):** `MobileWineryDrawer` (Vaul drawer with snap points `['300px', '520px', 1]`).
- **Tablet (`768px – 1024px`):** Non-blocking floating detail sheet overlay / card positioned ergonomically to preserve map context.
- **Desktop (`≥ 1024px`):** `DesktopWineryModal` (Centered 2-column modal dialog).
- Update `components/winery/use-winery-modal-state.ts` and `components/winery-modal.tsx` to handle 3-tier presentation logic seamlessly.

### 2.4 App Shell Integration (`components/app-shell.tsx`)
- Conditionally render layout components per tier without DOM instability or breaking `data-state` contracts.
- Ensure smooth transitions and preserve Zustand state (active filters, selected winery, trip items) when resizing between tiers.

### 2.5 Touch Target & Control Standardization (`components/map/map-controls.tsx`)
- Standardize all interactive controls (filter chips, style toggles like Outdoors / Streets, search inputs, zoom/compass buttons) to satisfy WCAG 2.5.5 and Apple HIG standards:
  - Minimum touch target sizing: `min-h-[44px]` and `min-w-[44px]` on `mobile` and `tablet` tiers.
  - Standardized touch padding (`px-3 py-2`) and spacing.

---

## 3. Non-Functional & Quality Requirements
- **DOM Stability:** Map and list containers maintain their test IDs and `data-state` attributes (`ready | loading | error`) during viewport transitions.
- **Hydration Safety:** Initial SSR render defaults cleanly without client-side mismatch errors.
- **Zero Regressions:** Existing mobile swipe-to-dismiss drawer flows and desktop drag-and-drop itinerary builders must continue functioning without interruption.

---

## 4. Acceptance Criteria
- [ ] **Mobile (< 768px):** Bottom tab navigation, InteractiveBottomSheet drawer, full-bleed map, and MobileWineryDrawer operate correctly.
- [ ] **Tablet Portrait (768px – 1024px):** Full-screen map canvas with floating card drawer overlay (TabletFloatingDrawer). Drawer collapses into pill bar and expands on demand. Winery details display in a non-blocking floating sheet.
- [ ] **Desktop & Tablet Landscape (≥ 1024px):** Persistent 400px split-pane sidebar and centered DesktopWineryModal dialog.
- [ ] **Touch Target Compliance:** Filter chips, toggles, and buttons meet 44×44px minimum sizing on touch/tablet tiers.
- [ ] **Automated Testing:** Playwright E2E tests pass across `chromium` (desktop 1280px), `mobile-safari` (iPhone 390px), and tablet emulation (iPad 810×1080).

---

## 5. Out of Scope
- Native iOS/Android Swift/Kotlin app builds.
- Refactoring Mapbox vector tile layer data sources or backend PostGIS RPCs.
