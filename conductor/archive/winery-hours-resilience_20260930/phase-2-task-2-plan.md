# Implementation Plan: Phase 2 Task 2 - Implement Numeric ID On-Demand Enrichment in wineryStore

## 1. Executive Summary & Problem Analysis
In Issue #56, winery cards and modals frequently display "Closed" or missing operational hours when navigated via numeric database IDs (e.g. `'2988'` from map markers, trip stops, or visit history).
When `ensureWineryDetails` receives a numeric database ID, it queries the Supabase Postgres RPC `get_winery_details_by_id`. However, if the Postgres record contains `opening_hours: null` (basic or un-enriched tier), the store must not terminate early with un-enriched data. Instead, it must resolve `dbData.google_place_id` and trigger the Supabase Edge Function `get-winery-details` on demand, while maintaining `loadingWineryId` active so UI skeleton states render properly rather than defaulting to "Closed".

The Red phase tests committed in `887fc12d` (`lib/stores/__tests__/wineryStore.test.ts`) establish the rigorous behavioral contract for this implementation:
1. `ensureWineryDetails('2988')` invokes Edge Function `get-winery-details` with resolved `google_place_id` when DB lacks opening hours.
2. Missing `google_place_id` logs a warning, returns standardized DB record with `openingHours: null`, and cleanly clears `loadingWineryId`.
3. Edge Function 500 errors or network rejections return standardized DB record without throwing or stalling `loadingWineryId`.
4. `loadingWineryId` is held active as `'2988'` throughout on-demand enrichment and cleared upon completion.
5. Background revalidation (`revalidateInBackground`) resolves numeric IDs to canonical Place IDs and cleans up `inFlightRevalidations` in a `finally` block.
6. Modal opening callers across the application are audited and standardized to prioritize `google_place_id` / Place IDs where available.

---

## 2. Target File Modifications & Precise Drop-in Code Chunks

### File 1: [lib/stores/wineryStore.ts](file:///home/byrnesjd4821/Git/finger-lakes-app-57/lib/stores/wineryStore.ts)

#### Anchor: Lines 205–235 (`revalidateInBackground`)
**Existing Context (Line 205):**
```typescript
        const revalidateInBackground = (targetPlaceId: GooglePlaceId) => {
          let resolvedPlaceId = targetPlaceId;
          if (/^\d+$/.test(targetPlaceId)) {
            const cached = get().getWinery(targetPlaceId);
            if (cached?.id && !/^\d+$/.test(cached.id)) {
              resolvedPlaceId = cached.id;
            } else {
              return;
            }
          }
          if (resolvedPlaceId.startsWith('test-') || resolvedPlaceId.startsWith('mock-') || inFlightRevalidations.has(resolvedPlaceId)) return;
          // @ts-ignore
          const skipDetailsMock = typeof window !== 'undefined' && window._E2E_SKIP_DETAILS_MOCK;
          if (process.env.NEXT_PUBLIC_IS_E2E === 'true' && shouldMockWineries() && !skipDetailsMock) return;

          inFlightRevalidations.add(resolvedPlaceId);
          invokeFunction('get-winery-details', { body: { placeId: resolvedPlaceId } })
            .then(({ data: googleData, error: functionError }) => {
              if (!functionError && googleData) {
                const currentExisting = get().getWinery(resolvedPlaceId);
                const standardized = standardizeWineryData(googleData, currentExisting || undefined);
                if (standardized) {
                  get().upsertWinery(standardized);
                }
              }
            })
            .catch((err) => console.error('[ensureWineryDetails] Background revalidation failed:', err))
            .finally(() => {
              inFlightRevalidations.delete(resolvedPlaceId);
            });
        };
```

