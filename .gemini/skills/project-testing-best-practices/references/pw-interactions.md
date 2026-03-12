---
title: Robust Playwright Interactions
impact: HIGH
impactDescription: 10x more reliable mobile clicks and form inputs
tags: playwright, interactions, robust-click, mobile
---

## Robust Playwright Interactions

Mobile sheets and WebKit often fail simple `click()` events. Use `robustClick()` to ensure full event dispatch and state stability.

**Incorrect (Standard click on mobile/sheets):**

```typescript
// Fails if sheet is still animating
await page.click('button.submit'); 
```

**Correct (Robust interactions):**

```typescript
import { robustClick } from './helpers';

// Waits for data-state="stable" before dispatching full event sequence
const submitButton = page.getByRole('button', { name: 'Submit' });
await robustClick(submitButton);

// For text inputs on mobile, use slowly: true
await page.getByLabel('Note').type('Great wine!', { slowly: true });
```

Reference: [Playwright Clicks](https://playwright.dev/docs/input)
