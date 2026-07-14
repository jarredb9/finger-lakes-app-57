# Specification - Mobile Winery Modal & Search UX Fixes

## Overview
This specification details the fixes for two distinct mobile-only layout bugs related to `winery-modal.tsx` and virtual keyboard issues on mobile search in `PlaceAutocomplete.tsx` when tested on iOS devices.

## Functional Requirements
1. **Winery Modal Layout (Mobile)**
   - Anchor the details modal to `top-4` with `translate-y-0` on mobile/small viewports (preserving centered horizontal placement: `left-[50%] translate-x-[-50%]`).
   - On screens wider than mobile (`sm:`), restore centered vertical placement (`top-[50%] translate-y-[-50%]`).
   - Change mobile width constraint from `w-full` to `w-[95vw]` to keep horizontal gutters and prevent edge-touching.
   - Prevent horizontal panning/sliding by applying `overflow-x-hidden` to both `DialogContent` and the inner scrollable container `div`.
   
2. **Search Input & Virtual Keyboard (Mobile)**
   - Increase search input font size to `text-base` (16px) on mobile viewports to prevent iOS Safari auto-zooming on focus. Revert to `text-sm` (14px) on screens `sm` and above.
   - Dismiss the virtual keyboard immediately upon selecting a search suggestion by calling `.blur()` on `document.activeElement` if it's an HTMLElement.
   - Open details modal with a small delay (150ms) after selecting an autocomplete suggestion, allowing the virtual keyboard to collapse and the mobile visual viewport to stabilize.

## Non-Functional Requirements
- **Performance:** Modal rendering transition should remain smooth; layout adjustments should not introduce visual flicker.
- **Responsiveness:** Standard behavior on desktop viewports must be completely unaffected.

## Acceptance Criteria
1. Selecting a winery pin on the map opens the details modal properly centered on desktop and anchored at the top with a margin on mobile.
2. Searching for a winery from the autocomplete input opens the details modal correctly on mobile without rendering it oversized or shifted off-screen (the close button "X" is fully visible and clickable).
3. The autocomplete input does not trigger native auto-zoom when focused on iOS Safari.
4. Tapping a search suggestion collapses the virtual keyboard and centers the map smoothly before displaying the modal.
5. Moving a finger horizontally inside the modal does not reveal white space or slide the modal contents off-screen.

## Out of Scope
- Redesigning the modal as a bottom sheet drawer component.
- Modifying styles of other modals (e.g. login, trip edit).
