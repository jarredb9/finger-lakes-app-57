import { createWithEqualityFn } from 'zustand/traditional';
import { Winery, Visit } from '@/lib/types';
import { toggleFavorite } from '@/app/actions';
import { createClient } from '@/utils/supabase/client';

// This represents the raw data structure of a winery coming from the database/API
interface RawWinery {
  id: number;
  google_place_id: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  phone?: string;
  website?: string;
  google_rating?: number;
  opening_hours?: any; // From Google Places Details API
  reviews?: any; // From Google Places Details API
  reservable?: boolean; // From Google Places Details API
  visits?: Visit[];
  wineries?: RawWinery[]; // In case of nested winery data
}

// Moved standardizeWineryData outside of the create call to be reusable
const standardizeWineryData = (rawWinery: RawWinery, existingWinery?: Winery): Winery | null => {
  if (!rawWinery) return null;

  const id = String(rawWinery.google_place_id || rawWinery.id);
  const dbId = rawWinery.google_place_id ? rawWinery.id : (existingWinery?.dbId);

  const lat = rawWinery.latitude;
  const lng = rawWinery.longitude;

  const standardized: Winery = {
      id,
      dbId,
      name: rawWinery.name,
      address: rawWinery.address,
      lat: typeof lat === 'string' ? parseFloat(lat) : (lat || 0),
      lng: typeof lng === 'string' ? parseFloat(lng) : (lng || 0),
      phone: rawWinery.phone ?? existingWinery?.phone,
      website: rawWinery.website ?? existingWinery?.website,
      rating: rawWinery.google_rating ?? (rawWinery as unknown as Winery).rating ?? existingWinery?.rating,
      userVisited: existingWinery?.userVisited || false,
      openingHours: rawWinery.opening_hours ?? existingWinery?.openingHours,
      reviews: rawWinery.reviews ?? existingWinery?.reviews,
      reservable: rawWinery.reservable ?? existingWinery?.reservable,
      onWishlist: existingWinery?.onWishlist || false,
      isFavorite: existingWinery?.isFavorite || false,
      visits: existingWinery?.visits || rawWinery.visits || [],
      trip_id: existingWinery?.trip_id,
      trip_name: existingWinery?.trip_name,
      trip_date: existingWinery?.trip_date,
  };

  if (!standardized.id || !standardized.name || typeof standardized.lat !== 'number' || isNaN(standardized.lat) || typeof standardized.lng !== 'number' || isNaN(standardized.lng)) {
      console.warn('[Validation] Invalid winery data after standardization:', { rawWinery, standardized });
      return null;
  }
  return standardized;
};

interface WineryState {
  wineries: Winery[];
  visitedWineries: Winery[];
  wishlistWineries: Winery[];
  favoriteWineries: Winery[];
  persistentWineries: Winery[];
  isLoading: boolean;
  isTogglingWishlist: boolean;
  isTogglingFavorite: boolean;
  error: string | null;
  _wineriesBackup: Winery[] | null;

  fetchWineryData: () => Promise<void>;
  ensureWineryDetails: (placeId: string) => Promise<Winery | null>;
  toggleWishlist: (winery: Winery, isOnWishlist: boolean) => Promise<void>;
  toggleFavorite: (winery: Winery, isFavorite: boolean) => Promise<void>;
  getWineryById: (id: string) => Winery | undefined;
  ensureWineryInDb: (winery: Winery) => Promise<number | null>;
  updateWinery: (wineryId: string, updates: Partial<Winery>) => void;

  // Methods for visitStore to interact with
  addVisitToWinery: (wineryId: string, visit: Visit) => void;
  optimisticallyUpdateVisit: (visitId: string, visitData: Partial<Visit>) => void;
  optimisticallyDeleteVisit: (visitId: string) => void;
  revertOptimisticUpdate: () => void;
  confirmOptimisticUpdate: (updatedVisit?: Visit) => void;
}

