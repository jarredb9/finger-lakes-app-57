# Implementation Plan: Phase 2 Task 3 - Refactor & Scaffolding Cleanup

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 2 (Test Suite Restructuring & Controlled Binding (`TripForm`))  
**Task:** 3 (Refactor & Scaffolding Cleanup)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Execute the Refactor and Scaffolding Cleanup task for Phase 2:
1. **Refactor `components/trip-form.tsx` for Readability & Container/Presentational Architecture:**
   - Extract the selected winery badge list into a dedicated, pure presentational component (`SelectedWineriesList`) with strict props and zero side effects.
   - Replace loose schema typing (`wineries: z.array(z.any())`) with strict TypeScript-safe Zod custom typing (`wineries: z.array(z.custom<Winery>())`), resolving the technical debt identified in `conductor/proposals/Typescript-Code-Health-ANY.md`.
   - Modernize Zustand store access from whole-store destructuring (`const { createTrip } = useTripStore()`) to atomic selector access (`const createTrip = useTripStore((s) => s.createTrip)`), conforming to Zustand 5 selector hygiene standards.
2. **Audit & Clean Up Test Scaffolding Artifacts:**
   - Remove unused router mocks (`mockPush`, `mockRefresh`, `next/navigation`) leftover in `components/__tests__/trip-form.test.tsx` from the legacy test split.
   - Transition test suite descriptions from ephemeral Red-Phase diagnostics (`Red Phase Assertions`, `RED PHASE CHECK`) to durable behavioral specifications.
   - Verify that no orphan scratch files or temporary exploration artifacts remain in the working tree.
3. **Execution Verification:**
   - Run containerized Jest suites (`./scripts/run-jest-container.sh components/__tests__/trip-form.test.tsx components/__tests__/auth-forms.test.tsx`) to verify zero regressions.
4. **Track Plan Updates:**
   - Update `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md` to mark Phase 2 Task 3 complete.

### 1.2 Architectural Context & Seam Boundaries

1. **Container vs. Presentational Decomposition Seam:**
   - In `components/trip-form.tsx`, `TripForm` acts as a stateful Container managing React 19 `useActionState`, React Hook Form context, Zustand store dispatch, and local mount lifecycle.
   - The selected wineries badge list (`selected-wineries-list`) was previously rendered inline deep within the `<FormField>` render prop callback (lines 178–202).
   - Extracting `SelectedWineriesList` as an explicit presentational component cleanly isolates presentation (badges, layout, delete button, hover effects, ARIA accessibility attributes, test IDs) from form logic and store coordination.
2. **Type Safety & Zod Schema Seam:**
   - Currently, `tripSchema` defines `wineries: z.array(z.any())`, forcing manual casts `(field.value || []) as Winery[]` and weakening type inference for `TripFormValues`.
   - Adopting `z.custom<Winery>()` ensures `TripFormValues['wineries']` is strictly inferred as `Winery[]`.
3. **Zustand 5 Selector Hygiene Seam:**
   - In accordance with `components/__tests__/selectorHygiene.test.tsx` and `AGENTS.md`, components should consume Zustand store actions via atomic selectors (`useTripStore((s) => s.createTrip)`) rather than invoking the full store hook (`useTripStore()`), avoiding unnecessary re-renders when unrelated store state mutates.
4. **Test Scaffolding Seam:**
   - During Phase 2 Task 1, `components/__tests__/trip-form.test.tsx` was extracted from `components/__tests__/react19-form-actions.test.tsx`.
   - Mocks for `next/navigation` (`useRouter`) were copied over from the auth form tests even though `TripForm` does not consume `useRouter`.
   - Cleaning up these unused mocks eliminates test bloat and prevents false confidence in unused mock implementations.

---

## 2. Invariants & Critical Guardrails

1. **Controlled Form Field State Invariant:**
   - All winery selections and removals must continue to route synchronously through React Hook Form's `field.onChange` without introducing asynchronous side effects or network requests.
2. **Component Purity & Prop Contract Invariant:**
   - `SelectedWineriesList` must be a pure presentational component receiving only `{ wineries: Winery[]; onRemoveWinery: (wineryId: string | number) => void }`. It must not access stores, context, or hooks.
3. **Test ID & DOM Contract Invariant:**
   - All existing test IDs (`trip-form-card`, `trip-name-input`, `trip-form-winery-autocomplete`, `selected-wineries-list`, `selected-winery-${winery.id}`, `create-trip-submit-btn`) and ARIA labels (`Remove ${winery.name}`) must remain unchanged to ensure zero test regression across unit and E2E suites.
