# Implementation Plan: Refactor WineryModal & WineryDetails Components

Decompose monolithic `winery-modal.tsx` and `WineryDetails.tsx` into modular sub-components and hooks in `components/winery/`, preserving 100% visual/behavioral parity and E2E test contracts.

## Phase 1: Shared Sub-Components Extraction [checkpoint: 1b9cb65]
Extract self-contained utility and status sub-components into `components/winery/`.

- [x] Task: Create `components/winery/winery-image.tsx` for lazy image rendering with photo caching. cf8cf99
- [x] Task: Create `components/winery/attribute-status.tsx` for check/cross/help status indicators. 1a46d65
- [x] Task: Conductor - User Manual Verification 'Phase 1: Shared Sub-Components Extraction' (Protocol in workflow.md) 1b9cb65

## Phase 2: WineryDetails Sub-View Decomposition [checkpoint: db56314]
Decompose `WineryDetails.tsx` into single-responsibility presentational components.

- [x] Task: Create `components/winery/winery-info-card.tsx` for hours, status, and contact action buttons. a394b19
- [x] Task: Create `components/winery/winery-amenities-list.tsx` for amenities checklist & logistics accordions. bae4fa3
- [x] Task: Create `components/winery/winery-ai-insights-card.tsx` for Gemini summary and neighborhood details. 314ccd3
- [x] Task: Refactor `WineryDetails.tsx` into a lightweight view-mode switcher (~60 lines). 140621d
- [x] Task: Conductor - User Manual Verification 'Phase 2: WineryDetails Sub-View Decomposition' (Protocol in workflow.md) db56314

## Phase 3: WineryModal State & Carousel Modularization [checkpoint: 22a25b9]
Extract photo carousel, lightbox portal, and custom modal state hook.

- [x] Task: Create `components/winery/hero-photo-carousel.tsx` for photo slider and touch handling. a3ac28d
- [x] Task: Create `components/winery/photo-lightbox-modal.tsx` for portal-rendered photo zoom modal. b609d61
- [x] Task: Create `components/winery/use-winery-modal-state.ts` custom hook for store selectors, visit merging/sorting, and tab state. 6456e02
- [x] Task: Conductor - User Manual Verification 'Phase 3: WineryModal State & Carousel Modularization' (Protocol in workflow.md) 22a25b9

## Phase 4: WineryModal Responsive Layout Split & Integration
Split desktop and mobile layout renderers and update main entry point.

- [x] Task: Create `components/winery/desktop-winery-modal.tsx` for desktop Dialog grid layout. 55c1ef1
- [x] Task: Create `components/winery/mobile-winery-drawer.tsx` for mobile Drawer & snap points. 468c9b9
- [x] Task: Refactor `components/winery-modal.tsx` into a lightweight container component (~100-150 lines). dcd05d3
- [~] Task: Run full Playwright container test verification suite.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: WineryModal Responsive Layout Split & Integration' (Protocol in workflow.md)
