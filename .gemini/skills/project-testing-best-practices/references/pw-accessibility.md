---
title: Accessibility (A11y) Verification
impact: HIGH
impactDescription: Ensures WCAG compliance and prevents ARIA regressions
tags: accessibility, axe, testing, playwright
---

## Accessibility (A11y) Verification

Every major new view or modal MUST be scanned for accessibility violations using `@axe-core/playwright`.

**Incorrect (Visual-only verification):**
> `expect(modal).toBeVisible();` // Pass, but keyboard users are blocked.

**Correct (Axe integration):**
```typescript
import { injectAxe, checkA11y } from 'axe-playwright';

await injectAxe(page);
await checkA11y(page, '[data-testid="my-new-feature"]', {
  detailedReport: true,
  detailedReportOptions: { html: true }
});
```

Reference: [Playwright Accessibility](https://playwright.dev/docs/accessibility-testing)
