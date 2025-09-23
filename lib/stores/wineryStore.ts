import { create } from 'zustand';
import { Winery, Visit } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';

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
  isSavingVisit: boolean;
  isTogglingWishlist: boolean;
  isTogglingFavorite: boolean;
  error: string | null;
  fetchWineryData: () => Promise<void>;
  ensureWineryDetails: (placeId: string) => Promise<Winery | null>;
  saveVisit: (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: File[] }) => Promise<void>;
  updateVisit: (visitId: string, visitData: { visit_date: string; user_review: string; rating: number; }) => Promise<void>;
  deleteVisit: (visitId: string) => Promise<void>;
  toggleWishlist: (winery: Winery, isOnWishlist: boolean) => Promise<void>;
  toggleFavorite: (winery: Winery, isFavorite: boolean) => Promise<void>;
  getWineryById: (id: string) => Winery | undefined;
  ensureWineryInDb: (winery: Winery) => Promise<number | null>;
  updateWinery: (wineryId: string, updates: Partial<Winery>) => void;
}

export const useWineryStore = create<WineryState>((set, get) => ({
  wineries: [],
  visitedWineries: [],
  wishlistWineries: [],
  favoriteWineries: [],
  persistentWineries: [],
  isLoading: false,
  isSavingVisit: false,
  isTogglingWishlist: false,
  isTogglingFavorite: false,
  error: null,

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

      upcomingTrips.forEach((trip: Trip) => {
        if (trip.wineries) {
          trip.wineries.forEach((wineryOnTrip: Winery) => {
            const googleId = String(wineryOnTrip.google_place_id || wineryOnTrip.id);
            if (!googleId) return;

            // Ensure the winery is in the map
            processWinery(wineryOnTrip, {});

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
    set({ isSavingVisit: true });
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated.");

      const dbId = await get().ensureWineryInDb(winery);
      if (!dbId) throw new Error("Could not ensure winery exists in database.");

      // 1. Save visit without photos
      const visitPayload = { 
        winery_id: dbId, 
        user_id: user.id, 
        visit_date: visitData.visit_date, 
        user_review: visitData.user_review, 
        rating: visitData.rating 
      };
      const { data: visit, error: visitError } = await supabase
        .from('visits')
        .insert(visitPayload)
        .select()
        .single();

      if (visitError) throw visitError;

      let photoUrlsForState: string[] = [];

      // 2. Upload photos if they exist
      if (visitData.photos.length > 0) {
        const uploadPromises = visitData.photos.map(async (photoFile) => {
          const fileName = `${Date.now()}-${photoFile.name}`;
          const filePath = `${user.id}/${visit.id}/${fileName}`;
          
          const { error: uploadError } = await supabase.storage
            .from('visit-photos')
            .upload(filePath, photoFile);

          if (uploadError) {
            console.error('Error uploading photo:', uploadError);
            return null;
          }
          return filePath;
        });

        const photoPathsForDb = (await Promise.all(uploadPromises)).filter((path): path is string => path !== null);

        // 3. Update visit with photo paths
        if (photoPathsForDb.length > 0) {
          const { error: updateError } = await supabase
            .from('visits')
            .update({ photos: photoPathsForDb })
            .eq('id', visit.id);

          if (updateError) console.error('Error updating visit with photo paths:', updateError);
        }

        // For immediate display, create signed URLs
        const signedUrlPromises = photoPathsForDb.map(path => 
            supabase.storage.from('visit-photos').createSignedUrl(path, 300) // 5 min URL
        );
        const signedUrlResults = await Promise.all(signedUrlPromises);
        photoUrlsForState = signedUrlResults
            .map(result => result.data?.signedUrl)
            .filter((url): url is string => !!url);
      }

      // 4. Update local state
      const newVisit: Visit = { ...visit, photos: photoUrlsForState };
      set(state => {
        const updatedWineries = state.persistentWineries.map(w => {
          if (w.id === winery.id) {
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

    } catch (error) {
      console.error("Failed to save visit:", error);
      throw error;
    } finally {
      set({ isSavingVisit: false });
    }
  },

  updateVisit: async (visitId, visitData) => {
    set({ isSavingVisit: true });

    const originalWineries = get().persistentWineries;
    let wineryIdToUpdate: string | null = null;

    // Optimistically update the visit
    const updatedWineries = originalWineries.map(winery => {
        const visitIndex = winery.visits.findIndex(v => v.id === visitId);
        if (visitIndex === -1) return winery;

        wineryIdToUpdate = winery.id; // Capture the winery ID
        const updatedVisits = [...winery.visits];
        const originalVisit = updatedVisits[visitIndex];
        updatedVisits[visitIndex] = { ...originalVisit, ...visitData };

        return { ...winery, visits: updatedVisits };
    });

    set({ persistentWineries: updatedWineries });

    try {
        const response = await fetch(`/api/visits/${visitId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(visitData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to update visit.");
        }
        
        // The API returns the updated visit, we can use it to confirm our state
        const updatedVisitFromServer = await response.json();
        
        // Final state update with server data to ensure consistency
        set(state => {
            const finalWineries = state.persistentWineries.map(winery => {
                if (winery.id !== wineryIdToUpdate) return winery;
                
                const visitIndex = winery.visits.findIndex(v => v.id === visitId);
                if (visitIndex === -1) return winery;

                const finalVisits = [...winery.visits];
                finalVisits[visitIndex] = { ...finalVisits[visitIndex], ...updatedVisitFromServer };
                return { ...winery, visits: finalVisits };
            });
            return { persistentWineries: finalWineries };
        });

    } catch (error) {
        console.error("Failed to update visit, reverting:", error);
        set({ persistentWineries: originalWineries }); // Revert on error
        throw error; // Re-throw to be caught in the component
    } finally {
        set({ isSavingVisit: false });
    }
  },

  deleteVisit: async (visitId) => {
    const originalWineries = get().persistentWineries;
    let wineryIdForRevert: string | null = null;
    let deletedVisit: Visit | null = null;
    let visitIndexForRevert = -1;

    // Optimistic deletion
    const updatedWineries = originalWineries.map(winery => {
        const visitIndex = winery.visits.findIndex(v => v.id === visitId);
        if (visitIndex === -1) return winery;

        wineryIdForRevert = winery.id;
        deletedVisit = winery.visits[visitIndex];
        visitIndexForRevert = visitIndex;

        const newVisits = winery.visits.filter(v => v.id !== visitId);
        return { ...winery, visits: newVisits };
    });

    set({ persistentWineries: updatedWineries });

    try {
        const response = await fetch(`/api/visits/${visitId}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to delete visit.");
        }
    } catch (error) {
        console.error("Failed to delete visit, reverting:", error);
        if (wineryIdForRevert && deletedVisit) {
            const revertedWineries = originalWineries.map(winery => {
                if (winery.id === wineryIdForRevert) {
                    const revertedVisits = [...winery.visits];
                    if (visitIndexForRevert !== -1) {
                        revertedVisits.splice(visitIndexForRevert, 0, deletedVisit!);
                    }
                    return { ...winery, visits: revertedVisits };
                }
                return winery;
            });
            set({ persistentWineries: revertedWineries });
        } else {
            // If something went wrong with finding the visit, just revert all
            set({ persistentWineries: originalWineries });
        }
        throw error;
    }
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