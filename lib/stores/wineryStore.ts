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

      const { visits } = visitsData;
      const favorites = favoritesData.favorites || favoritesData;
      const wishlist = wishlistData.wishlist || wishlistData;
      

      const isValidWinery = (winery: any): winery is Winery => {
        const result = (
          winery &&
          typeof winery.id === "string" &&
          typeof winery.name === "string" &&
          typeof winery.lat === "number" &&
          typeof winery.lng === "number"
        );
        if (!result) {
          console.warn('[Validation] Invalid winery detected:', winery);
        }
        return result;
      };

      const standardizeWinery = (item: any): Winery | null => {
        if (!item) return null;
      
        const wineryData = item.wineries ? item.wineries : item;
        if (!wineryData) return null;
      
        const id = String(wineryData.id);
        const lat = wineryData.latitude ?? wineryData.lat;
        const lng = wineryData.longitude ?? wineryData.lng;
      
        const standardized = {
          ...wineryData,
          id,
          lat: typeof lat === 'string' ? parseFloat(lat) : lat,
          lng: typeof lng === 'string' ? parseFloat(lng) : lng,
          ...(item.wineries && {
            visit_id: item.id,
            visit_date: item.visit_date,
            user_review: item.user_review,
            rating: item.rating,
          }),
        };
      
        if (isValidWinery(standardized)) {
          return standardized;
        }
        
        console.warn('[Validation] Winery failed validation. Standardized object:', standardized);
        console.warn(`[Validation] Breakdown: id=${typeof standardized.id}, name=${typeof standardized.name}, lat=${typeof standardized.lat}, lng=${typeof standardized.lng}`);
      
        return null;
      };
      
      const processWineries = (wineryData: any[], type: string): Winery[] => {
        console.log(`%c[processWineries] Processing ${type} data:`, 'color: green;', wineryData);
        if (!Array.isArray(wineryData)) {
          console.warn(`Expected an array for ${type}, but received:`, wineryData);
          return [];
        }
        const processed = wineryData.map(standardizeWinery).filter(Boolean) as Winery[];
        console.log(`%c[processWineries] Processed ${type} results:`, 'color: green; font-weight: bold;', processed);
        return processed;
      };

      const visitedWineries = processWineries(visits, 'visited');
      const favoriteWineries = processWineries(favorites, 'favorites');
      const wishlistWineries = processWineries(wishlist, 'wishlist');

      const persistentWineries = [
        ...visitedWineries,
        ...favoriteWineries,
        ...wishlistWineries,
      ];

      console.log('%c[wineryStore] Final State Update:', 'color: red; font-weight: bold;', {
        visitedWineries,
        favoriteWineries,
        wishlistWineries,
        persistentWineries,
      });

      set({
        wineries: [],
        visitedWineries,
        favoriteWineries,
        wishlistWineries,
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