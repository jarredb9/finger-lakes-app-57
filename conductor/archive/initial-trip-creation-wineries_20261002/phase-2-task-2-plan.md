# Implementation Plan: Phase 2 Task 2 - Implement Controlled `<FormField>` Binding in `TripForm` (Green Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 2 (Test Suite Restructuring & Controlled Binding (`TripForm`))  
**Task:** 2 (Implement Controlled `<FormField>` Binding in `TripForm` - Green Phase)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Transition `components/trip-form.tsx` from the Red Phase into the Green Phase by binding `PlaceAutocomplete` and selected winery tags inside a formal React Hook Form `<FormField control={form.control} name="wineries" render={({ field }) => ...} />`. This eliminates legacy imperative store side effects (`ensureInDb`, `upsertWinery`, `form.setValue`), enables synchronous form state updates with ID-based deduplication on place selection, and ensures tag removal updates `field.onChange` cleanly.

### 1.2 Architectural Context & Seam Boundaries
1. **The Legacy State Detachment & Side-Effect Problem:**
   - In current `components/trip-form.tsx` (lines 107–127 and 174–213):
     - The winery autocomplete input and selected winery badge list reside in an unmanaged `<div>` outside React Hook Form's `<FormField>`.
     - Selection is mediated by `handleWineryToggle`, which executes `upsertWinery`, calls `await ensureInDb(winery.id)`, assigns an arbitrary temporary negative ID (`-Date.now()`), and uses imperative `form.setValue("wineries", ...)`.
     - Re-selecting the same winery in `PlaceAutocomplete` filters it out of the array (acting as a toggle instead of deduplication).
   - These side effects caused test failures in the Red Phase (`components/__tests__/trip-form.test.tsx`):
     - `ensureInDbMock` was invoked during selection, violating decoupling invariants.
     - Re-selection of the same winery removed the badge instead of deduplicating.
2. **Target Architecture (`spec.md` Section 3.3):**
   - Wrap winery selection entirely within `<FormField control={form.control} name="wineries" render={({ field }) => ...} />`.
   - Selection via `PlaceAutocomplete.onPlaceSelect` invokes a synchronous handler that checks `wineries.some(w => w.id === winery.id)`:
     - If the winery is not yet selected, it calls `field.onChange([...wineries, winery])`.
     - If the winery is already selected, it is a no-op (deduplicating cleanly).
   - Badge removal invokes `field.onChange(wineries.filter(w => w.id !== wineryId))` with `aria-label="Remove ${winery.name}"`.
   - Remove `useWineryStore`, `ensureInDb`, `upsertWinery`, `form.watch("wineries")`, and `handleWineryToggle` entirely from `components/trip-form.tsx`.
   - Database ID resolution and multi-stop chaining belong in `TripService` (Phase 3), not in the UI presentational form.

---

## 2. Invariants & Guardrails

1. **Synchronous Controlled Binding Invariant:**
   - Place selection must update React Hook Form state synchronously via `field.onChange` without asynchronous side effects or network trips to Supabase in the form component.
2. **Idempotent Selection (Deduplication) Invariant:**
   - Selecting an already-selected winery from `PlaceAutocomplete` must deduplicate by `winery.id` without creating duplicate tags or toggling existing tags off.
3. **Tag Removal Invariant:**
   - Clicking the remove button (`X`) on any winery badge must remove only that winery from `field.value` and preserve all other selected wineries.
4. **Form Submission Invariant:**
   - Form submission via `handleSubmit(onSubmit)` must deliver the exact array of selected `Winery` objects in `data.wineries` to `createTrip`.
5. **No Production Mutation Invariant:**
   - This task is purely frontend UI component refactoring. No database schema changes, migrations, or RPC executions are permitted.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File: `components/trip-form.tsx`
- **File Path:** `components/trip-form.tsx`

#### Chunk 1: Remove Unused Store Import
- **Anchor:** Lines 4–6
- **Existing Content:**
```typescript
import { useState, useEffect, useActionState, startTransition } from "react";
import { useTripStore } from "@/lib/stores/tripStore"; 
import { useWineryStore } from "@/lib/stores/wineryStore";
```
- **Replacement Content:**
```typescript
import { useState, useEffect, useActionState, startTransition } from "react";
import { useTripStore } from "@/lib/stores/tripStore"; 
```

---

#### Chunk 2: Remove Unused Store Hook Destructuring
- **Anchor:** Lines 60–63
- **Existing Content:**
```typescript
  const { toast } = useToast();
  const { createTrip } = useTripStore();
  const { ensureInDb, upsertWinery } = useWineryStore();
```
- **Replacement Content:**
```typescript
  const { toast } = useToast();
  const { createTrip } = useTripStore();
```

