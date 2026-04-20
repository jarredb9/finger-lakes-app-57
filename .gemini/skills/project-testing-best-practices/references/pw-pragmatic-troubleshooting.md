---
title: Pragmatic Troubleshooting & Back-off Logic
impact: HIGH
impactDescription: Prevents "Regression Loops" and "Whack-A-Mole" fixing of browser-specific quirks
tags: troubleshooting, webkit, flaky-tests, ai-logic
---

## Pragmatic Troubleshooting & Back-off Logic

To maintain a professional standard, we prioritize **Stability over Flattery**. A test suite that passes 100% of the time is the goal, but we achieve it by being aggressive about *what* we test in *which* environment.

### 1. The 2-Turn "Quirk" Rule
If an AI agent spends more than **2 conversational turns** attempting to fix a UI race condition that is specific to a single engine (usually WebKit/Safari) or environment (RHEL 8 Podman), it MUST evaluate the failure against this logic:

- **Is it a Logic Bug?** (e.g., "The visit was never saved to the DB"). **WORK HARDER.** You must fix the code or the synchronization.
- **Is it a Browser Quirk?** (e.g., "The WebKit Service Worker didn't intercept the second redirect"). **BACK OFF.** 

### 2. Back-off Strategy: The "Skip & Inject" Pivot
If you identify a Browser Quirk, do NOT implement a "Defensive Hack" (like `waitForTimeout`). Instead:
1.  **Verify Logic via Atomic Injection:** Check if there is an existing test (or create one) that uses `page.evaluate` to verify the underlying state change. If the logic passes in the Atomic test, the feature is safe.
2.  **Skip the Flaky Engine:** Use `test.skip(browserName === 'webkit', 'Skip flaky UI transition in WebKit; logic verified in atomic-spec')`.
3.  **Document the Manual Pass:** Explicitly state in the PR/Summary that the feature was manually verified in a real browser.

### 3. Architectural Signals vs. Defensive Hacks
- **NEVER** use `page.waitForTimeout(n)`.
- **NEVER** use `if (isWebKit) clickTwice()`.
- **ALWAYS** use **Architectural Signals**: If a test is flaky because a component isn't ready, add a `data-state="ready"` attribute to the component's code. This is a permanent quality improvement, not a hack.

### 4. The Three-Tier Confidence Model
When troubleshooting, the AI must know which tier it is operating in:

| Tier | Type | Pass Rate Goal | AI Intent |
| :--- | :--- | :--- | :--- |
| **Tier 1** | Unit / Pure Jest | 100% | **NO MERCY.** Fix every failure. |
| **Tier 2** | Atomic State E2E | 100% | **HIGH EFFORT.** These verify your logic. |
| **Tier 3** | Full UI Flows | ~95% (Multi-Engine) | **PRAGMATIC.** Skip engine quirks if Tier 2 passes. |

### 5. Summary for AI Agents: When to Back Off
> "If the store state is correct, but the WebKit DOM is stuttering, and I have already tried listening for a `data-state` signal, I should skip the UI assertion for WebKit and rely on the Store Assertion."
