# Track Specification: Refactor WineryModal & WineryDetails Components

## Overview
Decompose the monolithic `winery-modal.tsx` (990 lines) and `WineryDetails.tsx` (743 lines) components into a clean, modular component architecture inside `components/winery/`. This refactor aims to improve maintainability, reduce re-renders, and adhere strictly to the Container/Presentational design pattern without introducing any visual, functional, or E2E testing regressions.

## Objectives
1. **Component Modularization**: Break down large, multi-purpose component files into single-responsibility presentational components and custom state hooks.
2. **Directory Organization**: Group all extracted winery modal sub-components inside a dedicated `components/winery/` directory.
3. **Parity Guarantee**: Maintain 100% visual, interactive, and behavioral parity with existing modal and details functionality across mobile (drawer with snap points) and desktop (dialog).

## Key Components & File Architecture
- `components/winery/winery-image.tsx`: Extracted lazy image component with caching hook integration.
- `components/winery/attribute-status.tsx`: Extracted check/cross/help status badge indicator components.
- `components/winery/hero-photo-carousel.tsx`: Embla carousel component for winery photos.
- `components/winery/photo-lightbox-modal.tsx`: Portal-rendered full-screen photo zoom viewer.
- `components/winery/use-winery-modal-state.ts`: Custom hook decoupling 6 Zustand stores, visit merging/sorting, and tab navigation state.
- `components/winery/winery-info-card.tsx`: Hours, contact buttons (phone/website/email), and directions action bar.
- `components/winery/winery-amenities-list.tsx`: 11-row logistics checklist & Radix accordion with Q&A sheet/drawer triggers.
- `components/winery/winery-ai-insights-card.tsx`: Gemini AI summary & neighborhood details block.
- `components/winery/desktop-winery-modal.tsx`: Presentational split grid layout for desktop `Dialog`.
- `components/winery/mobile-winery-drawer.tsx`: Presentational drawer layout for mobile `Drawer` with snap-point management (`300px`, `520px`, `1`).
- `components/winery-modal.tsx`: Lightweight container component (~100-150 lines) orchestrating desktop vs mobile layouts.
- `components/WineryDetails.tsx`: Lightweight view-mode switcher (~60 lines) delegating to presentational sub-components.

## Non-Functional & Verification Requirements
1. **Playwright Compatibility**: Preserve 100% of existing `data-testid` attributes (e.g. `winery-modal-drawer`, `winery-modal-dialog`, `hero-photo-container`, `photo-lightbox-modal`, `close-lightbox-button`, `peek-open-status-tag`, `drawer-title-card`, `log-visit-button`, `amenity-row-*`, etc.).
2. **DOM Stability**: Ensure critical modal and drawer containers remain mounted in the DOM with appropriate `data-state="loading|ready|error"` attributes.
3. **Atomic Verification**: Run Playwright test container suite after completing each phase to guarantee zero regressions.

## Out of Scope
- Adding new feature functionality or changing API integrations.
- Modifying database schemas, edge functions, or Zustand store structures.