---

#### Chunk 3: Remove Imperative Store Methods and Watcher
- **Anchor:** Lines 105–128
- **Existing Content:**
```typescript
  const selectedWineries = form.watch("wineries") as Winery[];

  const handleWineryToggle = async (winery: Winery) => {
    const currentWineries = form.getValues("wineries") as Winery[];
    const isSelected = currentWineries.some(w => w.id === winery.id);

    if (isSelected) {
      form.setValue("wineries", currentWineries.filter(w => w.id !== winery.id));
    } else {
      // Add - first ensure it's in the store and DB
      upsertWinery(winery);
      let dbId: number | null = null;
      try {
        dbId = await ensureInDb(winery.id);
      } catch {
        dbId = null;
      }
      
      const resolvedDbId = dbId ?? -Date.now();
      const wineryWithDbId = { ...winery, dbId: resolvedDbId };
      form.setValue("wineries", [...currentWineries, wineryWithDbId]);
    }
  };
```
- **Replacement Content:**
*(Delete lines 105–128; no replacement code needed here as state is managed inside the `<FormField>` render prop).*

---

#### Chunk 4: Replace Unmanaged `<div>` with Controlled `<FormField>`
- **Anchor:** Lines 174–213
- **Existing Content:**
```tsx
            <div>
              <FormLabel className="font-semibold">Select Wineries (Optional):</FormLabel>
              
              <PlaceAutocomplete
                placeholder="Search for a winery..."
                onPlaceSelect={async (winery) => {
                  await handleWineryToggle(winery);
                }}
                includedPrimaryTypes={["winery"]}
                className="mt-2"
                id="trip-form-winery-autocomplete"
              />

              {/* Selected Wineries List */}
              {selectedWineries.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 p-2 border rounded-lg bg-muted/30" data-testid="selected-wineries-list">
                  {selectedWineries.map((winery) => (
                    <Badge 
                      key={winery.id} 
                      className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 px-2.5 py-1 text-xs"
                      data-testid={`selected-winery-${winery.id}`}
                    >
                      <span>{winery.name}</span>
                      <button 
                        type="button" 
                        onClick={() => handleWineryToggle(winery)}
                        className="rounded-full p-0.5 hover:bg-black/10 text-primary-foreground/80 hover:text-primary-foreground transition-colors cursor-pointer"
                        aria-label={`Remove ${winery.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Show error for wineries if we added validation for min length later */}
              <FormMessage>{form.formState.errors.wineries?.message}</FormMessage>
            </div>
```
- **Replacement Content:**
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

---

### 3.2 Complete File Reference for `components/trip-form.tsx`
For absolute drop-in clarity, here is the complete revised `components/trip-form.tsx`:

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
  wineries: z.array(z.any()), // Using any for the complex Winery object
})

type TripFormValues = z.infer<typeof tripSchema>

type TripActionState = {
  success: boolean;
  error: string | null;
};

export default function TripForm({ initialDate, user, onClose }: TripFormProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Use requestAnimationFrame to ensure we only mark as ready 
    // after the browser has had a chance to render the initial frame
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const { toast } = useToast();
  const { createTrip } = useTripStore();
  
  // Initialize form
  const form = useForm<TripFormValues>({
    resolver: zodResolver(tripSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      date: initialDate,
      wineries: [],
    },
  })

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

---

## 4. Execution Verification Protocol

### Exact Test Runner Command
Per `AGENTS.md`, Jest unit tests run containerized via Podman using the following exact command:

```bash
./scripts/run-jest-container.sh components/__tests__/trip-form.test.tsx components/__tests__/auth-forms.test.tsx
```

> [!IMPORTANT]
> - Running this container runner requires `BypassSandbox: true` (due to container socket requirements).
> - Expected result during Task 2 Green Phase execution:
>   - `components/__tests__/auth-forms.test.tsx`: **PASS** (3/3 tests pass).
>   - `components/__tests__/trip-form.test.tsx`: **PASS** (5/5 tests pass, converting the 2 failing Red Phase tests into passing Green Phase tests).
>   - Total: 8/8 tests passing across both suites.

---

## 5. Gating & Approval Barrier

No source code files (`components/trip-form.tsx`) have been modified yet. Static seam-bounded inspection is complete, and this implementation plan provides exact line-anchored drop-in code blocks. Proceeding with file edits and containerized test execution requires explicit user approval via modal.