export const useWineryStore = createWithEqualityFn<WineryState>((set, get) => ({
  wineries: [],
  visitedWineries: [],
  wishlistWineries: [],
  favoriteWineries: [],
  persistentWineries: [],
  isLoading: false,
  isTogglingWishlist: false,
  isTogglingFavorite: false,
  error: null,
  _wineriesBackup: null,

  fetchWineryData: async () => {
    set({ isLoading: true, error: null });
    const supabase = createClient();
    try {
      const { data: aggregatedData, error: rpcError } = await supabase.rpc('get_user_winery_data_aggregated');

      if (rpcError) {
        console.error("Failed to fetch winery data:", rpcError);
        throw new Error(rpcError.message || "Failed to fetch winery data.");
      }

      // The RPC returns a single object { wineries_data: [...] } or strictly the array if defined as TABLE(jsonb)
      // Let's inspect the type. Defined as RETURNS TABLE (wineries_data jsonb). 
      // So data will be [{ wineries_data: [...] }] or just the array if it unrolled.
      // Actually, with RETURNS TABLE, Supabase client usually returns an array of objects.
      // Since the RPC logic aggregates everything into one JSON array inside a single row/column,
      // it likely returns `[{ wineries_data: [...] }]`.
      
      // Wait, let's check the RPC definition again.
      // RETURNS TABLE (wineries_data jsonb)
      // The query does `SELECT COALESCE(jsonb_agg(...))` which returns ONE row with ONE column `wineries_data`.
      
      const wineriesArray = (aggregatedData && aggregatedData[0]?.wineries_data) || [];

      const detailedWineries: Winery[] = wineriesArray.map((w: any) => ({
        id: w.id || String(w.dbId),
        dbId: w.dbId,
        name: w.name,
        address: w.address,
        lat: typeof w.lat === 'string' ? parseFloat(w.lat) : (w.lat || 0),
        lng: typeof w.lng === 'string' ? parseFloat(w.lng) : (w.lng || 0),
        phone: w.phone,
        website: w.website,
        rating: w.rating,
        isFavorite: w.isFavorite,
        onWishlist: w.onWishlist,
        userVisited: w.userVisited,
        visits: w.visits,
        // Map trip info if available (taking the first one as primary)
        trip_id: w.tripInfo?.[0]?.trip_id,
        trip_name: w.tripInfo?.[0]?.trip_name,
        trip_date: w.tripInfo?.[0]?.trip_date,
        // We can store the full trip info if needed, but for now stick to existing types
      }));

      set({
        persistentWineries: detailedWineries,
        visitedWineries: detailedWineries.filter(w => w.userVisited),
        favoriteWineries: detailedWineries.filter(w => w.isFavorite),
        wishlistWineries: detailedWineries.filter(w => w.onWishlist),
        isLoading: false,
      });

    } catch (error) {
      console.error("Failed to fetch winery data:", error);
      set({ error: "Failed to load winery data.", isLoading: false });
    }
  },

  ensureWineryDetails: async (placeId: string) => {
    const existing = get().persistentWineries.find(w => w.id === placeId);
    if (existing && existing.phone && existing.website && existing.rating && existing.openingHours !== undefined && existing.reviews !== undefined && existing.reservable !== undefined) {
      return existing;
    }

    // Check if placeId is likely a Database ID (integer) instead of a Google Place ID.
    // Google Place IDs are alphanumeric and longer. DB IDs are just numbers here.
    if (/^\d+$/.test(placeId)) {
        // console.warn(`[ensureWineryDetails] Skipped Google API fetch for winery ${placeId} because it appears to be a Database ID.`);
        return existing || null;
    }

    try {
      const response = await fetch('/api/wineries/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[ensureWineryDetails] API Error:', errorData);
        throw new Error(`Failed to fetch details: ${response.status} ${response.statusText}`);
      }
      
      const detailedWineryData = await response.json();
      const standardized = standardizeWineryData(detailedWineryData, existing);

      if (standardized) {
        set(state => {
          const index = state.persistentWineries.findIndex(w => w.id === placeId);
          if (index !== -1) {
            const updatedWineries = [...state.persistentWineries];
            updatedWineries[index] = { ...updatedWineries[index], ...standardized };
            return { persistentWineries: updatedWineries };
          } else {
            return { persistentWineries: [...state.persistentWineries, standardized] };
          }
        });
        return standardized;
      }
      return null;
    } catch (error) {
      console.error(`Failed to ensure details for winery ${placeId}:`, error);
      return null;
    }
  },

  addVisitToWinery: (wineryId, newVisit) => {
    set(state => {
      const updatedWineries = state.persistentWineries.map(w => {
        if (w.id === wineryId) {
          return {
            ...w,
            userVisited: true,
            visits: [newVisit, ...(w.visits || [])]
          };
        }
        return w;
      });
      return { 
        persistentWineries: updatedWineries,
        visitedWineries: updatedWineries.filter(w => w.userVisited)
      };
    });
  },

  optimisticallyUpdateVisit: (visitId, visitData) => {
    set(state => {
      if (state._wineriesBackup) return {}; // Prevent multiple optimistic updates

      const updatedWineries = state.persistentWineries.map(winery => {
          const visitIndex = winery.visits?.findIndex(v => v.id === visitId) ?? -1;
          if (visitIndex === -1) return winery;

          const updatedVisits = [...winery.visits!];
          const originalVisit = updatedVisits[visitIndex];
          updatedVisits[visitIndex] = { ...originalVisit, ...visitData };

          return { ...winery, visits: updatedVisits };
      });

      return {
          persistentWineries: updatedWineries,
          _wineriesBackup: state.persistentWineries
      };
    });
  },

  optimisticallyDeleteVisit: (visitId) => {
    set(state => {
      if (state._wineriesBackup) return {}; // Prevent multiple optimistic updates

      const updatedWineries = state.persistentWineries.map(winery => {
        // Add a guard clause to handle cases where winery.visits is undefined.
        if (!winery.visits) {
          return winery;
        }
        const visitIndex = winery.visits.findIndex(v => v.id === visitId);
        if (visitIndex === -1) {
          return winery;
        }
        const newVisits = winery.visits.filter(v => v.id !== visitId);
        return { ...winery, visits: newVisits };
      });

      return {
        persistentWineries: updatedWineries,
        _wineriesBackup: state.persistentWineries
      };
    });
  },

  revertOptimisticUpdate: () => {
    set(state => {
      if (!state._wineriesBackup) return {};
      return {
        persistentWineries: state._wineriesBackup,
        _wineriesBackup: null
      };
    });
  },

  confirmOptimisticUpdate: (updatedVisit) => {
    set(state => {
      if (updatedVisit) {
        const finalWineries = state.persistentWineries.map(winery => {
            const visitIndex = winery.visits?.findIndex(v => v.id === updatedVisit.id) ?? -1;
            if (visitIndex === -1) return winery;

            const finalVisits = [...winery.visits!];
            finalVisits[visitIndex] = { ...finalVisits[visitIndex], ...updatedVisit };
            return { ...winery, visits: finalVisits };
        });
        return { 
          persistentWineries: finalWineries,
          _wineriesBackup: null 
        };
      }
      return { _wineriesBackup: null };
    });
  },

  toggleWishlist: async (winery, isOnWishlist) => {
    set({ isTogglingWishlist: true });
    const originalWineries = get().persistentWineries;
    const updatedWineries = originalWineries.map(w =>
      w.id === winery.id ? { ...w, onWishlist: !isOnWishlist } : w
    );
    set({ persistentWineries: updatedWineries, wishlistWineries: updatedWineries.filter(w => w.onWishlist) });

    try {
      await get().ensureWineryDetails(winery.id);
      const dbId = get().persistentWineries.find(w => w.id === winery.id)?.dbId;

      const method = isOnWishlist ? 'DELETE' : 'POST';
      const body = isOnWishlist ? JSON.stringify({ dbId }) : JSON.stringify({ wineryData: { ...winery, onWishlist: !isOnWishlist } });
      const response = await fetch('/api/wishlist', { method, headers: { 'Content-Type': 'application/json' }, body });

      if (!response.ok) throw new Error("Could not update wishlist.");
      
      // Optional: Re-fetch in the background to ensure full consistency
      get().fetchWineryData(); 

    } catch (error) {
      set({ persistentWineries: originalWineries, wishlistWineries: originalWineries.filter(w => w.onWishlist) }); // Revert on error
      throw error;
    } finally {
      set({ isTogglingWishlist: false });
    }
  },

  toggleFavorite: async (winery, isFavorite) => {
    set({ isTogglingFavorite: true });
    // Optimistic update
    const originalWineries = get().persistentWineries;
    const updatedWineries = originalWineries.map(w =>
      w.id === winery.id ? { ...w, isFavorite: !isFavorite } : w
    );
    set({ persistentWineries: updatedWineries, favoriteWineries: updatedWineries.filter(w => w.isFavorite) });

    try {
      const result = await toggleFavorite(winery); // Call the Server Action
      
      if (!result.success) {
        throw new Error(result.error || "Could not update favorites.");
      }

      // Re-fetch in the background to ensure full consistency after server action
      get().fetchWineryData();

    } catch (error) {
      console.error("Failed to toggle favorite:", error);
      set({ 
        persistentWineries: originalWineries, 
        favoriteWineries: originalWineries.filter(w => w.isFavorite),
        error: "Failed to update favorites."
      }); // Revert optimistic update on error
      throw error;
    } finally {
      set({ isTogglingFavorite: false });
    }
  },

  getWineryById: (id: string) => {
    return get().persistentWineries.find(w => w.id === id);
  },
  
  updateWinery: (wineryId: string, updates: Partial<Winery>) => {
    set(state => ({
      persistentWineries: state.persistentWineries.map(w => 
        w.id === wineryId ? { ...w, ...updates } : w
      )
    }));
  },

  ensureWineryInDb: async (winery: Winery) => {
    if (winery.dbId) {
      return winery.dbId;
    }
    const existing = get().persistentWineries.find(w => w.id === winery.id);
    if (existing?.dbId) {
      return existing.dbId;
    }

    try {
      const response = await fetch('/api/wineries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(winery),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to ensure winery in DB. Server response:', errorText);
        throw new Error('Failed to ensure winery in DB');
      }

      const { dbId } = await response.json();

      if (dbId) {
        set(state => {
          const updateWinery = (w: Winery) => w.id === winery.id ? { ...w, dbId } : w;
          
          const persistentWineries = state.persistentWineries.map(updateWinery);
          const isNew = !state.persistentWineries.some(w => w.id === winery.id);

          return { 
            persistentWineries: isNew ? [...persistentWineries, { ...winery, dbId }] : persistentWineries,
            visitedWineries: state.visitedWineries.map(updateWinery),
            favoriteWineries: state.favoriteWineries.map(updateWinery),
            wishlistWineries: state.wishlistWineries.map(updateWinery),
          };
        });
      }
      return dbId;
    } catch (error) {
      console.error(`Failed to ensure winery in DB for ${winery.name}:`, error);
      return null;
    }
  },
}));

// Helper function to find a winery by its database ID
export const findWineryByDbId = (dbId: number) => {
  const state = useWineryStore.getState();
  return state.persistentWineries.find(w => w.dbId === dbId);
};