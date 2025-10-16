import { createWithEqualityFn } from 'zustand/traditional';
import { Winery, Visit, Trip } from '@/lib/types';

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
  fetchAllWineries: () => Promise<void>;
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
    try {
      const [visitsRes, favoritesRes, wishlistRes, tripsRes] = await Promise.all([
        fetch("/api/visits"),
        fetch("/api/favorites"),
        fetch("/api/wishlist"),
        fetch("/api/trips?type=upcoming&full=true"),
      ]);

      const [visitsData, favoritesData, wishlistData, tripsData] = await Promise.all([
        visitsRes.json(),
        favoritesRes.json(),
        wishlistRes.json(),
        tripsRes.json(),
      ]);

      const { visits } = visitsData;
      const favorites = favoritesData.favorites || favoritesData;
      const wishlist = wishlistData.wishlist || wishlistData;
      const upcomingTrips = tripsData.trips || [];

      const wineriesMap = new Map<string, Winery>();

      const processWinery = (rawWinery: RawWinery, updates: Partial<Winery>) => {
        const googleId = String(rawWinery.google_place_id || rawWinery.id);
        if (!googleId) return;

        const existing = wineriesMap.get(googleId);
        const standardized = standardizeWineryData(rawWinery, existing);
        if (!standardized) return;

        const merged = { ...standardized, ...updates };
        wineriesMap.set(googleId, merged);
        return merged;
      };

      visits.forEach((rawVisit: Visit) => {
        if (!rawVisit.wineries) return;
        const winery = processWinery(rawVisit.wineries as unknown as RawWinery, { userVisited: true });
        if (winery) {
          winery.visits ??= [];
          winery.visits = [...(winery.visits || []), rawVisit];
        }
      });

      favorites.forEach((rawFavorite: { wineries: RawWinery }) => {
        const wineryData = rawFavorite.wineries || rawFavorite;
        processWinery(wineryData, { isFavorite: true });
      });

      wishlist.forEach((rawWishlist: { wineries: RawWinery }) => {
        const wineryData = rawWishlist.wineries || rawWishlist;
        processWinery(wineryData, { onWishlist: true });
      });

      upcomingTrips.forEach((trip: Trip) => {
        if (trip.wineries) {
          trip.wineries.forEach((wineryOnTrip: Winery) => {
            const googleId = String(wineryOnTrip.id);
            if (!googleId) return;

            // Ensure the winery is in the map
            processWinery(wineryOnTrip as unknown as RawWinery, {});

            // Enrich the winery in the map with trip details
            const wineryInMap = wineriesMap.get(googleId);
            if (wineryInMap) {
              // Avoid overwriting if it's already associated with a trip from another source
              // The first trip found wins, which is consistent with old logic.
              if (!wineryInMap.trip_id) {
                wineriesMap.set(googleId, {
                  ...wineryInMap,
                  trip_id: trip.id,
                  trip_name: trip.name || "Unnamed Trip",
                  trip_date: trip.trip_date,
                });
              }
            }
          });
        }
      });

      const initialWineries = Array.from(wineriesMap.values());

      const detailedWineries = await Promise.all(
        initialWineries.map(async (winery) => {
          if (winery.id && (!winery.phone || !winery.website || !winery.rating)) {
            const details = await get().ensureWineryDetails(winery.id);
            return details ? { ...winery, ...details } : winery;
          }
          return winery;
        })
      );

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

  fetchAllWineries: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch("/api/wineries");
      if (!response.ok) {
        throw new Error('Failed to fetch all wineries');
      }
      const allWineriesData = await response.json();
      const allWineries = Array.isArray(allWineriesData) ? allWineriesData : allWineriesData.wineries || [];

      const { persistentWineries } = get();
      const persistentWineriesMap = new Map(persistentWineries.map(w => [w.id, w]));

      allWineries.forEach((rawWinery: RawWinery) => {
        const existing = persistentWineriesMap.get(String(rawWinery.google_place_id || rawWinery.id));
        const standardized = standardizeWineryData(rawWinery, existing);
        if (standardized) {
          persistentWineriesMap.set(standardized.id, { ...existing, ...standardized });
        }
      });

      const mergedWineries = Array.from(persistentWineriesMap.values());

      set({
        persistentWineries: mergedWineries,
        isLoading: false,
      });

    } catch (error) {
      console.error("Failed to fetch all wineries:", error);
      set({ error: "Failed to load all wineries.", isLoading: false });
    }
  },

  ensureWineryDetails: async (placeId: string) => {
    const existing = get().persistentWineries.find(w => w.id === placeId);
    if (existing && existing.phone && existing.website && existing.rating && existing.openingHours !== undefined && existing.reviews !== undefined && existing.reservable !== undefined) {
      return existing;
    }

    try {
      const response = await fetch('/api/wineries/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId }),
      });

      if (!response.ok) throw new Error('Failed to fetch details');
      
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
    console.log('[wineryStore] Adding visit to winery:', wineryId, newVisit);
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
    const originalWineries = get().persistentWineries;
    const updatedWineries = originalWineries.map(w =>
      w.id === winery.id ? { ...w, isFavorite: !isFavorite } : w
    );
    set({ persistentWineries: updatedWineries, favoriteWineries: updatedWineries.filter(w => w.isFavorite) });

    try {
      await get().ensureWineryDetails(winery.id);
      const dbId = get().persistentWineries.find(w => w.id === winery.id)?.dbId;

      const method = isFavorite ? 'DELETE' : 'POST';
      const body = isFavorite ? JSON.stringify({ dbId }) : JSON.stringify({ wineryData: { ...winery, isFavorite: !isFavorite } });
      const response = await fetch('/api/favorites', { method, headers: { 'Content-Type': 'application/json' }, body });
      
      if (!response.ok) throw new Error("Could not update favorites.");

      // Optional: Re-fetch in the background to ensure full consistency
      get().fetchWineryData();

    } catch (error) {
      set({ persistentWineries: originalWineries, favoriteWineries: originalWineries.filter(w => w.isFavorite) }); // Revert on error
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