---
title: Stable Playwright Navigation
impact: CRITICAL
impactDescription: Eliminates hydration flashes and WebKit/Safari flakiness
tags: playwright, navigation, hydration, webkit
---

## Stable Playwright Navigation

Standard `page.goto` is insufficient for Next.js applications during hydration. Use project-specific helpers to ensure app readiness and stable navigation.

**Incorrect (Raw navigation, no readiness check):**

```typescript
// Brittle: fails if page hydrates AFTER goto
await page.goto('/trips');
await page.click('[data-testid="add-trip"]'); // Element not yet reactive
```

**Correct (Project-standard helpers):**

```typescript
import { navigateToTab, waitForAppReady } from './helpers';

// Ensures hydration is complete and DOM is interactive
await page.goto('/trips');
await waitForAppReady(page);

// Handles mobile sheet expansion and WebKit settlement
await navigateToTab(page, 'trips');
await page.getByRole('button', { name: 'Add Trip' }).click();
```

**Impact Note:** WebKit (Safari) requires explicit settlement time for bottom bars and mobile sheets. `navigateToTab` handles this internally.

Reference: [Playwright Navigation](https://playwright.dev/docs/navigations)