4. **Production Database Safety (`AGENTS.md` Guardrail 1):**
   - Strictly zero database mutations or migrations. This task is purely frontend component refactoring and test scaffolding cleanup.
5. **Modal Approval Invariant (`AGENTS.md` Section 2 & `conductor_antigravity.md`):**
   - The executor must halt and wait for explicit user approval via modal before modifying any repository files.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `components/trip-form.tsx`

**File Path:** `components/trip-form.tsx`

#### Chunk 1: Replace Loose `z.any()` with Strict `z.custom<Winery>()`
- **Line Anchor:** Lines 34–43
- **Existing Content:**
```typescript
// Define the schema for validation
const tripSchema = z.object({
  name: z.string().min(1, "Trip name is required"),
  date: z.date({
    required_error: "Date is required",
  }),
  wineries: z.array(z.any()), // Using any for the complex Winery object
})

type TripFormValues = z.infer<typeof tripSchema>
```
- **Replacement Content:**
```typescript
// Define the schema for validation
const tripSchema = z.object({
  name: z.string().min(1, "Trip name is required"),
  date: z.date({
    required_error: "Date is required",
  }),
  wineries: z.array(z.custom<Winery>()),
});

type TripFormValues = z.infer<typeof tripSchema>;
```

---

#### Chunk 2: Add `SelectedWineriesList` Presentational Component
- **Line Anchor:** Line 48 (immediately after `TripActionState` definition, before `export default function TripForm`)
- **Existing Content:**
```typescript
type TripActionState = {
  success: boolean;
  error: string | null;
};

export default function TripForm({ initialDate, user, onClose }: TripFormProps) {
```
- **Replacement Content:**
```typescript
type TripActionState = {
  success: boolean;
  error: string | null;
};

interface SelectedWineriesListProps {
  wineries: Winery[];
  onRemoveWinery: (wineryId: string | number) => void;
}

export function SelectedWineriesList({ wineries, onRemoveWinery }: SelectedWineriesListProps) {
  if (wineries.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-2 mt-3 p-2 border rounded-lg bg-muted/30"
      data-testid="selected-wineries-list"
    >
      {wineries.map((winery) => (
        <Badge
          key={winery.id}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 px-2.5 py-1 text-xs"
          data-testid={`selected-winery-${winery.id}`}
        >
          <span>{winery.name}</span>
          <button
            type="button"
            onClick={() => onRemoveWinery(winery.id)}
            className="rounded-full p-0.5 hover:bg-black/10 text-primary-foreground/80 hover:text-primary-foreground transition-colors cursor-pointer"
            aria-label={`Remove ${winery.name}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

