---
title: Logic Branch Mapping
impact: HIGH
impactDescription: Ensures 100% Jest branch coverage in the next session
tags: jest, branch-analysis, logic, mapping
---

## Logic Branch Mapping

Before handing off, you must map every logical path in the affected code. This prevents the next agent from missing edge cases or complex conditions.

**Incorrect (Vague logic summary):**
> "I updated the `visitStore.ts` to handle photo uploads. Please test the upload logic."
> *Result: Next agent misses the 'offline queue' branch or the 'failed upload' retry logic.*

**Correct (Detailed branch mapping):**
> **Target: `lib/stores/visitStore.ts` -> `uploadPhoto()`**
> - **Branch 1:** `isOnline === true` -> Direct upload to Supabase.
> - **Branch 2:** `isOnline === false` -> Base64 encoding and IDB queueing.
> - **Branch 3:** `upload fails` -> Trigger `toast` and keep in queue.
> - **Branch 4:** `file > 5MB` -> Error handling and early return.

**Strategy:** Use `grep_search` to find all `if/else`, `switch`, and `ternaries` in the modified files to ensure nothing is missed.
