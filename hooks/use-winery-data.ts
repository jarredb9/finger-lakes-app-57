// file: hooks/use-winery-data.ts
"use client"

import { useState, useCallback, useMemo, useEffect } from "react";
import { Winery, Trip } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

const formatWinery = (w: any, overrides: Partial<Winery> = {}) => {
    if (!w) return null;
    return {
        id: w.google_place_id,
        dbId: w.id,
        name: w.name,
        address: w.address,
        lat: parseFloat(w.latitude),
        lng: parseFloat(w.longitude),
        phone: w.phone,
        website: w.website,
        rating: w.google_rating,
        ...overrides
    };
};

export function useWineryData() {
    const [allUserVisits, setAllUserVisits] = useState<any[]>([]);
    const [allWishlistWineries, setAllWishlistWineries] = useState<Winery[]>([]);
    const [allFavoriteWineries, setAllFavoriteWineries] = useState<Winery[]>([]);
    // ** FIX: Add a new state for all upcoming trips. **
    const [allUpcomingTrips, setAllUpcomingTrips] = useState<Trip[]>([]);
    const { toast } = useToast();

    const fetchWishlist = useCallback(async () => {
        try {
            const response = await fetch('/api/wishlist');
            if (response.ok) {
                const items = await response.json();
                const formatted = items.map((w: any) => formatWinery(w, { onWishlist: true }));
                setAllWishlistWineries(formatted);
                return formatted;
            }
        } catch (error) { console.error("Failed to fetch wishlist", error); }
        return [];
    }, []);

    const fetchFavorites = useCallback(async () => {
        try {
            const response = await fetch('/api/favorites');
            if (response.ok) {
                const items = await response.json();
                const formatted = items.map((w: any) => formatWinery(w, { isFavorite: true }));
                setAllFavoriteWineries(formatted);
                return formatted;
            }
        } catch (error) { console.error("Failed to fetch favorites", error); }
        return [];
    }, []);

    const fetchUserVisits = useCallback(async () => {
        try {
            const response = await fetch('/api/visits?page=1&limit=1000');
            if (response.ok) {
                const data = await response.json();
                const visitsArray = data.visits || [];
                setAllUserVisits(visitsArray);
                return visitsArray;
            }
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Could not fetch your visits." });
        }
        return [];
    }, [toast]);
    
    const fetchUpcomingTrips = useCallback(async () => {
      try {
        // ** FIX: Add the 'full=true' query parameter to get the full winery list **
        const response = await fetch('/api/trips?type=upcoming&page=1&limit=1000&full=true');
        if (response.ok) {
          const { trips } = await response.json();
          setAllUpcomingTrips(trips);
        }
      } catch (error) {
        console.error("Failed to fetch upcoming trips", error);
      }
      return [];
    }, []);


    const refreshAllData = useCallback(async () => {
        // ** FIX: Call the new fetchUpcomingTrips function as well. **
        await Promise.all([fetchUserVisits(), fetchWishlist(), fetchFavorites(), fetchUpcomingTrips()]);
    }, [fetchUserVisits, fetchWishlist, fetchFavorites, fetchUpcomingTrips]);


    useEffect(() => {
        refreshAllData();
    }, [refreshAllData]);

    const allVisitedWineries = useMemo(() => {
        if (!allUserVisits || allUserVisits.length === 0) return [];
        
        const wineriesMap = new Map<number, any>();
        // ** THE FIX IS HERE: Corrected the typo from `allUserVisisits` to `allUserVisits` **
        allUserVisits.forEach(visit => {
            if (!visit.wineries) return;
            const wineryId = visit.wineries.id;
            if (wineriesMap.has(wineryId)) {
                wineriesMap.get(wineryId).visits.push(visit);
            } else {
                wineriesMap.set(wineryId, { ...visit.wineries, visits: [visit] });
            }
        });

        return Array.from(wineriesMap.values()).map(winery => {
            const onWishlist = allWishlistWineries.some(w => w.dbId === winery.id);
            const isFavorite = allFavoriteWineries.some(f => f.dbId === winery.id);
            return {
                ...formatWinery(winery),
                userVisited: true,
                onWishlist,
                isFavorite,
                visits: winery.visits
            };
        });
    }, [allUserVisits, allWishlistWineries, allFavoriteWineries]);
    
    const allPersistentWineries = useMemo(() => {
        const wineries = new Map<string, Winery>();
        [...allFavoriteWineries, ...allWishlistWineries, ...allVisitedWineries].forEach(w => {
            if (w) {
                 wineries.set(w.id, { ...wineries.get(w.id), ...w });
            }
        });
        return Array.from(wineries.values());
    }, [allVisitedWineries, allWishlistWineries, allFavoriteWineries]);


    return { allVisitedWineries, allWishlistWineries, allFavoriteWineries, allPersistentWineries, allUpcomingTrips, refreshAllData };
}