export default function TripForm({ initialDate, user, onClose }: TripFormProps) {
```

---

#### Chunk 3: Atomic Selector for `useTripStore`
- **Line Anchor:** Lines 59–61
- **Existing Content:**
```typescript
  const { toast } = useToast();
  const { createTrip } = useTripStore();
  
  // Initialize form
```
- **Replacement Content:**
```typescript
  const { toast } = useToast();
  const createTrip = useTripStore((s) => s.createTrip);
  
  // Initialize form
```

---

#### Chunk 4: Streamlined `<FormField>` Render Prop using `SelectedWineriesList`
- **Line Anchor:** Lines 148–208
- **Existing Content:**
```tsx
            <FormField
              control={form.control}
              name="wineries"
              render={({ field }) => {
                const wineries = (field.value || []) as Winery[];

                const handleSelectWinery = (winery: Winery) => {
                  const exists = wineries.some((w) => w.id === winery.id);
                  if (!exists) {
                    field.onChange([...wineries, winery]);
                  }
                };

                const handleRemoveWinery = (wineryId: string | number) => {
                  field.onChange(wineries.filter((w) => w.id !== wineryId));
                };

                return (
                  <FormItem>
                    <FormLabel className="font-semibold">Select Wineries (Optional):</FormLabel>
                    <FormControl>
                      <PlaceAutocomplete
                        placeholder="Search for a winery..."
                        onPlaceSelect={handleSelectWinery}
                        includedPrimaryTypes={["winery"]}
                        className="mt-2"
                        id="trip-form-winery-autocomplete"
                      />
                    </FormControl>

                    {/* Selected Wineries List */}
                    {wineries.length > 0 && (
                      <div
                        className="flex flex-wrap gap-2 mt-3 p-2 border rounded-lg bg-muted/30"
                        data-testid="selected-wineries-list"
                      >
                        {wineries.map((winery) => (
                          <Badge
                            key={winery.id}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 px-2.5 py-1 text-xs"
                            data-testid={`selected-winery-${winery.id}`}
                          >
                            <span>{winery.name}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveWinery(winery.id)}
                              className="rounded-full p-0.5 hover:bg-black/10 text-primary-foreground/80 hover:text-primary-foreground transition-colors cursor-pointer"
                              aria-label={`Remove ${winery.name}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}

                    <FormMessage />
                  </FormItem>
                );
              }}
            />
```
- **Replacement Content:**
```tsx
            <FormField
              control={form.control}
              name="wineries"
              render={({ field }) => {
                const wineries = field.value || [];

                const handleSelectWinery = (winery: Winery) => {
                  const exists = wineries.some((w) => w.id === winery.id);
                  if (!exists) {
                    field.onChange([...wineries, winery]);
                  }
                };

                const handleRemoveWinery = (wineryId: string | number) => {
                  field.onChange(wineries.filter((w) => w.id !== wineryId));
                };

                return (
                  <FormItem>
                    <FormLabel className="font-semibold">Select Wineries (Optional):</FormLabel>
                    <FormControl>
                      <PlaceAutocomplete
                        placeholder="Search for a winery..."
                        onPlaceSelect={handleSelectWinery}
                        includedPrimaryTypes={["winery"]}
                        className="mt-2"
                        id="trip-form-winery-autocomplete"
                      />
                    </FormControl>

                    <SelectedWineriesList
                      wineries={wineries}
                      onRemoveWinery={handleRemoveWinery}
                    />

                    <FormMessage />
                  </FormItem>
                );
              }}
            />
```

---

### 3.2 Target File: `components/__tests__/trip-form.test.tsx`

**File Path:** `components/__tests__/trip-form.test.tsx`

#### Chunk 1: Remove Dead Scaffolding Mocks (`useRouter`, `mockPush`, `mockRefresh`)
- **Line Anchor:** Lines 7–25
- **Existing Content:**
```typescript
const mockPush = jest.fn();
const mockRefresh = jest.fn();
const mockToast = jest.fn();

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
    toasts: [],
    dismiss: jest.fn(),
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));
```
- **Replacement Content:**
```typescript
const mockToast = jest.fn();

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
    toasts: [],
    dismiss: jest.fn(),
  }),
}));
```

---

#### Chunk 2: Update Suite Narrative to Durable Behavioral Specifications
- **Line Anchor:** Lines 108–142
- **Existing Content:**
```typescript
  describe('Controlled FormField Binding & Deduplication (Red Phase Assertions)', () => {
    it('updates form state synchronously via controlled field without invoking legacy ensureInDb on place select', async () => {
      const ensureInDbMock = jest.fn();
      useWineryStore.setState({ ensureInDb: ensureInDbMock });

      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      // RED PHASE CHECK: In current TripForm, handleWineryToggle calls ensureInDb(winery.id).
      // Controlled FormField binding must NOT call ensureInDb on place selection.
      expect(ensureInDbMock).not.toHaveBeenCalled();
    });

    it('deduplicates winery selection when the same winery is selected multiple times from autocomplete', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');

      // First click: adds winery
      fireEvent.click(winerySelectButton);
      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();

      // Second click: autocomplete selection must deduplicate, NOT toggle off
      fireEvent.click(winerySelectButton);

      // RED PHASE CHECK: In current TripForm, handleWineryToggle toggles the winery off on second click.
      // Target FormField binding deduplicates and keeps the tag in the list.
      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      const selectedTags = screen.getAllByTestId('selected-winery-google-place-winery-123');
      expect(selectedTags).toHaveLength(1);
    });
```
- **Replacement Content:**
```typescript
  describe('Controlled FormField Binding & Deduplication Invariants', () => {
    it('updates form state synchronously via controlled field without invoking legacy ensureInDb on place select', async () => {
      const ensureInDbMock = jest.fn();
      useWineryStore.setState({ ensureInDb: ensureInDbMock });

      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      expect(ensureInDbMock).not.toHaveBeenCalled();
    });

    it('deduplicates winery selection when the same winery is selected multiple times from autocomplete', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');

      // First click: adds winery
      fireEvent.click(winerySelectButton);
      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();

      // Second click: autocomplete selection must deduplicate, NOT toggle off
      fireEvent.click(winerySelectButton);

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      const selectedTags = screen.getAllByTestId('selected-winery-google-place-winery-123');
      expect(selectedTags).toHaveLength(1);
    });
```

---

### 3.3 Target File: `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`

**File Path:** `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`

#### Line Anchor Context:
Lines 32–34 in `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`:
```markdown
- [ ] Task: Refactor & Scaffolding Cleanup
    - [ ] Refactor `components/trip-form.tsx` for readability and adherence to UI container/presentational conventions.
    - [ ] Audit and verify clean test files without any temporary scaffolding artifacts.
```

#### Exact Drop-in Code Chunk:
```markdown
- [x] Task: Refactor & Scaffolding Cleanup [commit: <commit_sha>]
    - [x] Refactor `components/trip-form.tsx` for readability and adherence to UI container/presentational conventions.
    - [x] Audit and verify clean test files without any temporary scaffolding artifacts.
```

---

### 3.4 Complete File References

#### Complete Revised `components/trip-form.tsx`
```tsx
// components/trip-form.tsx
"use client"

import { useState, useEffect, useActionState, startTransition } from "react";
import { useTripStore } from "@/lib/stores/tripStore"; 
import { DatePicker } from "./DatePicker";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { AuthenticatedUser, Winery } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "./ui/badge";
import { X } from "lucide-react";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { formatDateLocal } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

interface TripFormProps {
  initialDate?: Date;
  user: AuthenticatedUser;
  onClose?: () => void;
}

// Define the schema for validation
const tripSchema = z.object({
  name: z.string().min(1, "Trip name is required"),
  date: z.date({
    required_error: "Date is required",
  }),
  wineries: z.array(z.custom<Winery>()),
});

type TripFormValues = z.infer<typeof tripSchema>;

type TripActionState = {
  success: boolean;
  error: string | null;
};

interface SelectedWineriesListProps {
  wineries: Winery[];
  onRemoveWinery: (wineryId: string | number) => void;
}

export function SelectedWineriesList({ wineries, onRemoveWinery }: SelectedWineriesListProps) {
  if (wineries.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-2 mt-3 p-2 border rounded-lg bg-muted/30"
      data-testid="selected-wineries-list"
    >
      {wineries.map((winery) => (
        <Badge
          key={winery.id}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 px-2.5 py-1 text-xs"
          data-testid={`selected-winery-${winery.id}`}
        >
          <span>{winery.name}</span>
          <button
            type="button"
            onClick={() => onRemoveWinery(winery.id)}
            className="rounded-full p-0.5 hover:bg-black/10 text-primary-foreground/80 hover:text-primary-foreground transition-colors cursor-pointer"
            aria-label={`Remove ${winery.name}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

export default function TripForm({ initialDate, user, onClose }: TripFormProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Use requestAnimationFrame to ensure we only mark as ready 
    // after the browser has had a chance to render the initial frame
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const { toast } = useToast();
  const createTrip = useTripStore((s) => s.createTrip);
  
  // Initialize form
  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      date: initialDate,
      wineries: [],
    },
  });

  const [_actionState, formAction, isPending] = useActionState<TripActionState, TripFormValues>(
    async (_prevState, data) => {
      try {
        await createTrip({
          name: data.name,
          trip_date: formatDateLocal(data.date),
          wineries: data.wineries,
          user_id: user.id,
        });
        toast({ description: "Trip created successfully!" });
        
        // Reset form but keep date if desired, or reset completely
        form.reset({
          name: "",
          date: data.date, // Keep the date
          wineries: [],
        });
        onClose?.(); // Close the modal
        return { success: true, error: null };
      } catch (error: unknown) {
        const err = error as { message?: string } | null;
        const errorMessage = err?.message || "Failed to create trip.";
        toast({ variant: "destructive", description: "Failed to create trip." });
        form.setError("root", { message: errorMessage });
        return { success: false, error: errorMessage };
      }
    },
    { success: false, error: null }
  );

  const onSubmit = (data: TripFormValues) => {
    startTransition(() => {
      formAction(data);
    });
  };

  return (
    <Card data-testid="trip-form-card" data-state={mounted ? "ready" : "loading"}>
      <CardHeader>
        <CardTitle>Create a New Trip</CardTitle>
        <CardDescription>Give your trip a name and date, then search for wineries to add.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input placeholder="Trip Name" {...field} data-testid="trip-name-input" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <DatePicker 
                        date={field.value} 
                        onSelect={field.onChange} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="wineries"
              render={({ field }) => {
                const wineries = field.value || [];

                const handleSelectWinery = (winery: Winery) => {
                  const exists = wineries.some((w) => w.id === winery.id);
                  if (!exists) {
                    field.onChange([...wineries, winery]);
                  }
                };

                const handleRemoveWinery = (wineryId: string | number) => {
                  field.onChange(wineries.filter((w) => w.id !== wineryId));
                };

                return (
                  <FormItem>
                    <FormLabel className="font-semibold">Select Wineries (Optional):</FormLabel>
                    <FormControl>
                      <PlaceAutocomplete
                        placeholder="Search for a winery..."
                        onPlaceSelect={handleSelectWinery}
                        includedPrimaryTypes={["winery"]}
                        className="mt-2"
                        id="trip-form-winery-autocomplete"
                      />
                    </FormControl>

                    <SelectedWineriesList
                      wineries={wineries}
                      onRemoveWinery={handleRemoveWinery}
                    />

                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {form.formState.errors.root?.message && (
              <p className="text-sm font-medium text-destructive">
                {form.formState.errors.root.message}
              </p>
            )}

            <Button 
              type="submit" 
              disabled={!form.formState.isValid || isPending} 
              data-testid="create-trip-submit-btn"
              data-is-valid={form.formState.isValid}
            >
              {isPending ? "Creating..." : "Create Trip"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
```

#### Complete Revised `components/__tests__/trip-form.test.tsx`
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TripForm from '../trip-form';
import { useTripStore } from '@/lib/stores/tripStore';
import { useWineryStore } from '@/lib/stores/wineryStore';
import { AuthenticatedUser } from '@/lib/types';

const mockToast = jest.fn();

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
    toasts: [],
    dismiss: jest.fn(),
  }),
}));

// Mock PlaceAutocomplete to allow multi-winery selection simulation
jest.mock('../PlaceAutocomplete', () => ({
  PlaceAutocomplete: ({ onPlaceSelect }: any) => (
    <div data-testid="mock-place-autocomplete-container">
      <button
        data-testid="trip-form-winery-autocomplete"
        type="button"
        onClick={() =>
          onPlaceSelect({
            id: 'google-place-winery-123',
            name: 'Keuka Spring Vineyards',
            address: '243 Route 54, Penn Yan, NY',
            location: { latitude: 42.63, longitude: -77.12 },
          })
        }
      >
        Select Keuka Spring Vineyards
      </button>
      <button
        data-testid="mock-select-winery-2"
        type="button"
        onClick={() =>
          onPlaceSelect({
            id: 'google-place-winery-456',
            name: 'Dr. Konstantin Frank',
            address: '9749 Middle Rd, Hammondsport, NY',
            location: { latitude: 42.55, longitude: -77.18 },
          })
        }
      >
        Select Dr. Konstantin Frank
      </button>
    </div>
  ),
}));

describe('TripForm Controlled FormField & Multi-Stop Binding', () => {
  const mockUser: AuthenticatedUser = {
    id: 'user-trip-123',
    email: 'planner@example.com',
    name: 'Finger Lakes Explorer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useTripStore.getState().reset();
    useWineryStore.getState().reset();
  });

  describe('Validation & Baseline Invariants', () => {
    it('preserves react-hook-form / Zod validation and prevents submission on empty trip name', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const submitButton = screen.getByTestId('create-trip-submit-btn');
      expect(submitButton).toBeDisabled();
    });

    it('allows offline winery selection without throwing errors or blocking selection (FM-6.3)', async () => {
      mockToast.mockClear();

      const ensureInDbMock = jest.fn().mockResolvedValue(null);
      const upsertWineryMock = jest.fn();

      useWineryStore.setState({
        ensureInDb: ensureInDbMock,
        upsertWinery: upsertWineryMock,
      });

      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      await waitFor(() => {
        expect(mockToast).not.toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'destructive' })
        );
        expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      });
    });
  });

  describe('Controlled FormField Binding & Deduplication Invariants', () => {
    it('updates form state synchronously via controlled field without invoking legacy ensureInDb on place select', async () => {
      const ensureInDbMock = jest.fn();
      useWineryStore.setState({ ensureInDb: ensureInDbMock });

      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      expect(ensureInDbMock).not.toHaveBeenCalled();
    });

    it('deduplicates winery selection when the same winery is selected multiple times from autocomplete', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');

      // First click: adds winery
      fireEvent.click(winerySelectButton);
      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();

      // Second click: autocomplete selection must deduplicate, NOT toggle off
      fireEvent.click(winerySelectButton);

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      const selectedTags = screen.getAllByTestId('selected-winery-google-place-winery-123');
      expect(selectedTags).toHaveLength(1);
    });

    it('removes selected winery tag when the remove button is clicked and preserves other selected wineries', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      // Select winery 1 and winery 2
      fireEvent.click(screen.getByTestId('trip-form-winery-autocomplete'));
      fireEvent.click(screen.getByTestId('mock-select-winery-2'));

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      expect(screen.getByTestId('selected-winery-google-place-winery-456')).toBeInTheDocument();

      // Click remove on winery 1 badge
      const removeButton = screen.getByRole('button', { name: /remove keuka spring vineyards/i });
      fireEvent.click(removeButton);

      expect(screen.queryByTestId('selected-winery-google-place-winery-123')).not.toBeInTheDocument();
      expect(screen.getByTestId('selected-winery-google-place-winery-456')).toBeInTheDocument();
    });

    it('submits form with trip name, local date, and selected wineries payload to createTrip', async () => {
      const createTripMock = jest.fn().mockResolvedValue({ id: 101, name: 'Keuka Lake Tour' });
      useTripStore.setState({ createTrip: createTripMock });
      const mockOnClose = jest.fn();

      render(
        <TripForm
          user={mockUser}
          initialDate={new Date('2026-10-15T12:00:00')}
          onClose={mockOnClose}
        />
      );

      // Fill trip name
      const nameInput = screen.getByTestId('trip-name-input');
      fireEvent.change(nameInput, { target: { value: 'Keuka Lake Tour' } });

      // Add winery 1 and winery 2, then remove winery 1
      fireEvent.click(screen.getByTestId('trip-form-winery-autocomplete'));
      fireEvent.click(screen.getByTestId('mock-select-winery-2'));

      const removeButton = screen.getByRole('button', { name: /remove keuka spring vineyards/i });
      fireEvent.click(removeButton);

      // Verify submit button is enabled
      const submitButton = screen.getByTestId('create-trip-submit-btn');
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });

      // Submit form
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(createTripMock).toHaveBeenCalledTimes(1);
        expect(createTripMock).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Keuka Lake Tour',
            trip_date: '2026-10-15',
            user_id: 'user-trip-123',
            wineries: [
              expect.objectContaining({
                id: 'google-place-winery-456',
                name: 'Dr. Konstantin Frank',
              }),
            ],
          })
        );
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Trip created successfully!' })
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
```

---

## 4. Execution Verification Protocol

The executor MUST execute the following exact commands to verify Phase 2 Task 3:

### 4.1 Step 1: Run Containerized Jest Tests for `TripForm` and Auth Forms
Execute unit tests in the container (`BypassSandbox: true`):

```bash
./scripts/run-jest-container.sh components/__tests__/trip-form.test.tsx components/__tests__/auth-forms.test.tsx
```

> [!IMPORTANT]
> **Expected Outcome:** Both test suites pass (100% green). All 5 `TripForm` tests and all 3 `AuthForms` tests pass with zero errors and zero warnings.

### 4.2 Step 2: Run Full Components Unit Test Suite
Execute all component tests in the container to confirm zero collateral regressions (`BypassSandbox: true`):

```bash
./scripts/run-jest-container.sh components/__tests__/
```

> [!IMPORTANT]
> **Expected Outcome:** All component test suites pass.

### 4.3 Step 3: Git Status & Hygiene Audit
Verify working tree cleanliness:

```bash
git status --short
```

> [!NOTE]
> Only `components/trip-form.tsx`, `components/__tests__/trip-form.test.tsx`, `conductor/tracks/initial-trip-creation-wineries_20261002/plan.md`, and `conductor/tracks/initial-trip-creation-wineries_20261002/phase-2-task-3-plan.md` should have modifications. No temporary files (`*.tmp`, `*.bak`) should exist.

---

## 5. Gate & Approval Checkpoint

No source code files or test files have been modified yet. Static seam-bounded inspection is complete, and this implementation plan provides exact line-anchored drop-in code blocks. Proceeding with file edits and containerized test execution requires explicit user approval via modal.
