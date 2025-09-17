import { create } from 'zustand';
import { Winery, Visit, Trip } from '@/lib/types';

interface WineryState {
  wineries: Winery[];
  visitedWineries: Winery[];
  wishlistWineries: Winery[];
  favoriteWineries: Winery[];
  persistentWineries: Winery[];
  
  
  isLoading: boolean;
  error: string | null;
  fetchWineryData: () => Promise<void>;
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
    console.log('[wineryStore] Starting fetchWineryData...');
    set({ isLoading: true, error: null });
    try {
      const [
        visitsRes,
        favoritesRes,
        wishlistRes,
        
      ] = await Promise.all([
        fetch("/api/visits"),
        fetch("/api/favorites"),
        fetch("/api/wishlist"),
        
      ]);

      const [
        visitsData,
        favoritesData,
        wishlistData,
        
      ] = await Promise.all([
        visitsRes.json(),
        favoritesRes.json(),
        wishlistRes.json(),
        
      ]);

      console.log("[wineryStore] Raw visitsData:", visitsData.visits.map((v: any) => ({ id: v.wineries?.google_place_id, name: v.wineries?.name, phone: v.wineries?.phone, website: v.wineries?.website, rating: v.wineries?.google_rating })));
      console.log("[wineryStore] Raw favoritesData:", favoritesData.map((f: any) => ({ id: f.wineries?.google_place_id ?? f.id, name: f.wineries?.name ?? f.name, phone: f.wineries?.phone ?? f.phone, website: f.wineries?.website ?? f.website, rating: f.wineries?.google_rating ?? f.rating })));
      console.log("[wineryStore] Raw wishlistData:", wishlistData.map((w: any) => ({ id: w.wineries?.google_place_id ?? w.id, name: w.wineries?.name ?? w.name, phone: w.wineries?.phone ?? w.phone, website: w.wineries?.website ?? w.website, rating: w.wineries?.google_rating ?? w.rating })));

      const { visits } = visitsData;
      const favorites = favoritesData.favorites || favoritesData;
      const wishlist = wishlistData.wishlist || wishlistData;
      
      

      const standardizeWineryData = (rawWinery: any, existingWinery?: Winery): Winery | null => {
        console.log("[wineryStore] standardizeWineryData - rawWinery:", rawWinery);
        console.log("[wineryStore] standardizeWineryData - existingWinery:", existingWinery);
        if (!rawWinery) return null;

        const id = String(rawWinery.id);
        const lat = rawWinery.latitude ?? rawWinery.lat;
        const lng = rawWinery.longitude ?? rawWinery.lng;

        const standardized: Winery = {
            id,
            dbId: rawWinery.dbId,
            name: rawWinery.name,
            address: rawWinery.address,
            lat: typeof lat === 'string' ? parseFloat(lat) : lat,
            lng: typeof lng === 'string' ? parseFloat(lng) : lng,
            phone: rawWinery.phone ?? existingWinery?.phone,
            website: rawWinery.website ?? existingWinery?.website,
            rating: rawWinery.google_rating ?? rawWinery.rating ?? existingWinery?.rating,
            userVisited: existingWinery?.userVisited || false,
            onWishlist: existingWinery?.onWishlist || false,
            isFavorite: existingWinery?.isFavorite || false,
            visits: existingWinery?.visits || [],
            trip_id: rawWinery.trip_id ?? existingWinery?.trip_id,
            trip_name: rawWinery.trip_name ?? existingWinery?.trip_name,
            trip_date: rawWinery.trip_date ?? existingWinery?.trip_date,
        };

        if (!standardized.id || !standardized.name || typeof standardized.lat !== 'number' || typeof standardized.lng !== 'number') {
            console.warn('[Validation] Invalid winery data after standardization:', rawWinery, standardized);
            return null;
        }
        console.log("[wineryStore] Standardized Winery Data:", standardized.id, standardized.name, { phone: standardized.phone, website: standardized.website, rating: standardized.rating });
        return standardized;
      };

      const standardizeVisitData = (rawVisit: any): Visit | null => {
          if (!rawVisit || !rawVisit.wineries) return null;

          const standardized: Visit = {
              id: rawVisit.id,
              visit_date: rawVisit.visit_date,
              user_review: rawVisit.user_review,
              rating: rawVisit.rating,
              photos: rawVisit.photos,
              wineries: {
                  id: rawVisit.wineries.id,
                  google_place_id: rawVisit.wineries.google_place_id,
                  name: rawVisit.wineries.name,
                  address: rawVisit.wineries.address,
                  latitude: rawVisit.wineries.latitude,
                  longitude: rawVisit.wineries.longitude,
              }
          };

          if (!standardized.id || !standardized.visit_date || !standardized.wineries.id) {
              console.warn('[Validation] Invalid visit data after standardization:', rawVisit, standardized);
              return null;
          }
          console.log("[wineryStore] Standardized Visit Data:", standardized);
          return standardized;
      };

      const wineriesMap = new Map<string, Winery>();

      visits.forEach((rawVisit: any) => {
          const visit = standardizeVisitData(rawVisit);
          if (!visit || !visit.wineries) return;

          const wineryGoogleId = String(visit.wineries.google_place_id);
          let wineryInMap = wineriesMap.get(wineryGoogleId);

          // Pass existing winery to standardizeWineryData for merging
          const newWineryData = standardizeWineryData(visit.wineries, wineryInMap || undefined);
          if (!newWineryData) return;
          wineryInMap = newWineryData;
          wineriesMap.set(wineryGoogleId, wineryInMap);

          wineryInMap.userVisited = true;
          wineryInMap.visits?.push(visit);
          console.log("[wineryStore] After processing visit, wineryInMap:", wineryInMap);
      });

      favorites.forEach((rawFavorite: any) => {
          const wineryData = rawFavorite.wineries || rawFavorite;
          const wineryGoogleId = String(wineryData.id);

          let wineryInMap = wineriesMap.get(wineryGoogleId);

          // Pass existing winery to standardizeWineryData for merging
          const newWineryData = standardizeWineryData(wineryData, wineryInMap || undefined);
          if (!newWineryData) return;
          wineryInMap = newWineryData;
          wineriesMap.set(wineryGoogleId, wineryInMap);

          wineryInMap.isFavorite = true;
          console.log("[wineryStore] After processing favorite, wineryInMap:", wineryInMap);
      });

      wishlist.forEach((rawWishlist: any) => {
          const wineryData = rawWishlist.wineries || rawWishlist;
          const wineryGoogleId = String(wineryData.id);

          let wineryInMap = wineriesMap.get(wineryGoogleId);

          // Pass existing winery to standardizeWineryData for merging
          const newWineryData = standardizeWineryData(wineryData, wineryInMap || undefined);
          if (!newWineryData) return;
          wineryInMap = newWineryData;
          wineriesMap.set(wineryGoogleId, wineryInMap);

          wineryInMap.onWishlist = true;
          console.log("[wineryStore] After processing wishlist, wineryInMap:", wineryInMap);
      });

      const persistentWineries = Array.from(wineriesMap.values());

      console.log('%c[wineryStore] Final State Update:', 'color: red; font-weight: bold;', {
        persistentWineries,
      });

      set({
        wineries: [],
        visitedWineries: persistentWineries.filter(w => w.userVisited),
        favoriteWineries: persistentWineries.filter(w => w.isFavorite),
        wishlistWineries: persistentWineries.filter(w => w.onWishlist),
        persistentWineries,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to fetch winery data:", error);
      set({ error: "Failed to load winery data.", isLoading: false });
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
    const method = isOnWishlist ? 'DELETE' : 'POST';
    const body = isOnWishlist ? JSON.stringify({ dbId: winery.dbId }) : JSON.stringify({ wineryData: winery });
    const response = await fetch('/api/wishlist', { method, headers: { 'Content-Type': 'application/json' }, body });
    if (!response.ok) throw new Error("Could not update wishlist.");
    
    // Optimistic update
    set(state => ({
        wishlistWineries: isOnWishlist
            ? state.wishlistWineries.filter(w => w.id !== winery.id)
            : [...state.wishlistWineries, { ...winery, onWishlist: true }]
    }));
    await get().fetchWineryData(); // Re-sync with DB
  },

  toggleFavorite: async (winery, isFavorite) => {
    const method = isFavorite ? 'DELETE' : 'POST';
    const body = isFavorite ? JSON.stringify({ dbId: winery.dbId }) : JSON.stringify({ wineryData: winery });
    const response = await fetch('/api/favorites', { method, headers: { 'Content-Type': 'application/json' }, body });
    if (!response.ok) throw new Error("Could not update favorites.");

    // Optimistic update
    set(state => ({
        favoriteWineries: isFavorite
            ? state.favoriteWineries.filter(w => w.id !== winery.id)
            : [...state.favoriteWineries, { ...winery, isFavorite: true }]
    }));
    await get().fetchWineryData(); // Re-sync with DB
  },
}));