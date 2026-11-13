# GitHub Issue Prioritization & Execution Architecture

**Repository:** `jarredb9/finger-lakes-app-57`  
**Date:** November 9, 2026  
**Author:** Staff Software Engineer & Architect  
**Live Project Board:** [Winery Planner — Master Priority & Agent Execution Board (GitHub Projects #2)](https://github.com/users/jarredb9/projects/2)

---

## 1. Work Order Policy: Milestone-First with P0 Stop-the-Line

To eliminate ambiguity when pulling tasks or starting agent sessions, work order is governed by a **Milestone-Bounded, Severity-Sorted** rule:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      THE GOLD STANDARD PULL ORDER                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Current Active Milestone ONLY (v3.7.1)                              │
│    └── Work strictly in priority order: P0 -> P1 -> P2                 │
│    └── NEVER pull from v3.8.0 or v3.9.0 until v3.7.1 is tagged.        │
├────────────────────────────────────────────────────────────────────────┤
│ EXCEPTION: THE "STOP-THE-LINE" INTRUSION                               │
│ If a genuine P0 (live security breach, active data loss/corruption)    │
│ is discovered anywhere in the repository:                              │
│    └── Immediately pull it into the active milestone (or hotfix tag). │
│    └── Halt all forward feature work until the P0 is verified & closed.│
├────────────────────────────────────────────────────────────────────────┤
│ 2. When v3.7.1 is 100% closed & tagged:                                │
│    └── Advance active pointer to v3.8.0.                               │
│    └── Work strictly: P1 -> P2 -> P3 within v3.8.0.                    │
└────────────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **No Hypothetical P0s in Distant Milestones:**  
> A true P0 affects active production code today. If an issue is classified as P0, it belongs in the active milestone (`v3.7.1`). If an issue represents a critical prerequisite for a *future* milestone feature (e.g., PostGIS for navigation in `v3.9.0`), it is classified as **Tier 5 (Platform Strategic)**, not an emergency P0.

---

## 2. Priority & Resolution Framework

### 2.1 Priority Tiers

Issues are ranked by balancing user impact, data integrity risk, architectural dependencies, security perimeter defense, and milestone alignment:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Tier 1: Production Integrity, Secrets & Database/Edge Security (P0)    │
│ Edge Function caller auth and social webhook authorization (#134,      │
│ #150), private review isolation (#135), and client cache poisoning     │
│ (#73, #75).                                                            │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 2: Broken Core User Flows, Web & Client Perimeter Hardening (P1)  │
│ Dead-end 404s on winery share URLs (#41), open redirects & reset host  │
│ header poisoning (#95, #136), collaborator email PII leak (#139),      │
│ raw service-role winery upsert (#140), client render crash DoS &       │
│ offline DLQ plaintext (#96), leaked password checks (#88), Gemini      │
│ prompt injection defense (#151), offline SyncService retry/replay races│
│ (#123), silent Trip Collaborator drops & unwired Realtime sync (#119), │
│ state slice drift & mapStore fan-out (#137, #138), and Visit History   │
│ table pagination & editing (#128, #129).                               │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 3: Core UX Enablers & Milestone v3.8.0 Alignment                 │
│ Planning friction (#50), map layout overlays (#89, #92), multi-trip    │
│ modal badges (#109), batch signed photo URLs (#130), Amenity           │
│ decoupling (#74), viewport search & enrichment-aware discovery         │
│ filtering (#47, #122), static Q&A keyword dictionaries extraction      │
│ (#145).                                                                │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 4: Foundational Architecture, Scalability & Technical Debt        │
│ Places SDK deferral & boot auth waterfalls (#133), store resets &      │
│ workstation env isolation in tests (#141), window store/E2E gating     │
│ (#142), test fixtures & directory consolidation (#146, #171), placeId  │
│ sanitization (#152), coordinate standardizations (#61), Postgres RLS   │
│ InitPlan & hot-path indexing (#121), TypeScript (#52), Jest ESM        │
│ transpilation (#115), lib/supabase consolidation (#172), component     │
│ decomposition & domain grouping (#31, #173).                           │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 5: Strategic Platform Capabilities (Milestone v3.9.0)            │
│ App Router authenticated layout refactor (#143), viewport-bounded      │
│ get_map_markers query (ADR-0011, #132), dropping deprecated tables     │
│ & dead RPCs (#144), GoogleMapAdapter wiring or pruning (#147),         │
│ Day-Trip Companion lifecycle ('Plan -> Navigate -> Log', #118),        │
│ Google OAuth (#32), winery lifecycle (#34), PostGIS guides (#13).      │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 6: Long-term Social, Tasting & Discovery Backlog (Milestone v3.10)│
│ Per-wine Tasting records (#125), social visit tagging (#46),           │
│ taste profiles (#45), and global community activity feed (#48).        │
├────────────────────────────────────────────────────────────────────────┤
│ Tier 7: Autonomous Developer Tooling & Pipeline Infrastructure         │
│ agent-resolve engine, conductor-prompt package, token caps, & skills.  │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Context Hygiene, Session Budgets & Agent Topologies

To prevent context bloat (>120k tokens / >50 turns) that leads to degraded code quality, hallucinations, and shallow patches, work is classified into 4 explicit **Agent Execution Topologies**:

| Topology | Label & Profile | When to Use | Context Hygiene Protocol |
| :--- | :--- | :--- | :--- |
| **Topology A** | **Single Focused Agent**<br>`1 Session, <40 turns` | Surgical, low-exploration tasks (<3 files) with well-understood reproduction seams. | Research and implementation happen in one clean session. Avoid reading non-essential files. |
| **Topology B** | **Decoupled Plan -> Fresh Execution**<br>`2 Sessions / Agents` | Bounded tasks requiring substantial architecture or UX alignment (security, routing, slots). | **Session 1 (Architect/Planner):** Conducts interview or `/plan`, delegating broad research to background subagents (`invoke_subagent`) to keep context <30k tokens. Emits approved `implementation_plan.md`.<br>**Session 2 (Implementer):** Starts in a **fresh context window** seeded strictly with the approved plan artifact to execute Red/Green TDD. |
| **Topology C** | **Conductor Track**<br>`Multiple Agents / Phased Sessions` | Multi-domain, high-risk, or multi-PR epics spanning database DDL, state engines, and UI. | Managed in `conductor/tracks/` with 3–4 tasks per phase. Each phase runs in a fresh agent session (<60 turns) with phase verification checkpoints and git notes. |
| **Topology D** | **Autonomous Overnight**<br>`1 Headless Agent` | Narrow blast radius ($\le 2$ files), pure-logic, data migrations, or leaf-component styling with deterministic Jest assertions. | Headless AFK batch runner (`scripts/agent-resolve/agent-resolve.py`) with strict turn and token caps. Zero human interaction. |

```mermaid
flowchart TD
    Start["Issue Selected"] --> Q_Autonomous{"Narrow blast radius (≤2 files),<br>pure logic/reducer or leaf styling,<br>deterministic Jest test?"}
    Q_Autonomous -- Yes --> Top_D["Topology D: Autonomous Overnight<br>(agent:resolve)"]
    Q_Autonomous -- No --> Q_Scope{"Multi-phase epic, multi-PR,<br>or touches DB schema +<br>stores + UI across domains?"}
    Q_Scope -- Yes --> Top_C["Topology C: Conductor Track<br>(Multiple Agents / Phased Sessions)"]
    Q_Scope -- No --> Q_Ambiguous{"Ambiguous UX, contentious design,<br>or needs doc/ADR settlement?"}
    Q_Ambiguous -- Yes --> Top_B_Grill["Topology B: /grill-with-docs Session<br>(Agent 1: Grill/Plan -> Agent 2: Fresh Execute)"]
    Q_Ambiguous -- No --> Q_Complexity{"Multi-file security hardening,<br>new route, or container refactor?"}
    Q_Complexity -- Yes --> Top_B_Plan["Topology B: Standard /plan Session<br>(Agent 1: Plan -> Agent 2: Fresh Execute)"]
    Q_Complexity -- No --> Top_A["Topology A: Targeted TDD Fix<br>(1 Focused Agent, <40 turns)"]
```

---

### 2.3 Workflow Archetypes & Resolution Playbook

| Workflow Archetype | Primary Entry Command | Scope & Boundary | Artifacts & Output |
| :--- | :--- | :--- | :--- |
| **`Conductor Track`** | `/conductor-new-track` -> `conductor-implement` | Multi-phase initiatives; strict expand-and-contract; 3–4 tasks per phase. | `spec.md`, `plan.md`, git notes checkpoints, `tracks.md` registry. |
| **`Standard /plan Session`** | `/plan` -> interactive implementation | Bounded single PR; well-specified requirements; high architectural/security rigor. | `implementation_plan.md` artifact (user approved) -> TDD -> `walkthrough.md`. |
| **`/grill-with-docs Session`** | `/grill-with-docs` -> `/plan` | Underspecified requirements; UX trade-offs; domain language settlement. | Updates `CONTEXT.md` / ADRs -> implementation plan -> fresh execution. |
| **`Autonomous Overnight (agent:resolve)`** | `agent:resolve` label or `agent-resolve.py` | Headless overnight batch execution at 20:00 EST; pure data/logic or leaf styling. | Automated Red/Green TDD Draft PR with Architectural Scorecard. |
| **`Targeted TDD Fix Session`** | `/tdd` / standard interactive session | Surgical bug fixes (<3 files); clear root cause; deterministic reproduction seam. | Failing regression test -> minimal fix -> clean commit. |

---

## 3. Live Prioritization Matrix (GitHub Projects v2)

> [!TIP]
> **Single Source of Truth:**  
> Live issue rack-and-stack ordering, statuses, milestones, custom priority tiers, and agent topologies are tracked interactively on the GitHub Projects board to eliminate doc staleness and merge conflicts:
>
> 🚀 **[GitHub Project #2: Winery Planner — Master Priority & Agent Execution Board](https://github.com/users/jarredb9/projects/2)**

### Recommended Board Views in GitHub Projects

1. **Active Milestone View (Default):**
   * **Filter:** `no:milestone,milestone:"v3.7.1 - Security Hardening & Production Defense"`
   * **Group:** `Milestone`
   * **Sort:** `Priority Tier` ascending
   * *Purpose:* Enforces the Milestone-First rule. Focuses strictly on closing `v3.7.1` before looking ahead.
2. **Roadmap & Milestone Progression:**
   * **Group:** `Milestone`
   * **Sort:** `Priority Tier` ascending
   * *Purpose:* Displays the complete release sequence: `v3.7.1` $\rightarrow$ `v3.8.0` $\rightarrow$ `v3.9.0` $\rightarrow$ `v3.10.0` $\rightarrow$ `Tooling`.
3. **Agent Autonomous Queue (Topology D):**
   * **Filter:** `is:open Topology:"Topology D: Autonomous Overnight"`
   * *Purpose:* Direct input feed for overnight headless batch runners (`agent-resolve.py`).

### CLI Quick Access (`gh` CLI)

```bash
# List open items in the project board
gh project item-list 2 --owner jarredb9 --format json

# Add a newly discovered issue to the project board
gh project item-add 2 --owner jarredb9 --url "https://github.com/jarredb9/finger-lakes-app-57/issues/<id>"
```

---

## 4. Immediate Phasing & Execution Next Steps

```
Milestone v3.7.0 Release Gate
 └── Tag v3.7.0 & bump package.json version -> Closes Milestone v3.7.0 (0 open issues)
 │
Milestone v3.7.1 - Security Hardening & Production Defense (CURRENT ACTIVE FOCUS)
 ├── Step 1: Fix #134 (Require authentication on search-wineries and get-winery-details Edge Functions) [P0] -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 2: Fix #150 (Require caller authorization and stop friend-graph disclosure in send-social-notification) [P0] -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 3: Fix #135 (Prevent private visit note leakage to Gemini and public summary fallback) [P0] -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 4: Fix #151 (Defend against prompt injection and validate Gemini summary schema in enrichment pipeline) [P1] -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 5: Fix #73 (Amenities v3 Cache Migration) -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 6: Fix #75 (PWA Hours Bug) -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 7: Fix #136 (Harden web auth perimeter and remove mock password-reset backdoor) [P1] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 8: Fix #95 (Web Route Hardening: Open redirects & Host header poisoning) -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 9: Fix #96 (Client Stability & Storage Privacy) -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 10: Implement #88 (HaveIBeenPwned Leaked Password Check) -> Topology B [Standard /plan Session: 2 Agents]
 └── Step 11: Fix #152 (Sanitize and validate placeId parameter in get-winery-details) [P2] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 │
Milestone v3.8.0 - Component Decomposition, Performance & UI Modernization (LOCKED UNTIL v3.7.1 TAGGED)
 ├── Step 12: Fix #139 (Replace external gravatar/pravatar call in TripCardPresentational to stop PII leak) [P1] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 13: Fix #140 (Route app/api/wineries upsert through validated catalog RPCs) [P1] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 14: Fix #137 (Normalize useTripStore slices to eliminate state drift) [P1] -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 15: Fix #138 (Eliminate wineryStore 16x manual fan-out into mapStore) [P1] -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 16: Grill & Fix #123 (SyncService 5xx Timers & Cross-Tab Replay Lock) -> Topology B [/grill-with-docs -> Execute]
 ├── Step 17: Grill & Fix #119 (Collaborative Trip Realtime & RLS Alignment) -> Topology B [/grill-with-docs -> Execute]
 ├── Step 18: Fix #41 (Deep Linking 404) -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 19: Fix #128 (Use exact count in visitFetchHelpers to prevent false zero totalPages [ADR-0003]) [P1] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 20: Fix #129 (Route visit edit action to edit modal tab instead of detouring in GlobalVisitHistory) [P1] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 21: Fix #130 (Batch signed photo URL resolution to prevent N+1 queries in visit lists) [P2] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 22: Implement #50 (WineryModal Upcoming Trips Checklist) -> Topology A [Standard /plan Session: 1 Agent]
 ├── Step 23: Merge #89 (PR #99) / Execute #92 (MapOverlayLayout Slot Architecture) -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 24: Implement #109 (WineryModal Multi-Trip Badges) -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 25: Grill & Implement #74 (Visitor Amenities & Vibe Tags), #47 (Search This Area), & #122 (Enrichment-Aware Filters) -> Topology B [/grill-with-docs -> Execute]
 ├── Step 26: Fix #133 (Defer Google Places SDK loading and eliminate boot auth waterfalls in AuthProvider) [P2] -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 27: Fix #141 (Add useSyncStore to jest.setup.ts store resets and isolate workstation env) [P2] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 28: Fix #142 (Gate E2E and debug store attachments on window out of production builds) [P2] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 29: Refactor #145 (Extract static keyword dictionaries from WineryQnA.tsx into pure constants) [P3] -> Topology D [Autonomous Overnight: 1 Headless Agent]
 ├── Step 30: Refactor #146 (Migrate legacy dataFactory.ts importers to lib/test-utils/fixtures.ts) & #171 (Consolidate root __tests__ and lib/__tests__ stragglers into colocated test directories) [P3] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 31: Execute #61 (Coordinate standardizations: Topology D) & Grill #121 (RLS InitPlan 0003 & FK Indexes 0001: Topology B)
 ├── Step 32: Execute #52 (TypeScript Epic PRs 2–4) -> Topology C [Conductor Track: Multiple Phased Agents]
 ├── Step 33: Execute #115 (Jest ESM Transpilation & Major UI/Auth Dependency Migrations) -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 34: Refactor #172 (Fold top-level utils/supabase into lib/supabase and standardize lib module naming) [P3] -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 35: Execute #31 (Component Decomposition) -> Topology C [Conductor Track: Multiple Phased Agents]
 └── Step 36: Refactor #173 (Group remaining flat components by domain, colocate __tests__, and enforce kebab-case filenames [Blocked by #31]) [P3] -> Topology B [Standard /plan Session: 2 Agents]
 │
Milestone v3.9.0 - Platform Feature Expansions (FUTURE QUEUE)
 ├── Step 37: Refactor #143 (Introduce app/(authenticated)/layout.tsx to eliminate AppShell remounts) [P2] -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 38: Execute #132 (Implement viewport-bounded get_map_markers query [ADR-0011]) [P1] -> Topology C [Conductor Track]
 ├── Step 39: Refactor #144 (Drop 3 deprecated tables [follows, follow_requests, visit_participants] and 5 dead RPCs from public schema) [P2] -> Topology A [Targeted TDD Fix Session: 1 Agent]
 ├── Step 40: Fix #147 (Wire GoogleMapAdapter into MapProvider or remove dead adapter) [P2] -> Topology B [Standard /plan Session: 2 Agents]
 ├── Step 41: Grill & Implement #118 (Day-Trip Companion Lifecycle [ADR-0012]: Schedule Warnings, Road Trip Legs & Visit Completion) -> Topology C [Conductor Track]
 ├── Step 42: Implement #32 (Google OAuth & Account Linking) -> Topology C [Conductor Track: Multiple Phased Agents]
 ├── Step 43: Implement #34 (Winery Lifecycle / Rebranding) -> Topology C [Conductor Track: Multiple Phased Agents]
 └── Step 44: Implement #13 (Mapbox Markers & PostGIS Regions) -> Topology C [Conductor Track: Multiple Phased Agents]
 │
Milestone v3.10.0 - Social Discovery, Tasting & Recommendations (BACKLOG QUEUE)
 ├── Step 45: Grill & Implement #125 (Wine-Level Tasting Records Within a Visit) -> Topology C [Conductor Track]
 └── Step 46: Implement #46 (Social Tagging), #45 (Taste Profiles), & #48 (Community Feed) -> Topology C [Conductor Track: Multiple Phased Agents]
```
