# Implementation Plan: Adaptive 3-Tier Layout Architecture

## Phase 1: Foundation & Reactive Breakpoint Hook (`hooks/use-layout-tier.ts`)
- [ ] Task: Write unit tests for `useLayoutTier` hook across mobile, tablet, and desktop breakpoints
    - [ ] Create test suite in `__tests__/hooks/use-layout-tier.test.ts` testing SSR defaults, window resize listeners, tier resolution (`mobile`, `tablet`, `desktop`), and touch capability flags
- [ ] Task: Implement `useLayoutTier` hook in `hooks/use-layout-tier.ts`
    - [ ] Define `LayoutTier` type and reactive media query listeners with SSR-safe initial values
    - [ ] Export helper booleans (`isMobile`, `isTablet`, `isDesktop`, `isTouch`)
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Foundation & Reactive Breakpoint Hook' (Protocol in workflow.md)

## Phase 2: Tablet Floating Drawer Component & Collapsible State
- [ ] Task: Write unit and component tests for `TabletFloatingDrawer`
    - [ ] Create test suite in `__tests__/components/TabletFloatingDrawer.test.tsx` testing expanded state, collapsed pill bar state, badge counters, and search summary rendering
- [ ] Task: Implement `TabletFloatingDrawer` in `components/layout/TabletFloatingDrawer.tsx`
    - [ ] Build glassmorphic floating overlay card with absolute positioning (`top-4 left-4 bottom-4 w-[380px] z-20`)
    - [ ] Implement collapsible floating pill state with toggle trigger, active filter indicator badges, and search input synchronization
    - [ ] Embed wineries list, trip planner, and filter controls within the expanded state
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Tablet Floating Drawer Component & Collapsible State' (Protocol in workflow.md)

## Phase 3: Responsive Winery Details & Touch Target Standardization
- [ ] Task: Write unit tests for responsive winery modal state and touch target styling
    - [ ] Create tests for `useWineryModalState` tier adaptation and `map-controls.tsx` minimum 44px touch target sizing
- [ ] Task: Update `useWineryModalState` and winery modal components for 3-tier layout
    - [ ] Update `components/winery/use-winery-modal-state.ts` to support tier-aware presentation (`MobileWineryDrawer` on mobile, non-blocking floating sheet/drawer on tablet, `DesktopWineryModal` on desktop)
    - [ ] Update `components/winery-modal.tsx` to render the floating sheet variant on tablet viewports
- [ ] Task: Standardize touch targets in `components/map/map-controls.tsx`
    - [ ] Ensure filter chips, map style toggles, search inputs, and map action buttons enforce `min-h-[44px] min-w-[44px]` and `px-3 py-2` on mobile/tablet tiers
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Responsive Winery Details & Touch Target Standardization' (Protocol in workflow.md)

## Phase 4: App Shell Integration & E2E Verification
- [ ] Task: Update `components/app-shell.tsx` with 3-tier conditional rendering
    - [ ] Integrate `useLayoutTier` in `app-shell.tsx` to mount `InteractiveBottomSheet` (mobile), `TabletFloatingDrawer` (tablet), or `desktop-sidebar-container` (desktop) while maintaining DOM stability and `data-state` contracts
    - [ ] Ensure map canvas remains 100% full-screen in mobile and tablet tiers and flex-1 in desktop tier
- [ ] Task: Write comprehensive Playwright E2E suite in `e2e/responsive-layout.spec.ts`
    - [ ] Test mobile tier layout (< 768px): bottom navigation, bottom sheet drawer, and mobile winery drawer
    - [ ] Test tablet portrait tier (768px - 1024px e.g. iPad 810×1080): full-screen map, floating drawer expansion/minimization, floating winery details, and 44px touch targets
    - [ ] Test desktop tier (≥ 1024px): 400px split-pane sidebar and desktop modal dialog
    - [ ] Verify hydration stability and state preservation during viewport resizing
- [ ] Task: Conductor - User Manual Verification 'Phase 4: App Shell Integration & E2E Verification' (Protocol in workflow.md)
