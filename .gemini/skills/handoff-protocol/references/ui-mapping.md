---
title: UI Flow and Selector Verification
impact: CRITICAL
impactDescription: Prevents "Hallucinated Selectors" and WebKit stability issues
tags: playwright, ui-mapping, selectors, webkit, singletons
---

## UI Flow and Selector Verification

The next agent may not have the dev server running. You must verify and document all selectors using the `Chrome Dev-Tools MCP` before concluding.

### 1. The Singleton Rule
All major feature dialogs are global singletons in `layout.tsx`. 
- **Mapping Requirement:** Identify that the dialog is triggered via `useUIStore` and NOT rendered locally.
- **Selector Verification:** Ensure the `data-testid` is unique to the global renderer.

### 2. The WebKit/PWA Rule
For features involving photo uploads or offline state, document the binary data requirements.
- **Mapping Requirement:** Document that the "Reconstitution Rule" (Base64 -> File) is enforced for Safari/WebKit compatibility.
- **Mock Requirement:** Every `context.route()` fulfillment MUST include `Access-Control-Allow-Origin: '*'` and `Cache-Control: no-store`.

**Example Mapping:**
> **Flow: `Trip Management -> Add Visit`**
> 1. **Action:** Click `getByRole('button', { name: 'Add Visit' })`.
> 2. **Singleton:** Modal `[data-testid="visit-form"]` appears via global renderer.
> 3. **Binary:** Form uses Base64 serialization for WebKit stability (must reconstitute during sync test).
> 4. **Success:** Form closes; Success Toast `[data-testid="success-toast"]` displays.

**Mandatory:** Start the dev server and use `Chrome Dev-Tools MCP` to confirm `data-testid` and accessibility roles.
