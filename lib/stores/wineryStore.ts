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
      // Parallel fetch: Lightweight markers + User Visits history
      const [markersResult, visitsResult] = await Promise.all([
        supabase.rpc('get_map_markers'),
        supabase.rpc('get_all_user_visits_list')
      ]);

      if (markersResult.error) throw markersResult.error;
      if (visitsResult.error) throw visitsResult.error;

      const markers = markersResult.data || [];
      const visits = visitsResult.data || [];

      // Group visits by winery_id (dbId)
      const visitsByWineryId = new Map();
      visits.forEach((v: any) => {
        const wId = v.winery_id;
        if (!visitsByWineryId.has(wId)) visitsByWineryId.set(wId, []);
        visitsByWineryId.get(wId).push({
            id: v.id,
            visit_date: v.visit_date,
            rating: v.rating,
            user_review: v.user_review,
            photos: v.photos
        });
      });

      const detailedWineries: Winery[] = markers.map((w: any) => {
        const dbId = w.id; 
        // markers returns 'id' as dbId, and 'google_place_id'
        const googleId = w.google_place_id || String(dbId);
        const visitsForThisWinery = visitsByWineryId.get(dbId) || [];

        // Note: We intentionally omit heavy details (reviews, opening hours) here.
        // They will be lazy-loaded via ensureWineryDetails.
        return {
            id: googleId,
            dbId: dbId,
            name: w.name,
            address: w.address,
            lat: typeof w.lat === 'string' ? parseFloat(w.lat) : (w.lat || 0),
            lng: typeof w.lng === 'string' ? parseFloat(w.lng) : (w.lng || 0),
            isFavorite: w.is_favorite,
            onWishlist: w.on_wishlist,
            userVisited: w.user_visited,
            visits: visitsForThisWinery,
            // Initialize optional fields as undefined to indicate "not loaded"
            phone: undefined,
            website: undefined,
            rating: undefined, // Google rating
            openingHours: undefined,
            reviews: undefined,
            reservable: undefined
        };
      });

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
    
    // Check if we have meaningful details. 
    // Note: Some wineries might legitimately not have a website or opening hours, 
    // so checking for undefined is better than truthy check if we want to be precise.
    // But for now, let's assume if `openingHours` is undefined, we haven't loaded details.
    if (existing && existing.openingHours !== undefined) {
      return existing;
    }

    const supabase = createClient();
    let dbData = null;

    // 1. Try fetching full details from OUR DB first (using dbId if available)
    if (existing?.dbId) {
        const { data, error } = await supabase.rpc('get_winery_details_by_id', { winery_id_param: existing.dbId });
        if (!error && data && data.length > 0) {
            dbData = data[0];
        }
    } 
    // If we don't have a DB ID yet (rare if coming from map markers), we might skip this
    // or we'd need a google_place_id lookup RPC if we added one. 
    // But get_map_markers guarantees we have a dbId for everything on the map.

    if (dbData && dbData.opening_hours) {
        // We have good data from DB
        // Transform DB data to Winery type
         const standardized: Winery = {
            ...existing!,
            id: dbData.google_place_id || String(dbData.id),
            dbId: dbData.id,
            name: dbData.name,
            address: dbData.address,
            lat: Number(dbData.lat),
            lng: Number(dbData.lng),
            phone: dbData.phone,
            website: dbData.website,
            rating: dbData.google_rating,
            openingHours: dbData.opening_hours,
            reviews: dbData.reviews,
            reservable: dbData.reservable,
            // User state
            isFavorite: dbData.is_favorite,
            onWishlist: dbData.on_wishlist,
            userVisited: dbData.user_visited,
            visits: dbData.visits || existing?.visits || [], // Prefer DB visits but fallback
            trip_id: dbData.trip_info?.[0]?.trip_id,
            trip_name: dbData.trip_info?.[0]?.trip_name,
            trip_date: dbData.trip_info?.[0]?.trip_date,
        };

        set(state => ({
             persistentWineries: state.persistentWineries.map(w => 
                 w.id === placeId ? { ...w, ...standardized } : w
             )
        }));
        return standardized;
    }

    // 2. If DB data is missing or incomplete (no opening_hours), fetch from Google API
    // Only if it looks like a Google Place ID (alphanumeric)
    if (!/^\d+$/.test(placeId)) {
        try {
            const response = await fetch('/api/wineries/details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ placeId }),
            });

            if (!response.ok) throw new Error("API call failed");
            
            const detailedWineryData = await response.json();
            const standardized = standardizeWineryData(detailedWineryData, existing);

            if (standardized) {
                set(state => ({
                    persistentWineries: state.persistentWineries.map(w => 
                        w.id === placeId ? { ...w, ...standardized } : w
                    )
                }));
                return standardized;
            }
        } catch (err) {
            console.error(`Failed to fetch Google details for ${placeId}`, err);
        }
    }

    return existing || null;
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