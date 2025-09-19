import { create } from 'zustand';
import { Winery, Visit } from '@/lib/types';

// Moved standardizeWineryData outside of the create call to be reusable
const standardizeWineryData = (rawWinery: any, existingWinery?: Winery): Winery | null => {
  if (!rawWinery) return null;

  const id = String(rawWinery.google_place_id || rawWinery.id);
  const dbId = rawWinery.google_place_id ? rawWinery.id : (rawWinery.dbId || existingWinery?.dbId);

  const lat = rawWinery.latitude ?? rawWinery.lat;
  const lng = rawWinery.longitude ?? rawWinery.lng;

  const standardized: Winery = {
      id,
      dbId,
      name: rawWinery.name,
      address: rawWinery.address,
      lat: typeof lat === 'string' ? parseFloat(lat) : (lat || 0),
      lng: typeof lng === 'string' ? parseFloat(lng) : (lng || 0),
      phone: rawWinery.phone ?? existingWinery?.phone,
      website: rawWinery.website ?? existingWinery?.website,
      rating: rawWinery.google_rating ?? rawWinery.rating ?? existingWinery?.rating,
      userVisited: existingWinery?.userVisited || rawWinery.userVisited || false,
      onWishlist: existingWinery?.onWishlist || rawWinery.onWishlist || false,
      isFavorite: existingWinery?.isFavorite || rawWinery.isFavorite || false,
      visits: existingWinery?.visits || rawWinery.visits || [],
      trip_id: rawWinery.trip_id ?? existingWinery?.trip_id,
      trip_name: rawWinery.trip_name ?? existingWinery?.trip_name,
      trip_date: rawWinery.trip_date ?? existingWinery?.trip_date,
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
  error: string | null;
  fetchWineryData: () => Promise<void>;
  ensureWineryDetails: (placeId: string) => Promise<Winery | null>;
  saveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: string[] }) => Promise<void>;
  updateVisit: (visitId: string, visitData: { visit_date: string; user_review: string; rating: number; }) => Promise<void>;
  deleteVisit: (visitId: string) => Promise<void>;
  toggleWishlist: (winery: Winery, isOnWishlist: boolean) => Promise<void>;
  toggleFavorite: (winery: Winery, isFavorite: boolean) => Promise<void>;
}

export const useWineryStore = create<WineryState>((set, get) => ({
  wineries: [],
  visitedWineries: [],
  wishlistWineries: [],
  favoriteWineries: [],
  persistentWineries: [],
  isLoading: false,
  error: null,

  fetchWineryData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [visitsRes, favoritesRes, wishlistRes] = await Promise.all([
        fetch("/api/visits"),
        fetch("/api/favorites"),
        fetch("/api/wishlist"),
      ]);

      const [visitsData, favoritesData, wishlistData] = await Promise.all([
        visitsRes.json(),
        favoritesRes.json(),
        wishlistRes.json(),
      ]);

      const { visits } = visitsData;
      const favorites = favoritesData.favorites || favoritesData;
      const wishlist = wishlistData.wishlist || wishlistData;

      const wineriesMap = new Map<string, Winery>();

      const processWinery = (rawWinery: any, updates: Partial<Winery>) => {
        const googleId = String(rawWinery.google_place_id || rawWinery.id);
        if (!googleId) return;

        const existing = wineriesMap.get(googleId);
        const standardized = standardizeWineryData(rawWinery, existing);
        if (!standardized) return;

        const merged = { ...standardized, ...updates };
        wineriesMap.set(googleId, merged);
        return merged;
      };

      visits.forEach((rawVisit: any) => {
        if (!rawVisit.wineries) return;
        const winery = processWinery(rawVisit.wineries, { userVisited: true });
        if (winery) {
          winery.visits = [...(winery.visits || []), rawVisit];
        }
      });

      favorites.forEach((rawFavorite: any) => {
        const wineryData = rawFavorite.wineries || rawFavorite;
        processWinery(wineryData, { isFavorite: true });
      });

      wishlist.forEach((rawWishlist: any) => {
        const wineryData = rawWishlist.wineries || rawWishlist;
        processWinery(wineryData, { onWishlist: true });
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

  ensureWineryDetails: async (placeId: string) => {
    const existing = get().persistentWineries.find(w => w.id === placeId);
    if (existing && existing.phone && existing.website && existing.rating) {
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

  saveVisit: async (winery, visitData) => {
    const payload = { wineryData: winery, ...visitData };
    const response = await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to save visit: ${errorData.details || errorData.error}`);
    }
    await get().fetchWineryData();
  },

  updateVisit: async (visitId, visitData) => {
    const response = await fetch(`/api/visits/${visitId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(visitData) });
    if (!response.ok) throw new Error("Failed to update visit.");
    await get().fetchWineryData();
  },

  deleteVisit: async (visitId) => {
    const response = await fetch(`/api/visits/${visitId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error("Failed to delete visit.");
    await get().fetchWineryData();
  },

  toggleWishlist: async (winery, isOnWishlist) => {
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
    }
  },

  toggleFavorite: async (winery, isFavorite) => {
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
    }
  },
}));
