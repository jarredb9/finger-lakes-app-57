import { create } from 'zustand';
import { Winery, Visit, Trip } from '@/lib/types';

interface WineryState {
  visitedWineries: Winery[];
  wishlistWineries: Winery[];
  favoriteWineries: Winery[];
  persistentWineries: Winery[];
  upcomingTrips: Trip[];
  isLoading: boolean;
  fetchWineryData: () => Promise<void>;
  saveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: string[] }) => Promise<void>;
  updateVisit: (visitId: string, visitData: { visit_date: string; user_review: string; rating: number; }) => Promise<void>;
  deleteVisit: (visitId: string) => Promise<void>;
  toggleWishlist: (winery: Winery, isOnWishlist: boolean) => Promise<void>;
  toggleFavorite: (winery: Winery, isFavorite: boolean) => Promise<void>;
}

export const useWineryStore = create<WineryState>((set, get) => ({
  visitedWineries: [],
  wishlistWineries: [],
  favoriteWineries: [],
  persistentWineries: [],
  upcomingTrips: [],
  isLoading: false,

  fetchWineryData: async () => {
    set({ isLoading: true });
    try {
      const [visitedRes, wishlistRes, favoritesRes, upcomingTripsRes] = await Promise.all([
        fetch('/api/visits'),
        fetch('/api/wishlist'),
        fetch('/api/favorites'),
        fetch('/api/trips?type=upcoming&full=true')
      ]);

      // Extract the nested winery arrays from the API responses.
      // Use `|| []` to provide a fallback for both null and undefined API responses, making this more robust.
      const visitedJson = await visitedRes.json();
      const wishlistJson = await wishlistRes.json();
      const favoritesJson = await favoritesRes.json();
      const upcomingTripsJson = await upcomingTripsRes.json();
      const { visits: rawVisits, wishlist: wishlistWineries, favorites: favoriteWineries, trips: upcoming } = { visits: visitedJson.visits || [], wishlist: wishlistJson.wishlist || [], favorites: favoritesJson.favorites || [], trips: upcomingTripsJson.trips || [] };

      // The /api/visits endpoint returns visit objects, so we need to extract the winery from each one.
      const visitedWineries = Array.isArray(rawVisits) ? rawVisits.map((v: any) => ({ ...v.wineries, visits: [v] })) : [];

      const persistent = new Map<string, Winery>();
      // Combine all wineries into a single list for consistent data handling.
      [...favoriteWineries, ...wishlistWineries, ...visitedWineries].forEach(w => persistent.set(w.id, { ...persistent.get(w.id), ...w }));

      set({
        visitedWineries: visitedWineries,
        wishlistWineries: wishlistWineries,
        favoriteWineries: favoriteWineries,
        persistentWineries: Array.from(persistent.values()),
        upcomingTrips: upcoming || [],
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to fetch winery data", error);
      set({ isLoading: false });
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
