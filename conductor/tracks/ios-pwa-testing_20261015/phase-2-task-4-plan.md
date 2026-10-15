# Implementation Plan: Phase 2 Task 4 - Implement `onNavigateTrip` in TripCard Containers and Presentational Components (TDD Green Phase)

**Track:** `ios-pwa-testing_20261015` (Issue [#71](https://github.com/jarredb9/finger-lakes-app-57/issues/71))  
**Phase:** 2 (Domain Refactoring & Compatibility Seam)  
**Task:** 4 (Implement `onNavigateTrip` in TripCard containers and presentational components (TDD Green phase))  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  
**Workflow Reference:** [conductor/workflow.md](../../workflow.md)  
**Preceding Checkpoint Reference:** [Phase 2 Task 3 Commit: 5b6094ff]  

---

## 1. Executive Summary & Seam Architecture

### 1.1 Objective
Transition the TripCard component hierarchy from Red to Green phase by implementing canonical `onNavigateTrip` prop support across containers (`trip-card.tsx`, `trip-card-simple.tsx`) and presentational components (`TripCardPresentational.tsx`, `TripCardSimplePresentational.tsx`). The implementation wires canonical `handleTripNavigation` from `useTripActions` alongside backwards-compatible fallback to `@deprecated` `handleExportToMaps` / `onExportToMaps`, resolving all failing tests in `components/__tests__/trip-card-simple.test.tsx` while guaranteeing zero regressions across existing presentational and selector hygiene test suites.

### 1.2 Target Seam & Seam Boundary Analysis
1. **Container Components:**
   - [components/trip-card-simple.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-card-simple.tsx): Extract `handleTripNavigation` from `useTripActions(trip)` and bind both `onNavigateTrip={handleTripNavigation || handleExportToMaps}` and `onExportToMaps={handleExportToMaps || handleTripNavigation}` to `TripCardSimplePresentational`.
   - [components/trip-card.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-card.tsx): Extract `handleTripNavigation` from `useTripActions(trip)` and bind both `onNavigateTrip={handleTripNavigation || handleExportToMaps}` and `onExportToMaps={handleExportToMaps || handleTripNavigation}` to `TripCardPresentational`.
2. **Presentational Components:**
   - [components/TripCardSimplePresentational.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/TripCardSimplePresentational.tsx): Extend `TripCardSimpleProps` to accept `onNavigateTrip?: (provider?: NavigationProvider) => void` and mark `onExportToMaps` as `@deprecated`. Evaluate `const onNavigate = onNavigateTrip || onExportToMaps;` and invoke `onNavigate?.(provider)` in menu items.
   - [components/TripCardPresentational.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/TripCardPresentational.tsx): Extend `TripCardProps` to accept `onNavigateTrip?: (provider?: NavigationProvider) => void` and mark `onExportToMaps` as `@deprecated`. Evaluate `const onNavigate = onNavigateTrip || onExportToMaps;` and invoke `onNavigate?.(provider)` in menu items.
3. **Presentational Unit Test Enhancements:**
   - [components/__tests__/TripCardSimplePresentational.test.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/TripCardSimplePresentational.test.tsx): Add explicit test coverage verifying `onNavigateTrip` delegation and precedence over `onExportToMaps`.
   - [components/__tests__/TripCardPresentational.test.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/__tests__/TripCardPresentational.test.tsx): Add explicit test coverage verifying `onNavigateTrip` delegation and precedence over `onExportToMaps`.
4. **Resolution Mechanics (TDD Green Phase):**
   - In `components/__tests__/trip-card-simple.test.tsx`, tests asserted that clicking Google Maps, Apple Maps, or Waze invokes `mockHandleTripNavigation` and leaves `mockHandleExportToMaps` uncalled.
   - Binding `handleTripNavigation` ensures `onNavigate` resolves to `mockHandleTripNavigation`.
   - When `handleTripNavigation` is `undefined` in legacy test mocks (such as `selectorHygiene.test.tsx`), `handleTripNavigation || handleExportToMaps` falls back cleanly to `mockHandleExportToMaps`.

---

## 2. Invariants & Critical Guardrails

1. **TDD Task Granularity Invariant (`AGENTS.md` Section 5):**
   - This task is strictly the **Green Phase**. It satisfies the failing tests committed in Phase 2 Task 3 (`5b6094ff`) and commits with the prefix `feat(...)`.
2. **Domain Vocabulary Invariant (`CONTEXT.md` & ADR 0006):**
   - Canonical trip navigation uses `handleTripNavigation` (hook) and `onNavigateTrip` (component props).
   - `handleExportToMaps` and `onExportToMaps` are preserved strictly as `@deprecated` backwards-compatible aliases.
3. **Container-Presentational Purity:**
   - Presentational components (`TripCardPresentational`, `TripCardSimplePresentational`) must remain pure presentational views with zero direct store dependencies.
   - Fallback logic `const onNavigate = onNavigateTrip || onExportToMaps;` resides in the presentational component to tolerate containers passing either prop.
4. **Selector Hygiene & Performance Invariant:**
   - Container modifications must not alter or introduce direct Zustand subscriptions without selectors. Existing `useTripActions` usage remains unchanged in identity.
5. **Containerized Execution Mandate (`AGENTS.md` Section 3):**
   - All Jest test verification must run inside the container runner: `./scripts/containers/run-jest-container.sh` with `BypassSandbox: true` due to host RHEL 8 glibc 2.28 SWC incompatibility.
6. **Modal & Plan Approval Invariant (`AGENTS.md` Section 2 & Conductor Rule):**
   - No source or test files may be edited until explicit user approval is received via interactive modal (`ask_question`).

---

## 3. Blueprint Specifications

### 3.1 Target File: `components/trip-card-simple.tsx`
- **Path:** `components/trip-card-simple.tsx`
- **Semantic Insertion Anchors:**
  1. *Hook Destructuring (Anchor: Lines 18-21):*
     - Destructure `handleTripNavigation` from `useTripActions(trip)` in addition to `handleExportToMaps` and `currentMembers`.
  2. *Presentational Invocation (Anchor: Lines 26-34):*
     - Pass both `onNavigateTrip={handleTripNavigation || handleExportToMaps}` and `onExportToMaps={handleExportToMaps || handleTripNavigation}` to `TripCardSimplePresentational`.

### 3.2 Target File: `components/trip-card.tsx`
- **Path:** `components/trip-card.tsx`
- **Semantic Insertion Anchors:**
  1. *Hook Destructuring (Anchor: Lines 55-58):*
     - Destructure `handleTripNavigation` from `useTripActions(trip)` in addition to `handleExportToMaps` and `currentMembers`.
  2. *Presentational Invocation (Anchor: Lines 153-174):*
     - Pass both `onNavigateTrip={handleTripNavigation || handleExportToMaps}` and `onExportToMaps={handleExportToMaps || handleTripNavigation}` to `TripCardPresentational`.

### 3.3 Target File: `components/TripCardSimplePresentational.tsx`
- **Path:** `components/TripCardSimplePresentational.tsx`
- **Semantic Insertion Anchors:**
  1. *Props Interface (Anchor: Lines 20-27):*
     - Add `onNavigateTrip?: (provider?: NavigationProvider) => void;`.
     - Annotate `onExportToMaps?: (provider?: NavigationProvider) => void;` with JSDoc `@deprecated`.
  2. *Component Function Arguments (Anchor: Lines 29-36):*
     - Destructure `onNavigateTrip` and `onExportToMaps` from `TripCardSimpleProps`.
  3. *Local Fallback Resolver (Anchor: Line 37, right before `useRouter`):*
     - Define `const onNavigate = onNavigateTrip || onExportToMaps;`.
  4. *Dropdown Menu Item Handlers (Anchor: Lines 87-95):*
     - Update click handlers from `onExportToMaps('provider')` to `onNavigate?.('apple')`, `onNavigate?.('google')`, and `onNavigate?.('waze')`.

### 3.4 Target File: `components/TripCardPresentational.tsx`
- **Path:** `components/TripCardPresentational.tsx`
- **Semantic Insertion Anchors:**
  1. *Props Interface (Anchor: Lines 30-51):*
     - Add `onNavigateTrip?: (provider?: NavigationProvider) => void;`.
     - Annotate `onExportToMaps?: (provider?: NavigationProvider) => void;` with JSDoc `@deprecated`.
  2. *Component Function Arguments (Anchor: Lines 94-114):*
     - Destructure `onNavigateTrip` and `onExportToMaps` from `TripCardProps`.
  3. *Local Fallback Resolver (Anchor: Line 115, right after component head):*
     - Define `const onNavigate = onNavigateTrip || onExportToMaps;`.
  4. *Dropdown Menu Item Handlers (Anchor: Lines 487-496):*
     - Update click handlers from `onExportToMaps('provider')` to `onNavigate?.('apple')`, `onNavigate?.('google')`, and `onNavigate?.('waze')`.

### 3.5 Target File: `components/__tests__/TripCardSimplePresentational.test.tsx`
- **Path:** `components/__tests__/TripCardSimplePresentational.test.tsx`
- **Semantic Insertion Anchors:**
  1. *Test Suite Enhancements (Anchor: Lines 202-263 under `describe('Trip Navigation Provider Menu', ...)`):*
     - Add test asserting `onNavigateTrip` is invoked with `'apple'`, `'google'`, and `'waze'` when provided.
     - Add test asserting `onNavigateTrip` takes precedence over `onExportToMaps` when both props are passed.

### 3.6 Target File: `components/__tests__/TripCardPresentational.test.tsx`
- **Path:** `components/__tests__/TripCardPresentational.test.tsx`
- **Semantic Insertion Anchors:**
  1. *Test Suite Enhancements (Anchor: Lines 303-330 under `describe('Trip Navigation dropdown', ...)`):*
     - Add test asserting `onNavigateTrip` is invoked with `'apple'`, `'google'`, and `'waze'` when provided.
     - Add test asserting `onNavigateTrip` takes precedence over `onExportToMaps` when both props are passed.

---

## 4. Full TypeScript Interfaces & Signatures

```typescript
import { NavigationProvider } from '@/lib/utils/trip-navigation';
import { Trip, TripMember, Winery } from '@/lib/types';

// Target Presentational Props: components/TripCardSimplePresentational.tsx
export interface TripCardSimpleProps {
    trip: Trip;
    isOwner: boolean;
    currentMembers: TripMember[];
    onDelete: (tripId: number) => void;
    onShare: (id: string, name: string) => void;
    onNavigateTrip?: (provider?: NavigationProvider) => void;
    /** @deprecated Use onNavigateTrip instead. Retained for backwards compatibility. */
    onExportToMaps?: (provider?: NavigationProvider) => void;
}

export default function TripCardSimple(props: TripCardSimpleProps): React.JSX.Element;

// Target Presentational Props: components/TripCardPresentational.tsx
export interface TripCardProps {
  trip: Trip;
  isOwner: boolean;
  canEdit: boolean;
  isUpdating?: boolean;
  isUserLoading?: boolean;
  currentMembers: TripMember[];
  onUpdateTrip: (id: string, updates: { name?: string; trip_date?: string }) => Promise<void>;
  onDeleteTrip: (id: string) => void;
  onUpdateWineryOrder: (tripId: string, wineryIds: number[]) => Promise<void>;
  onToggleWineryOnTrip: (winery: Winery, trip: Trip) => void;
  onRemoveWineryFromTrip: (tripId: string, wineryDbId: number) => Promise<void>;
  onSaveWineryNote: (wineryId: number, newNotes: string) => Promise<void>;
  onOpenShareDialog: (id: string, name: string) => void;
  onOpenWineryNoteEditor: (wineryDbId: number, notes: string, onSave: (id: number, notes: string) => Promise<void>) => void;
  onNavigateTrip?: (provider?: NavigationProvider) => void;
  /** @deprecated Use onNavigateTrip instead. Retained for backwards compatibility. */
  onExportToMaps?: (provider?: NavigationProvider) => void;
  // Search props
  searchResults: Winery[];
  isSearching: boolean;
  winerySearch: string;
  onSearchChange: (query: string) => void;
}

export default function TripCard(props: TripCardProps): React.JSX.Element;
```

---

## 5. Precise Behavioral Logic & State Transitions

1. **Container Prop Binding Logic (`TripCardSimple` & `TripCard`):**
   - Call `useTripActions(trip)` returning `{ currentMembers, handleTripNavigation, handleExportToMaps }`.
   - Bind `onNavigateTrip={handleTripNavigation || handleExportToMaps}`:
     - If `handleTripNavigation` is provided (canonical mode), `onNavigateTrip` receives `handleTripNavigation`.
     - If `handleTripNavigation` is undefined (legacy mock environment), `onNavigateTrip` receives `handleExportToMaps`.
   - Bind `onExportToMaps={handleExportToMaps || handleTripNavigation}`:
     - Guarantees backward compatibility for downstream presentational tests or wrappers expecting `onExportToMaps`.
2. **Presentational Prop Resolution Logic (`TripCardSimplePresentational` & `TripCardPresentational`):**
   - Resolve `const onNavigate = onNavigateTrip || onExportToMaps;`.
   - When a navigation provider is chosen from the dropdown:
     - Option 'apple': Call `onNavigate?.('apple')`.
     - Option 'google': Call `onNavigate?.('google')`.
     - Option 'waze': Call `onNavigate?.('waze')`.
   - If neither prop is passed, the optional call `onNavigate?.(...)` safely evaluates without throwing.
3. **State Transition & Regression Protection:**
   - No component state (`isEditing`, `isOpen`, `isDeleting`) is altered.
   - Disabled states on navigation trigger (`isPending || count === 0 || !trip.wineries || trip.wineries.length === 0`) remain intact.
   - Existing tests passing only `onExportToMaps` continue to dispatch correctly via fallback resolution.

---

## 6. Execution Verification Protocol

### Exact Test Runner Commands
Per repository standards, execute Jest tests in the container runner with `BypassSandbox: true`:

```bash
# 1. Primary Green Phase Verification: TripCardSimple container test suite
./scripts/containers/run-jest-container.sh components/__tests__/trip-card-simple.test.tsx

# 2. Presentational & Regression Verification Suites
./scripts/containers/run-jest-container.sh components/__tests__/TripCardSimplePresentational.test.tsx components/__tests__/TripCardPresentational.test.tsx components/__tests__/selectorHygiene.test.tsx components/__tests__/SyncIndicators.test.tsx

# 3. Static Type Checking
npm run type-check
```

### Expected Green Phase Execution Result
1. All 5 tests in `components/__tests__/trip-card-simple.test.tsx` pass cleanly (100% pass rate).
2. All tests in `TripCardSimplePresentational.test.tsx`, `TripCardPresentational.test.tsx`, `selectorHygiene.test.tsx`, and `SyncIndicators.test.tsx` pass with zero regressions.
3. TypeScript compiler passes with 0 type errors.

---

## 7. Post-Execution Hygiene & Conductor Commit Protocol

Upon verifying all test suites and type checks pass:

1. **Commit Code:**
   - Stage modified files:
     ```bash
     git add components/trip-card.tsx components/trip-card-simple.tsx components/TripCardPresentational.tsx components/TripCardSimplePresentational.tsx components/__tests__/TripCardSimplePresentational.test.tsx components/__tests__/TripCardPresentational.test.tsx
     ```
   - Commit message (TDD Green phase `feat`):
     ```bash
     git commit -m "feat(trip): implement onNavigateTrip delegation in TripCard containers and presentational components"
     ```

2. **Attach Git Note:**
   - Retrieve commit hash: `TASK_COMMIT_SHA=$(git log -1 --format="%H")`.
   - Attach note with standard fields:
     ```bash
     git notes add -m "Task: Implement \`onNavigateTrip\` in TripCard containers and presentational components (TDD Green phase)
Summary: Bound canonical handleTripNavigation and backwards-compatible handleExportToMaps in TripCard and TripCardSimple containers, updated TripCardPresentational and TripCardSimplePresentational props to accept onNavigateTrip with graceful fallback to onExportToMaps, and added provider delegation assertions.
Files:
- components/trip-card.tsx
- components/trip-card-simple.tsx
- components/TripCardPresentational.tsx
- components/TripCardSimplePresentational.tsx
- components/__tests__/TripCardSimplePresentational.test.tsx
- components/__tests__/TripCardPresentational.test.tsx
Rationale: Fulfills Phase 2 Task 4 of track ios-pwa-testing_20261015 (Issue #71) under the TDD Task Granularity Invariant." $TASK_COMMIT_SHA
     ```

3. **Update & Commit Track Plan:**
   - In [conductor/tracks/ios-pwa-testing_20261015/plan.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/ios-pwa-testing_20261015/plan.md), update Task 4 under Phase 2 to `[x]` with commit short hash:
     ```markdown
     - [x] Task: Implement `onNavigateTrip` in TripCard containers and presentational components (TDD Green phase) [commit: <short_sha>]
         - [x] Update `components/trip-card.tsx` and `components/trip-card-simple.tsx` to bind `onNavigateTrip` and `onExportToMaps`
         - [x] Update `components/TripCardPresentational.tsx` and `components/TripCardSimplePresentational.tsx` to accept `onNavigateTrip` with fallback to `onExportToMaps`
         - [x] Verify container and presentational suites pass via `./scripts/containers/run-jest-container.sh components/__tests__/trip-card-simple.test.tsx`
     ```
   - Commit plan update:
     ```bash
     git add conductor/tracks/ios-pwa-testing_20261015/plan.md
     git commit -m "conductor(plan): Mark task 'Implement onNavigateTrip in TripCard containers and presentational components' as complete"
     ```

---

## 8. Gating & Approval Invariant

- Static code inspection is complete.
- Implementation plan has been written to `conductor/tracks/ios-pwa-testing_20261015/phase-2-task-4-plan.md`.
- **Zero project source code or test files have been modified yet.**
- Execution requires explicit affirmative user approval via modal dialog (`ask_question`).