**Replacement / Drop-in Chunk:**
```typescript
        const revalidateInBackground = (targetPlaceId: GooglePlaceId) => {
          let resolvedPlaceId = targetPlaceId;
          if (/^\d+$/.test(targetPlaceId)) {
            const cached = get().getWinery(targetPlaceId);
            if (cached?.id && !/^\d+$/.test(cached.id)) {
              resolvedPlaceId = cached.id;
            } else {
              return;
            }
          }
          if (resolvedPlaceId.startsWith('test-') || resolvedPlaceId.startsWith('mock-') || inFlightRevalidations.has(resolvedPlaceId)) return;
          // @ts-ignore
          const skipDetailsMock = typeof window !== 'undefined' && window._E2E_SKIP_DETAILS_MOCK;
          if (process.env.NEXT_PUBLIC_IS_E2E === 'true' && shouldMockWineries() && !skipDetailsMock) return;

          inFlightRevalidations.add(resolvedPlaceId);
          invokeFunction('get-winery-details', { body: { placeId: resolvedPlaceId } })
            .then(({ data: googleData, error: functionError }) => {
              if (!functionError && googleData) {
                const currentExisting = get().getWinery(resolvedPlaceId);
                const standardized = standardizeWineryData(googleData, currentExisting || undefined);
                if (standardized) {
                  get().upsertWinery(standardized);
                }
              }
            })
            .catch((err) => console.error('[ensureWineryDetails] Background revalidation failed:', err))
            .finally(() => {
              inFlightRevalidations.delete(resolvedPlaceId);
            });
        };
```

#### Anchor: Lines 252–358 (`ensureWineryDetails` On-Demand Enrichment & Error Handling)
**Existing Context (Line 252):**
```typescript
        set({ loadingWineryId: placeId });

        let standardizedDb: Winery | null = null;

        try {
          const supabase = createClient();
          let dbData = null;

          let targetDbId = existing?.dbId;
          if (!targetDbId && placeId) {
            if (/^\d+$/.test(placeId)) {
              targetDbId = Number(placeId) as WineryDbId;
            } else {
              const { data: idRow } = await supabase
                .from('wineries')
                .select('id')
                .eq('google_place_id', placeId)
                .maybeSingle();
              if (idRow?.id) {
                targetDbId = Number(idRow.id) as WineryDbId;
              }
            }
          }

          if (targetDbId) {
            const { data } = await supabase.rpc('get_winery_details_by_id', { p_winery_id: targetDbId });
            if (data && data.length > 0) dbData = data[0];
          }

          if (dbData) {
            const standardized = standardizeWineryData(dbData, existing || undefined);
            if (standardized) {
              standardizedDb = standardized;
              get().upsertWinery(standardized);

              if (Array.isArray(dbData.visits) && dbData.visits.length > 0) {
                try {
                  const { useVisitStore } = await import('./visitStore');
                  useVisitStore.getState().hydrateVisits?.(dbData.visits, dbData);
                } catch {}
              }

              const dbIsEnriched = dbData.enrichment_tier === 'enriched' &&
                dbData.opening_hours &&
                dbData.user_rating_count !== undefined &&
                Array.isArray(dbData.reviews) &&
                dbData.generative_summary &&
                Array.isArray(dbData.vibe_tags) && dbData.vibe_tags.length > 0;
              const dbHasZeroRating = dbData.google_rating === 0;

              if (dbIsEnriched && !dbHasZeroRating) {
                set({ loadingWineryId: null });
                if (isStaleRecord(dbData.last_enriched_at)) {
                  revalidateInBackground(placeId);
                }
                return standardized;
              }
            }
          }

          // Determine effective Google Place ID for enrichment
          let effectivePlaceId: GooglePlaceId | null = null;
          if (!/^\d+$/.test(placeId) && !placeId.startsWith('test-') && !placeId.startsWith('mock-')) {
            effectivePlaceId = placeId;
          } else if (dbData?.google_place_id && !/^\d+$/.test(dbData.google_place_id)) {
            effectivePlaceId = dbData.google_place_id;
          } else if (existing?.id && !/^\d+$/.test(existing.id)) {
            effectivePlaceId = existing.id;
          }

          if (effectivePlaceId) {
            // @ts-ignore
            const skipDetailsMock = typeof window !== 'undefined' && window._E2E_SKIP_DETAILS_MOCK;
            if (process.env.NEXT_PUBLIC_IS_E2E === 'true' && shouldMockWineries() && !skipDetailsMock) {
              set({ loadingWineryId: null });
              return standardizedDb || existing || null;
            }

            try {
              const { data: googleData, error: functionError } = await invokeFunction('get-winery-details', {
                body: { placeId: effectivePlaceId },
              });

              if (!functionError && googleData) {
                const currentExisting = get().getWinery(effectivePlaceId) || get().getWinery(placeId);
                const standardized = standardizeWineryData(googleData, currentExisting || existing || standardizedDb || undefined);
                if (standardized) {
                  get().upsertWinery(standardized);
                  set({ loadingWineryId: null });
                  return standardized;
                }
              } else if (functionError) {
                console.error('[ensureWineryDetails] Edge Function failed:', functionError);
              }
            } catch (invokeErr) {
              console.error('[ensureWineryDetails] Edge Function invocation exception:', invokeErr);
            }
          } else if (dbData && !dbData.google_place_id) {
            console.warn(`[ensureWineryDetails] Winery ${placeId} has no google_place_id; skipping Places enrichment`);
          }
        } catch (error) {
          console.error('Details fetch failed:', error);
        }

        set({ loadingWineryId: null });
        return standardizedDb || existing || null;
```

