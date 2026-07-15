# Specification: Mobile Bottom Drawer and Navigation Enhancement

## Overview
This specification details the transition of the mobile navigation interface in the Winery Visit Planner and Tracker from a full-width rectangle bar to a modern, floating navigation pill (detached floating pill style) with enhanced visual fidelity, glassmorphism, and active tab micro-interactions. It also maintains docking compatibility with the existing interactive bottom sheet (`InteractiveBottomSheet`).

## User Stories
- **As a mobile user**, I want a sleek, modern navigation interface that does not block the corners of the map behind it, so that I maintain visual context of the region.
- **As a mobile user**, I want clear visual feedback (active highlight pill and subtle scaling) when I select a navigation tab.
- **As a mobile user**, I want to be able to seamlessly switch between tabs even when the bottom sheet is open.

## Functional Requirements
1. **Floating Navigation Pill:**
   - Transition the full-width mobile navigation bar in [app-shell.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/app-shell.tsx) to a floating "island" or "pill" container.
   - The container must be centered horizontally, with a fixed width/margins from the left and right edges (e.g., `left-4 right-4` or max-width with auto margins).
   - The container must be positioned above the bottom edge with a margin, respecting the safe areas (`pb-safe`).
   - The corners must be highly rounded (e.g., `rounded-full` or `rounded-2xl`).

2. **Visual Fidelity & Glassmorphism:**
   - Implement standard glassmorphism using Tailwind/CSS backdrop-blur (`bg-background/80 backdrop-blur-md` or custom blur rules).
   - Add a subtle border (`border border-border/50`) to ensure crisp edge separation and contrast compliance.
   - Maintain full WCAG 2.1 contrast compliance for active and inactive icon/text states.

3. **Active Tab Micro-interactions:**
   - When a tab is active, the tab button must show a colored background pill (e.g., primary tint with lower opacity/solid color) and the icon should scale slightly (e.g., `scale-105` or `scale-110`).
   - Use smooth CSS transitions (`transition-all duration-300`) for the scaling and background color changes.

4. **Bottom Sheet (Drawer) Docking Integration:**
   - Modify the docking calculation of [InteractiveBottomSheet](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/ui/interactive-bottom-sheet.tsx) so that it pins immediately above the new floating pill position (e.g., adjusting `bottom-16` or adding extra offset to clear the floating container height + bottom margin).
   - This ensures the floating navigation pill remains fully visible and functional while the bottom sheet is open, preventing navigation lockout.

## Non-Functional Requirements
- **Responsive Layout:** Must look clean and balanced on various mobile devices (iPhone 15 Pro, Pixel 8, smaller screens).
- **Performance:** Keep animation logic lightweight using standard Tailwind transitions to prevent rendering lag on mobile.

## Acceptance Criteria
- [ ] Mobile navigation bar in `components/app-shell.tsx` is styled as a centered floating pill with rounded corners, backdrop blur, and a thin border.
- [ ] Tapping active/inactive tabs displays a subtle scale-up animation and an active background highlight pill.
- [ ] The `InteractiveBottomSheet` (when open in mini or full mode) is positioned above the floating bar, and the floating bar remains interactive.
- [ ] Verify there is no layout shifting, jumping, or overlapping shadows.
- [ ] Safe areas are fully respected on iOS/Android (no overlap with the home indicator).

## Out of Scope
- Desktop navigation sidebar changes.
- Refactoring the entire routing logic or introducing new pages/tabs.

## Research & Implementation Guidance (From Phase 1 Discovery)

### 1. Navigation Container (`components/app-shell.tsx`)
- **Current Layout Location:** Around lines 218–271.
- **Current Classes:** `md:hidden fixed bottom-0 left-0 right-0 h-auto min-h-16 bg-background border-t flex items-center justify-around z-50 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.12)]`
- **Target Changes:**
  - Add `data-testid="mobile-nav-bar"` to the container.
  - Floating replacement classes: `md:hidden fixed bottom-4 left-4 right-4 max-w-lg mx-auto rounded-2xl border backdrop-blur-md shadow-lg bg-background/80 flex items-center justify-around z-50 pb-safe` (or similar layout).
  - Micro-interactions: Active buttons should get a background highlight pill (e.g. overlay `bg-primary/10 rounded-xl px-3 py-1`) and active icon `svg` elements should apply `scale-105` or `scale-110` with a smooth transition (`transition-transform duration-300`).

### 2. Bottom Sheet Drawer (`components/ui/interactive-bottom-sheet.tsx` or container in `components/app-shell.tsx`)
- **Current Docking:** Currently sitting at `bottom-16` with height `h-[calc(100vh-5rem)]` (which is `100vh - 80px`). Mini mode uses `translateY(calc(100vh - 5rem - 45vh))`.
- **Target Changes:**
  - Increase bottom docking to `bottom-24` (96px) to sit cleanly above the floating bar.
  - Adjust height to `h-[calc(100vh-7rem)]` (96px + 16px safety = 112px = 7rem).
  - Adjust transform in mini mode to `translateY(calc(100vh - 7rem - 45vh))`.

### 3. Test Selectors Warnings
- **`e2e/smoke.spec.ts`**: Contains a hardcoded selector:
  ```ts
  await expect(page.locator('div.fixed.bottom-0')).toBeVisible();
  ```
  This will break once the navigation bar floats. Replace it with:
  ```ts
  await expect(page.getByTestId('mobile-nav-bar')).toBeVisible();
  ```
