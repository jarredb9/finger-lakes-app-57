---
title: Visual Stability & Ghost Tiles
impact: MEDIUM
impactDescription: Prevents visual regression flakiness from dynamic map imagery
tags: playwright, visual-regression, screenshots, maps
---

## Visual Stability & Ghost Tiles

Visual regression tests are restricted to **Chromium**. You MUST use "Ghost Tiles" to ensure stable snapshots when Google Maps is involved.

**Incorrect (Using real map imagery in snapshots):**
> *Result: Test fails tomorrow because Google updated a satellite image or label.*

**Correct (Ghost Tiles Mocking):**
In `e2e/utils.ts`, ensure map tile requests are fulfilled with static PNGs.
- **Rule:** Baseline snapshots MUST be generated inside the official Playwright Docker container using `./scripts/run-e2e-container.sh ... --update-snapshots`.
- **Constraint:** NEVER update snapshots for intentional UI changes without verifying they pass in the container first.

Reference: [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)