**Replacement / Drop-in Chunk:**
```typescript
        set({ loadingWineryId: placeId });

        let standardizedDb: Winery | null = null;

        try {
          const supabase = createClient();
          let dbData = null;

          let targetDbId = existing?.dbId;
          if (!targetDbId && placeId) {
            if (/^\d+$/.test(placeId)) {
              targetDbId = Number(placeId) as WineryDbId;
            } else {
              const { data: idRow } = await supabase
                .from('wineries')
                .select('id')
                .eq('google_place_id', placeId)
                .maybeSingle();
              if (idRow?.id) {
                targetDbId = Number(idRow.id) as WineryDbId;
              }
            }
          }

          if (targetDbId) {
            const { data } = await supabase.rpc('get_winery_details_by_id', { p_winery_id: targetDbId });
            if (data && data.length > 0) dbData = data[0];
          }

          if (dbData) {
            const standardized = standardizeWineryData(dbData, existing || undefined);
            if (standardized) {
              standardizedDb = standardized;
              get().upsertWinery(standardized);

              if (Array.isArray(dbData.visits) && dbData.visits.length > 0) {
                try {
                  const { useVisitStore } = await import('./visitStore');
                  useVisitStore.getState().hydrateVisits?.(dbData.visits, dbData);
                } catch {}
              }

              const dbIsEnriched = dbData.enrichment_tier === 'enriched' &&
                dbData.opening_hours &&
                dbData.user_rating_count !== undefined &&
                Array.isArray(dbData.reviews) &&
                dbData.generative_summary &&
                Array.isArray(dbData.vibe_tags) && dbData.vibe_tags.length > 0;
              const dbHasZeroRating = dbData.google_rating === 0;

              if (dbIsEnriched && !dbHasZeroRating) {
                set({ loadingWineryId: null });
                if (isStaleRecord(dbData.last_enriched_at)) {
                  revalidateInBackground(placeId);
                }
                return standardized;
              }
            }
          }

          // Determine effective Google Place ID for enrichment
          let effectivePlaceId: GooglePlaceId | null = null;
          if (!/^\d+$/.test(placeId) && !placeId.startsWith('test-') && !placeId.startsWith('mock-')) {
            effectivePlaceId = placeId;
          } else if (dbData?.google_place_id && !/^\d+$/.test(dbData.google_place_id)) {
            effectivePlaceId = dbData.google_place_id;
          } else if (existing?.id && !/^\d+$/.test(existing.id)) {
            effectivePlaceId = existing.id;
          }

          if (effectivePlaceId) {
            // @ts-ignore
            const skipDetailsMock = typeof window !== 'undefined' && window._E2E_SKIP_DETAILS_MOCK;
            if (process.env.NEXT_PUBLIC_IS_E2E === 'true' && shouldMockWineries() && !skipDetailsMock) {
              set({ loadingWineryId: null });
              return standardizedDb || existing || null;
            }

            try {
              const { data: googleData, error: functionError } = await invokeFunction('get-winery-details', {
                body: { placeId: effectivePlaceId },
              });

              if (!functionError && googleData) {
                const currentExisting = get().getWinery(effectivePlaceId) || get().getWinery(placeId);
                const standardized = standardizeWineryData(googleData, currentExisting || existing || standardizedDb || undefined);
                if (standardized) {
                  get().upsertWinery(standardized);
                  set({ loadingWineryId: null });
                  return standardized;
                }
              } else if (functionError) {
                console.error('[ensureWineryDetails] Edge Function failed:', functionError);
              }
            } catch (invokeErr) {
              console.error('[ensureWineryDetails] Edge Function invocation exception:', invokeErr);
            }
          } else if (dbData && !dbData.google_place_id) {
            console.warn(`[ensureWineryDetails] Winery ${placeId} has no google_place_id; skipping Places enrichment`);
          }
        } catch (error) {
          console.error('Details fetch failed:', error);
        }

        set({ loadingWineryId: null });
        return standardizedDb || existing || null;
```

