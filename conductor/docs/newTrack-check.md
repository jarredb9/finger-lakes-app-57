# Conductor New Track Plan Review Checklist & Prompts

Use this guide and prompt during `/conductor:newTrack` when the planner presents the drafted `plan.md` and asks:
> **"Approve or Revise?"**

---

## 1. Quick Copy-Paste Plan Review Prompt

Paste this prompt into the chat when reviewing the proposed `plan.md`:

```text
Revise the plan to ensure optimal agent execution and prevent context blowup:

1. Contract Decoupling (Expand-and-Contract):
   - No single task may modify a shared store, type, or service contract AND update multiple callers in the same task.
   - If changing an existing contract, split into: (a) Add new pattern with backwards-compatible shim, (b) Migrate callers, (c) Deprecate shim.

2. Domain Separation:
   - Strictly separate backend/storage/state-engine tasks from UI component integration tasks into distinct tasks or phases.
   - Do not mix low-level logic (e.g., IndexedDB, sync algorithms) with UI presentation (e.g., maps, modals, cards) in the same phase.

3. Independent Verifiability:
   - Ensure every task can be committed independently with passing tests and zero TypeScript errors without relying on pending downstream tasks.

4. Bounded Phase Sizing:
   - Keep phases capped at 3–4 tasks maximum so each phase comfortably executes in a single clean agent session (<60 turns).
   - Ensure Task 1 (failing tests) explicitly covers every implementation task in that phase.

Delegate the review to multiple multiple concurrent specialized research, code review, or other specialty agents to ensure a proper review is completed without main session or sub-agent context bloat. 
```
**NOTE**: Concerd using /boost or /teamwork which auto delegates agents
---

## 2. Upfront Track Creation Prompt (Avoid Revisions)

To prime the planner to generate a clean plan from the very start, include these constraints when initiating the track:

```text
/conductor:newTrack

Track: <Brief description of your feature/refactor>

Planning Constraints:
- Max 3–4 tasks per phase.
- Separate data/engine/store infrastructure from UI component integration into different phases.
- For any shared contract changes, use the expand-and-contract pattern to isolate caller breakages.
```

---

## 3. Quick 30-Second Plan Review Checklist

Before clicking **Approve**, scan the proposed `plan.md` for these warning signs:

| Check | Red Flag | Action |
| :--- | :--- | :--- |
| **Domain Mixing** | A phase contains both `lib/stores` or `lib/services` logic AND `components/` UI work. | Ask to split into two separate phases (e.g., Phase 3 Engine, Phase 4 UI). |
| **Compound Tasks** | A task says *"Update `XYZStore` and refactor all consumer components."* | Ask to split into an adapter task and caller migration tasks. |
| **Missing Test Symmetry** | Task 1 writes tests for features A and B, but Task 3 implements feature C with no tests. | Ask to add tests for C in Task 1 or move C to its own phase. |
| **Phase Bloat** | A phase has $\ge 5$ tasks or looks like it will take $>80$ turns. | Ask to break the phase into two milestone phases. |
