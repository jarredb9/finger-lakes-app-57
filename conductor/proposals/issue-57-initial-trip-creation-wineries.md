fix/57-trip-form-wineries
# Architecture Proposal & Implementation Plan: Initial Trip Creation Winery Persistence

> **Target Issue:** [jarredb9/finger-lakes-app-57#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57)  
> **Component Focus:** `components/trip-form.tsx`, `lib/services/tripService.ts`, `lib/stores/slices/tripMutationHelpers.ts`, `components/TripCardSimplePresentational.tsx`  
> **Status:** Proposal & Plan (Pre-Implementation)  
> **Date:** September 28, 2026  

---

## 1. Executive Summary & Root Cause Analysis

### Issue Description
When creating a new trip via the "Create a Trip" dialog ([`TripForm`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-form.tsx)), users can provide a name, select a date, search for, and select wineries. However, upon trip creation, the resulting trip card displays **"0 Wineries"**, and the selected wineries are not associated with the created trip. In contrast, adding wineries from the individual winery modal or from the trip details view works correctly.

### Root Causes
1. **Unregistered Form Field in `TripForm` ([`components/trip-form.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-form.tsx)):**
   - The form uses `react-hook-form` with `zodResolver(tripSchema)`.
   - While `name` and `date` are controlled via `<FormField control={form.control} ... />`, the winery selection relies on imperative `form.setValue("wineries", ...)` calls without registering the field with `react-hook-form` via `<FormField>` or `form.register("wineries")`.
   - Without explicit registration, dirty state and validation tracking in React 19's `useActionState` / `formAction` can become inconsistent, and field state is detached from the formal controller lifecycle.

2. **Store Synchronization & Winery Count Discrepancy ([`lib/stores/slices/tripMutationHelpers.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/slices/tripMutationHelpers.ts)):**
   - In `createTripHelper`:
     - The optimistic `tempTrip` initializes `wineries: validWineries`, but leaves `wineries_count` undefined.
     - When `TripService.createTrip` returns, it calls `TripService.getTripById` (which runs Postgres RPC `get_trip_details`). This RPC populates `wineries: [...]` but does **not** populate `wineries_count`.
     - In contrast, list views (`TripService.getTrips`) fetch trips with `wineries_count: t.trip_wineries?.[0]?.count || 0` and empty `wineries: []`.
     - In [`TripCardSimplePresentational.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/TripCardSimplePresentational.tsx#L164), the badge renders `{trip.wineries_count ?? trip.wineries?.length ?? 0} Wineries`.
     - When `createTripHelper` replaces `tempTrip` with `syncedTrip`, it does not set `wineries_count` or trigger background cache refresh (`fetchUpcomingTrips`, `fetchTrips`, `fetchTripsForDate`), leaving list views out of sync with Postgres aggregates.

3. **Chained Multi-Stop Addition with Ephemeral DB IDs ([`lib/services/tripService.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/tripService.ts#L134-L149)):**
   - When creating a trip with multiple wineries, `TripService.createTrip` invokes `create_trip_with_winery` with `p_winery_data: WineryService.getRpcData(w)` for the first winery.
   - For subsequent wineries (`trip.wineries.slice(1)`), it iterates with:
     ```typescript
     await this.addWineryToExistingTrip(data.trip_id, extra.dbId || 0, null);
     ```
   - If a winery was just selected from Google Places and has not yet been persisted to the Postgres `wineries` table, `extra.dbId` is either `undefined` or an ephemeral client ID (`-Date.now()`). Passing `0` or negative IDs to `addWineryToExistingTrip` causes the database foreign key / lookup to fail.

---

## 2. Settled Grilling Decisions

Through the design tree interview, the following decisions were finalized:

| Question | Area | Decision | Rationale |
| :--- | :--- | :--- | :--- |
| **Q1** | Field Registration | **Option A**: Formal `<FormField>` binding | Wraps winery selection in `<FormField control={form.control} name="wineries" render={({ field }) => ...} />`, driving updates via `field.onChange` as the single source of truth. |
| **Q2** | Store Synchronization | **Option A**: Explicit count + background re-fetch | Set `wineries_count: (createdTrip?.wineries?.length ?? validWineries.length)` on the synced store record and fire background re-fetches to sync with server aggregates. |
| **Q3** | Multi-Winery Chaining | **Option B**: Polymorphic RPC payload | Allow `addWineryToExistingTrip` to accept full `Winery` data and invoke RPC with `p_winery_data` if no positive DB ID exists. |
| **Q4** | Async Autocomplete State | **Option A**: Synchronous form update | Update `field.onChange` immediately with the standardized winery; database upsert occurs automatically via `p_winery_data` on trip creation. |
| **Q5** | Background Refresh Timing | **Option A**: Fire-and-forget | Non-blocking `void Promise.all([...])` keeps UI dialog transitions instant while ensuring eventual cache consistency. |
| **Q6** | Service Method Signature | **Option A**: `wineryOrId: number \| Winery` | Polymorphic signature preserves backwards compatibility for existing callers while supporting direct `Winery` object passing. |

---

## 3. Domain Model Alignment (`CONTEXT.md`)

- **Trip**: A scheduled itinerary of planned winery stops for a specific calendar date, organized by an owner and optionally shared with collaborators.
- **Trip Stop**: A single planned destination within a Trip, specifying a Winery, its sequence in the itinerary, and planning notes.
- **Winery**: A commercial establishment producing or offering wine tasting in the region.
- All coordinate lookups continue through [`standardizeWineryData`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/utils/winery.ts) accessing `location.latitude` and `location.longitude`.

---

## 4. Detailed Implementation Steps

### Step 1: Update `TripForm` ([`components/trip-form.tsx`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip-form.tsx))
1. Wrap the winery autocomplete and selected wineries list inside:
   ```tsx
   <FormField
     control={form.control}
     name="wineries"
     render={({ field }) => (
       <div>
         <FormLabel className="font-semibold">Select Wineries (Optional):</FormLabel>
         <PlaceAutocomplete
           placeholder="Search for a winery..."
           onPlaceSelect={(winery) => {
             const current = field.value || [];
             if (!current.some((w: Winery) => w.id === winery.id)) {
               field.onChange([...current, winery]);
             }
           }}
           includedPrimaryTypes={["winery"]}
           className="mt-2"
           id="trip-form-winery-autocomplete"
         />
         {field.value && field.value.length > 0 && (
           <div className="flex flex-wrap gap-2 mt-3 p-2 border rounded-lg bg-muted/30" data-testid="selected-wineries-list">
             {field.value.map((winery: Winery) => (
               <Badge key={winery.id} ...>
                 <span>{winery.name}</span>
                 <button
                   type="button"
                   onClick={() => field.onChange(field.value.filter((w: Winery) => w.id !== winery.id))}
                   ...
                 >
                   <X className="w-3.5 h-3.5" />
                 </button>
               </Badge>
             ))}
           </div>
         )}
         <FormMessage />
       </div>
     )}
   />
   ```
2. Remove imperative `handleWineryToggle` and `form.setValue("wineries", ...)`.

### Step 2: Extend `TripService.addWineryToExistingTrip` ([`lib/services/tripService.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/services/tripService.ts))
1. Update signature:
   ```typescript
   async addWineryToExistingTrip(tripId: number, wineryOrId: number | Winery, notes: string | null)
   ```
2. If `typeof wineryOrId === 'object'`, inspect `wineryOrId.dbId`:
   - If `wineryOrId.dbId && wineryOrId.dbId > 0`: pass `p_winery_data: WineryService.getRpcData(wineryOrId)` (or `p_winery_id`).
   - If `!wineryOrId.dbId || wineryOrId.dbId <= 0`: pass `p_winery_data: WineryService.getRpcData(wineryOrId)`.
3. In `TripService.createTrip`:
   ```typescript
   if (trip.wineries.length > 1) {
     const extraWineries = trip.wineries.slice(1);
     try {
       for (const extra of extraWineries) {
         await this.addWineryToExistingTrip(data.trip_id, extra, null);
       }
     } ...
   }
   ```

### Step 3: Align Store Counts and Invalidation ([`lib/stores/slices/tripMutationHelpers.ts`](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/slices/tripMutationHelpers.ts))
1. In `createTripHelper`:
   - Set `wineries_count: validWineries.length` on `tempTrip`.
   - Set `wineries_count: (createdTrip?.wineries?.length ?? validWineries.length)` on `syncedTrip`.
   - Dispatch fire-and-forget background cache synchronization:
     ```typescript
     const targetDate = createdTrip?.trip_date || validTripDate;
     void Promise.all([
       get().fetchUpcomingTrips?.(),
       get().fetchTripsForDate?.(targetDate),
       get().fetchTrips?.(1, 'upcoming', true)
     ]).catch(err => {
       console.warn('[createTripHelper] Background cache re-fetch failed:', err);
     });
     ```

---

## 5. Verification & Testing Plan

1. **Unit Tests (Jest via Container Runner):**
   - Run existing test suites:
     `./scripts/run-jest-container.sh components/__tests__/trip-form.test.tsx lib/services/__tests__/tripService.mutations.test.ts`
   - Add test case in `trip-form.test.tsx`:
     - Select a winery via `PlaceAutocomplete`.
     - Verify badge appears in the DOM.
     - Submit form.
     - Verify `createTrip` was called with payload including the selected winery in `wineries`.
   - Add test case in `tripService.mutations.test.ts`:
     - Verify `createTrip` with multiple wineries passes full winery RPC payload to chained `addWineryToExistingTrip` calls when DB ID is unassigned.
   - Add test case in `tripMutationHelpers.test.ts`:
     - Verify `createTripHelper` populates `wineries_count` in both optimistic and synced trip store states.

2. **Container Build Verification:**
   - Run type checks / build: `npm run db:check-types:local`
