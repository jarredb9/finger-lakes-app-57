import { VisitWithWinery, GooglePlaceId, WineryDbId } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import type { StoreApi } from 'zustand';
import type { VisitState } from '../visitStore';

type GetVisitState = StoreApi<VisitState>['getState'];
type SetVisitState = StoreApi<VisitState>['setState'];

export const VISITS_PER_PAGE = 10;

export function getVisitsByWineryHelper(
  get: GetVisitState,
  wineryIdentifier: number | string
): VisitWithWinery[] {
  const numericId = typeof wineryIdentifier === 'number' 
    ? wineryIdentifier 
    : (!isNaN(Number(wineryIdentifier)) && /^\d+$/.test(String(wineryIdentifier).trim()) ? Number(wineryIdentifier) : null);
  const stringId = String(wineryIdentifier);
  return get().visits.filter((v) =>
    (numericId !== null && (Number(v.winery_id) === numericId || Number(v.wineries?.id) === numericId)) ||
    v.wineryId === stringId ||
    v.wineries?.google_place_id === stringId
  ).sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
}

export function hydrateVisitsHelper(
  set: SetVisitState,
  rawVisits: any[],
  wineryMeta?: any
): void {
  if (!Array.isArray(rawVisits) || rawVisits.length === 0) {
    return;
  }
  set((state) => {
    const existingIds = new Set(state.visits.map((v) => String(v.id)));
    const newNormalized: VisitWithWinery[] = [];
    for (const raw of rawVisits) {
      const rawId = raw.id ?? raw.visit_id;
      const normalizedId = typeof rawId === 'number' ? rawId : (!isNaN(Number(rawId)) ? Number(rawId) : rawId);
      if (existingIds.has(String(normalizedId))) {
        continue;
      }

      const wineryDbId = Number(raw.winery_id ?? wineryMeta?.id ?? 0) as WineryDbId;
      const googlePlaceId = (raw.google_place_id ?? raw.wineryId ?? wineryMeta?.google_place_id ?? wineryMeta?.id) as GooglePlaceId;

      newNormalized.push({
        id: normalizedId,
        user_id: raw.user_id,
        visit_date: raw.visit_date,
        user_review: raw.user_review || '',
        rating: raw.rating || 5,
        photos: raw.photos || [],
        is_private: raw.is_private || false,
        winery_id: wineryDbId,
        wineryName: raw.winery_name ?? wineryMeta?.name ?? '',
        wineryId: googlePlaceId,
        syncStatus: 'synced',
        wineries: {
          id: wineryDbId,
          google_place_id: googlePlaceId,
          name: raw.winery_name ?? wineryMeta?.name ?? '',
          address: raw.winery_address ?? wineryMeta?.address ?? '',
          latitude: Number(raw.latitude ?? wineryMeta?.latitude ?? 0),
          longitude: Number(raw.longitude ?? wineryMeta?.longitude ?? 0),
        },
      });
      existingIds.add(String(normalizedId));
    }

    if (newNormalized.length === 0) {
      return state;
    }
    return { visits: [...newNormalized, ...state.visits] };
  });
}

export async function fetchVisitsForWineryHelper(
  get: GetVisitState,
  wineryIdentifier: number | string
): Promise<VisitWithWinery[]> {
  const inMemory = get().getVisitsByWinery(wineryIdentifier);
  if (inMemory.length > 0) {
    return inMemory;
  }

  try {
    const supabase = createClient();
    let targetDbId: number | null = typeof wineryIdentifier === 'number'
      ? wineryIdentifier
      : (!isNaN(Number(wineryIdentifier)) && /^\d+$/.test(String(wineryIdentifier).trim()) ? Number(wineryIdentifier) : null);

    if (!targetDbId) {
      const { data: wineryRow } = await supabase
        .from('wineries')
        .select('id')
        .eq('google_place_id', String(wineryIdentifier))
        .maybeSingle();
      if (wineryRow?.id) {
        targetDbId = Number(wineryRow.id);
      }
    }

    if (!targetDbId) {
      return [];
    }

    const { data, error } = await supabase.rpc('get_winery_details_by_id', { p_winery_id: targetDbId });
    if (!error && data && data.length > 0) {
      const dbWinery = data[0];
      if (Array.isArray(dbWinery.visits) && dbWinery.visits.length > 0) {
        get().hydrateVisits(dbWinery.visits, dbWinery);
      }
    }
  } catch (err) {
    console.error('[visitStore] fetchVisitsForWinery failed:', err);
  }

  return get().getVisitsByWinery(wineryIdentifier);
}

export async function fetchVisitsHelper(
  set: SetVisitState,
  pageNumber = 1,
  refresh = false
): Promise<void> {
  set({ isLoading: true, error: null });
  const supabase = createClient();
  try {
    const { data, error, count } = await supabase.rpc('get_paginated_visits_with_winery_and_friends', {
      p_page_number: pageNumber,
      p_page_size: VISITS_PER_PAGE
    });

    if (error) throw error;

    const fetchedVisits: VisitWithWinery[] = (data || []).map((v: any) => ({
      id: typeof v.visit_id === 'number' ? v.visit_id : (!isNaN(Number(v.visit_id)) ? Number(v.visit_id) : v.visit_id),
      user_id: v.user_id,
      visit_date: v.visit_date,
      user_review: v.user_review,
      rating: v.rating,
      photos: v.photos,
      winery_id: Number(v.winery_id) as WineryDbId,
      wineryName: v.winery_name,
      wineryId: v.google_place_id as GooglePlaceId,
      friend_visits: v.friend_visits,
      syncStatus: 'synced',
      wineries: {
        id: Number(v.winery_id) as WineryDbId,
        google_place_id: v.google_place_id as GooglePlaceId,
        name: v.winery_name,
        address: v.winery_address,
        latitude: Number(v.latitude),
        longitude: Number(v.longitude),
      }
    }));

    set(state => ({
      visits: refresh || pageNumber === 1 ? fetchedVisits : [...state.visits, ...fetchedVisits],
      page: pageNumber,
      totalPages: Math.ceil((count || 0) / VISITS_PER_PAGE),
      hasMore: fetchedVisits.length === VISITS_PER_PAGE,
      isLoading: false,
      error: null
    }));

  } catch (error: any) {
    console.error("Failed to fetch visits:", error);
    set({ isLoading: false, error: error.message || "Failed to fetch visits" });
  }
}
