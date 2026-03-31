---
title: The 'Fresh Start Prompt' Template
impact: CRITICAL
impactDescription: Eliminates context drift and reduces exploration turns
tags: handoff, brief, template, prompt-engineering
---

## The 'Fresh Start Prompt' Template

You MUST present your handoff in this structured format to the user. This is the single source of truth for the next agent.

### 1. The Template Structure
> ### 🚨 FRESH START PROMPT (MANDATORY)
> 
> **Role:** Senior SDET
> **Goal:** 100% Test Coverage for [Feature Name]
> 
> **1. Target Logic (Jest):**
> - `lib/stores/featureStore.ts`: Test `actionA()`, `actionB()`.
> - **Branches:** [List mapped branches from logic-mapping.md].
> 
> **2. Target UI (Playwright):**
> - **Flow:** [Step-by-step navigation from ui-mapping.md].
> - **Verified Selectors:** [Roles and IDs confirmed via MCP].
> 
**3. Backend/Supabase Context:**
- **RPCs/Security:** [List RPCs, search paths, and security context from backend-context.md].
- **Data/IDs:** [List ID types and constraints from id-mapping.md].

**4. Isolation Mode:**
- **Store Bypass:** [List stores using Nuclear Store Bypass (e.g. wineryDataStore)].
- **SW E2E Mode:** [Confirm if ?pwa=true is required for this feature].

**5. Reproduction & Environment:**
- **Log in as:** `test@example.com`, navigate to `Settings -> Features`.
- **Container Command:** `./scripts/run-e2e-container.sh chromium e2e/[test_file].spec.ts`.
- **Diagnostic Rule:** Prefix all debug logs with `[DIAGNOSTIC]`.

**Success Rule:** The brief is successful if a fresh agent can write tests without ever having to `read_file` the original implementation logic.
