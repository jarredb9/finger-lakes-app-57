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
    console.log('[wineryStore] Starting fetchWineryData...');
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
      // FIX: Correctly destructure the API responses. Wishlist and Favorites APIs return a direct array.
      const { visits: rawVisits, trips: upcoming } = { 
        visits: visitedJson.visits || [], 
        trips: upcomingTripsJson.trips || [] 
      };
      // Assign directly since they are arrays, not nested objects.
      const wishlistWineries = wishlistJson.wishlist || [];
      const favoriteWineries = favoritesJson.favorites || [];

      // --- NEW DETAILED LOGGING ---
      console.log('%c[wineryStore] API JSON Responses:', 'color: orange; font-weight: bold;', { visitedJson, wishlistJson, favoritesJson, upcomingTripsJson });
      // --- END NEW LOGGING ---

      console.log('[wineryStore] Raw data from API:', {
        rawVisitsCount: rawVisits.length,
        wishlistWineriesCount: wishlistWineries.length,
        favoriteWineriesCount: favoriteWineries.length,
        upcomingTripsCount: upcoming.length,
      });

      // --- NEW DIAGNOSTIC LOG ---
      console.log('%c[wineryStore] Initial Array Population Check:', 'color: purple; font-weight: bold;', { rawVisits, wishlistWineries, favoriteWineries });
      // --- END NEW LOG ---

      // The /api/visits endpoint returns visit objects. We need to extract the nested winery 
      // from each visit and combine it with the visit data itself.
      const visitedWineriesRaw = Array.isArray(rawVisits) 
        ? rawVisits.map((v: any) => v.wineries ? { ...v.wineries, visits: [v] } : null).filter(Boolean)
        : [];
      
      // --- NEW DETAILED LOGGING ---
      console.log('%c[wineryStore] Processed & Raw Data (first 5 items):', 'color: orange; font-weight: bold;', {
        visitedWineriesRaw: visitedWineriesRaw.slice(0, 5),
        favoriteWineries: favoriteWineries.slice(0, 5),
        wishlistWineries: wishlistWineries.slice(0, 5),
      });
      // --- END NEW LOGGING ---

      // 1. Standardize the data format first. This creates new objects and avoids mutation.
      const standardizeWinery = (w: any) => ({
        ...w,
        id: String(w.id), // Ensure ID is always a string
        lat: typeof w.lat === 'string' ? parseFloat(w.lat) : w.lat,
        lng: typeof w.lng === 'string' ? parseFloat(w.lng) : w.lng,
      });

      const standardizedVisited = visitedWineriesRaw.map(standardizeWinery);
      const standardizedFavorites = favoriteWineries.map(standardizeWinery);
      const standardizedWishlist = wishlistWineries.map(standardizeWinery);

      // 2. Now, create a clean, non-mutating validation function.
      const isValidWinery = (w: any): w is Winery => {
        return w && typeof w.id === 'string' && w.id.length > 0 &&
               typeof w.lat === 'number' && !isNaN(w.lat) &&
               typeof w.lng === 'number' && !isNaN(w.lng);
      };

      const validVisitedWineries = standardizedVisited.filter(isValidWinery);
      const validFavoriteWineries = standardizedFavorites.filter(isValidWinery);
      const validWishlistWineries = standardizedWishlist.filter(isValidWinery);

      console.log('[wineryStore] Validated data counts:', {
        validVisited: validVisitedWineries.length,
        validFavorites: validFavoriteWineries.length,
        validWishlist: validWishlistWineries.length,
      });

      const persistentWineriesMap = new Map<string, Winery>();

      const allWineries = [...validFavoriteWineries, ...validWishlistWineries, ...validVisitedWineries];

      for (const winery of allWineries) {
        const existing = persistentWineriesMap.get(winery.id) || {};
        persistentWineriesMap.set(winery.id, { ...existing, ...winery });
      }

      const persistentWineriesArray = Array.from(persistentWineriesMap.values());
      console.log(`[wineryStore] Created ${persistentWineriesArray.length} unique persistent wineries.`);

      set({
        visitedWineries: validVisitedWineries,
        wishlistWineries: validWishlistWineries,
        favoriteWineries: validFavoriteWineries,
        persistentWineries: persistentWineriesArray,
        upcomingTrips: upcoming || [],
        isLoading: false,
      });
    } catch (error) {
      console.error("[wineryStore] FATAL ERROR in fetchWineryData:", error);
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
