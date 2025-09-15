import { create } from 'zustand';
import { Winery, Visit, Trip } from '@/lib/types';

interface WineryState {
  wineries: Winery[];
  visitedWineries: Winery[];
  wishlistWineries: Winery[];
  favoriteWineries: Winery[];
  persistentWineries: Winery[];
  upcomingTrips: Trip[];
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
  upcomingTrips: [],
  isLoading: false,
  error: null,

  fetchWineryData: async () => {
    console.log('[wineryStore] Starting fetchWineryData...');
    set({ isLoading: true, error: null });
    try {
      const [
        wineriesRes,
        visitsRes,
        favoritesRes,
        wishlistRes,
        tripsRes,
      ] = await Promise.all([
        fetch("/api/wineries"),
        fetch("/api/visits"),
        fetch("/api/favorites"),
        fetch("/api/wishlist"),
        fetch("/api/trips?type=upcoming"),
      ]);

      const [
        wineriesData,
        visitsData,
        favoritesData,
        wishlistData,
        tripsData,
      ] = await Promise.all([
        wineriesRes.json(),
        visitsRes.json(),
        favoritesRes.json(),
        wishlistRes.json(),
        tripsRes.json(),
      ]);

      const { wineries } = wineriesData;
      const { visits } = visitsData;
      const favorites = favoritesData.favorites || favoritesData;
      const wishlist = wishlistData.wishlist || wishlistData;
      const { trips: upcomingTrips } = tripsData;

      const isValidWinery = (winery: any): winery is Winery => {
        return (
          winery &&
          typeof winery.id === "string" &&
          typeof winery.name === "string" &&
          typeof winery.lat === "number" &&
          typeof winery.lng === "number"
        );
      };

      const standardizeWinery = (winery: any): Winery | null => {
        if (!winery) return null;

        // If the winery data is nested inside a `wineries` property (like in the `visits` table),
        // we need to extract it.
        const wineryData = winery.wineries ? winery.wineries : winery;

        const id =
          typeof wineryData.id === "number" ? String(wineryData.id) : wineryData.id;
        const lat =
          typeof wineryData.lat === "string"
            ? parseFloat(wineryData.lat)
            : wineryData.lat;
        const lng =
          typeof wineryData.lng === "string"
            ? parseFloat(wineryData.lng)
            : wineryData.lng;

        const standardized = {
          ...wineryData,
          id,
          lat,
          lng,
          // Keep visit-specific data if it exists
          visit_id: winery.id,
          visit_date: winery.visit_date,
        };

        if (isValidWinery(standardized)) {
          return standardized;
        }
        return null;
      };
      
      const processWineries = (wineryData: any[]): Winery[] => {
        if (!Array.isArray(wineryData)) {
          console.warn("Expected an array of wineries, but received:", wineryData);
          return [];
        }
        return wineryData.map(standardizeWinery).filter(Boolean) as Winery[];
      };

      const visitedWineries = processWineries(visits);
      const favoriteWineries = processWineries(favorites);
      const wishlistWineries = processWineries(wishlist);

      const persistentWineries = [
        ...visitedWineries,
        ...favoriteWineries,
        ...wishlistWineries,
      ];

      set({
        wineries,
        visitedWineries,
        favoriteWineries,
        wishlistWineries,
        persistentWineries,
        upcomingTrips,
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