# Implementation Plan: Adaptive 3-Tier Layout Architecture

## Phase 1: Foundation & Reactive Breakpoint Hook (`hooks/use-layout-tier.ts`) [checkpoint: fdac56d]
- [x] Task: Write unit tests for `useLayoutTier` hook across mobile, tablet, and desktop breakpoints (3d1776c)
    - [x] Create test suite in `hooks/__tests__/use-layout-tier.test.ts` testing SSR defaults, custom breakpoint overrides, window resize listeners, tier resolution (`mobile`, `tablet`, `desktop`), and touch capability flags
- [x] Task: Implement `useLayoutTier` hook in `hooks/use-layout-tier.ts` (3d1776c)
    - [x] Export configurable breakpoint variables (`DEFAULT_TABLET_BREAKPOINT = 768`, `DEFAULT_DESKTOP_BREAKPOINT = 1024`, `LAYOUT_BREAKPOINTS`) and `LayoutTier` type
    - [x] Implement reactive media query listeners supporting optional custom breakpoint overrides and SSR-safe initial values
    - [x] Export helper booleans (`isMobile`, `isTablet`, `isDesktop`, `isTouch`)
- [x] Task: Conductor - User Manual Verification 'Phase 1: Foundation & Reactive Breakpoint Hook' (Protocol in workflow.md) (fdac56d)

## Phase 2: Tablet Floating Drawer Component & Collapsible State [checkpoint: b86a299]
- [x] Task: Write unit and component tests for `TabletFloatingDrawer` (110e8a9)
    - [x] Create test suite in `components/__tests__/TabletFloatingDrawer.test.tsx` testing expanded state, collapsed pill bar state, badge counters, and search summary rendering
- [x] Task: Implement `TabletFloatingDrawer` in `components/layout/TabletFloatingDrawer.tsx` (110e8a9)
    - [x] Build glassmorphic floating overlay card with absolute positioning (`top-4 left-4 bottom-4 w-[380px] z-20`)
    - [x] Implement collapsible floating pill state with toggle trigger, active filter indicator badges, and search input synchronization
    - [x] Embed wineries list, trip planner, and filter controls within the expanded state
- [x] Task: Conductor - User Manual Verification 'Phase 2: Tablet Floating Drawer Component & Collapsible State' (Protocol in workflow.md) (b86a299)

## Phase 3: Responsive Winery Details & Touch Target Standardization [checkpoint: 11fd4e8]
- [x] Task: Write unit tests for responsive winery modal state and touch target styling (40200e0)
    - [x] Create tests for `useWineryModalState` tier adaptation and `map-controls.tsx` minimum 44px touch target sizing
- [x] Task: Update `useWineryModalState` and winery modal components for 3-tier layout (40200e0)
    - [x] Update `components/winery/use-winery-modal-state.ts` to support tier-aware presentation (`MobileWineryDrawer` on mobile, non-blocking floating sheet/drawer on tablet, `DesktopWineryModal` on desktop)
    - [x] Update `components/winery-modal.tsx` to render the floating sheet variant on tablet viewports
- [x] Task: Standardize touch targets in `components/map/map-controls.tsx` (40200e0)
    - [x] Ensure filter chips, map style toggles, search inputs, and map action buttons enforce `min-h-[44px] min-w-[44px]` and `px-3 py-2` on mobile/tablet tiers
- [x] Task: Conductor - User Manual Verification 'Phase 3: Responsive Winery Details & Touch Target Standardization' (Protocol in workflow.md) (11fd4e8)

## Phase 4: App Shell Integration & E2E Verification [checkpoint: e30ee96]
- [x] Task: Update `components/app-shell.tsx` with 3-tier conditional rendering (b54d82e)
    - [x] Integrate `useLayoutTier` in `app-shell.tsx` to mount `InteractiveBottomSheet` (mobile), `TabletFloatingDrawer` (tablet), or `desktop-sidebar-container` (desktop) while maintaining DOM stability and `data-state` contracts
    - [x] Ensure map canvas remains 100% full-screen in mobile and tablet tiers and flex-1 in desktop tier
- [x] Task: Write comprehensive Playwright E2E suite in `e2e/responsive-layout.spec.ts` (3fdeaff)
    - [x] Test mobile tier layout (< 768px): bottom navigation, bottom sheet drawer, and mobile winery drawer
    - [x] Test tablet portrait tier (768px - 1024px e.g. iPad 810×1080): full-screen map, floating drawer expansion/minimization, floating winery details, and 44px touch targets
    - [x] Test desktop tier (≥ 1024px): 400px split-pane sidebar and desktop modal dialog
    - [x] Verify hydration stability and state preservation during viewport resizing
- [x] Task: Conductor - User Manual Verification 'Phase 4: App Shell Integration & E2E Verification' (Protocol in workflow.md) (e30ee96)