---

### File 2: Caller Standardization Audit

#### Callers of `openWineryModal` and `ensureWineryDetails`:
1. **[components/visit-history-modal.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/visit-history-modal.tsx)**:
   - Ensure card click handlers provide `visit.wineries?.google_place_id || (visit.wineryId && !/^\d+$/.test(visit.wineryId) ? visit.wineryId : undefined) || String(visit.winery_id)`.
   - Preferring the canonical `google_place_id` bypasses the initial Postgres RPC roundtrip and enriches immediately via Places API if needed.

2. **[components/trip/trip-stop-card.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip/trip-stop-card.tsx)** & **[components/trip/trip-stop-list.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/trip/trip-stop-list.tsx)**:
   - Ensure stops pass `stop.wineries?.google_place_id || stop.winery?.id || (stop.wineryId && !/^\d+$/.test(stop.wineryId) ? stop.wineryId : undefined) || String(stop.winery_id)`.

3. **[components/map/winery-map.tsx](file:///home/byrnesjd4821/Git/finger-lakes-app-57/components/map/winery-map.tsx)**:
   - Ensure pin click events pass `marker.google_place_id || marker.id` as the primary identifier.

---

## 3. Empirical Verification Plan

Run the automated Jest test suite via the Podman container runner (`BypassSandbox: true` required on RHEL 8):

```bash
./scripts/run-jest-container.sh lib/stores/__tests__/wineryStore.test.ts
```

### Assertions to Validate:
- `resolves google_place_id and invokes Edge Function get-winery-details when ensureWineryDetails('2988') receives DB data without opening_hours` -> **PASS**
- `returns standardized dbData with openingHours: null, logs warning, and clears loadingWineryId when google_place_id is missing from dbData` -> **PASS**
- `returns standardized dbData with openingHours: null, clears loadingWineryId, and does not throw when Edge Function returns an error` -> **PASS**
- `handles Edge Function promise rejection gracefully without stalling loadingWineryId` -> **PASS**
- `maintains loadingWineryId as '2988' while on-demand enrichment is pending and clears it upon completion` -> **PASS**
- `resolves google_place_id and triggers background revalidation when ensureWineryDetails is called with a numeric ID for a stale cached winery` -> **PASS**
- `cleans up inFlightRevalidations when background revalidation fails so subsequent requests are not stalled` -> **PASS**

### Regression Verification:
Run the component unit tests to confirm zero regressions in layout decoupling or tri-state badges:
```bash
./scripts/run-jest-container.sh components/winery/__tests__/
```

---

## 4. Conductor Track Progress Update
Upon successful verification, update [conductor/tracks/winery-hours-resilience_20260930/plan.md](file:///home/byrnesjd4821/Git/finger-lakes-app-57/conductor/tracks/winery-hours-resilience_20260930/plan.md):
- Mark `[x] Task: Implement numeric ID on-demand enrichment in wineryStore (<commit_hash>)`
- Commit code changes with message: `feat(wineryStore): implement numeric ID on-demand enrichment and revalidation hardening`
- Proceed to Phase 2 User Manual Verification milestone.
