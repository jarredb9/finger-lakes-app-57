# Implementation Plan: Refactor WineryModal & WineryDetails Components

Decompose monolithic `winery-modal.tsx` and `WineryDetails.tsx` into modular sub-components and hooks in `components/winery/`, preserving 100% visual/behavioral parity and E2E test contracts.

## Phase 1: Shared Sub-Components Extraction
Extract self-contained utility and status sub-components into `components/winery/`.

- [x] Task: Create `components/winery/winery-image.tsx` for lazy image rendering with photo caching. cf8cf99
- [ ] Task: Create `components/winery/attribute-status.tsx` for check/cross/help status indicators.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Shared Sub-Components Extraction' (Protocol in workflow.md)

## Phase 2: WineryDetails Sub-View Decomposition
Decompose `WineryDetails.tsx` into single-responsibility presentational components.

- [ ] Task: Create `components/winery/winery-info-card.tsx` for hours, status, and contact action buttons.
- [ ] Task: Create `components/winery/winery-amenities-list.tsx` for amenities checklist & logistics accordions.
- [ ] Task: Create `components/winery/winery-ai-insights-card.tsx` for Gemini summary and neighborhood details.
- [ ] Task: Refactor `WineryDetails.tsx` into a lightweight view-mode switcher (~60 lines).
- [ ] Task: Conductor - User Manual Verification 'Phase 2: WineryDetails Sub-View Decomposition' (Protocol in workflow.md)

## Phase 3: WineryModal State & Carousel Modularization
Extract photo carousel, lightbox portal, and custom modal state hook.

- [ ] Task: Create `components/winery/hero-photo-carousel.tsx` for photo slider and touch handling.
- [ ] Task: Create `components/winery/photo-lightbox-modal.tsx` for portal-rendered photo zoom modal.
- [ ] Task: Create `lib/hooks/useWineryModalState.ts` custom hook for store selectors, visit merging/sorting, and tab state.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: WineryModal State & Carousel Modularization' (Protocol in workflow.md)

## Phase 4: WineryModal Responsive Layout Split & Integration
Split desktop and mobile layout renderers and update main entry point.

- [ ] Task: Create `components/winery/desktop-winery-modal.tsx` for desktop Dialog grid layout.
- [ ] Task: Create `components/winery/mobile-winery-drawer.tsx` for mobile Drawer & snap points.
- [ ] Task: Refactor `components/winery-modal.tsx` into a lightweight container component (~100-150 lines).
- [ ] Task: Run full Playwright container test verification suite.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: WineryModal Responsive Layout Split & Integration' (Protocol in workflow.md)
