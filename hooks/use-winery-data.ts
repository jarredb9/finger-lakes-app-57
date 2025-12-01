// file: hooks/use-winery-data.ts
"use client"

import { useState, useCallback, useMemo, useEffect } from "react";
import { Winery, Visit } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useTripStore } from "@/lib/stores/tripStore";
import { getFavorites } from "@/app/actions";

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
  visits?: Visit[];
}

const formatWinery = (w: RawWinery, overrides: Partial<Winery> = {}) => {
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
    const [allUserVisits, setAllUserVisits] = useState<Visit[]>([]);
    const [allWishlistWineries, setAllWishlistWineries] = useState<Winery[]>([]);
    const [allFavoriteWineries, setAllFavoriteWineries] = useState<Winery[]>([]);
    const { toast } = useToast();
    const { fetchUpcomingTrips } = useTripStore();

    const fetchWishlist = useCallback(async () => {
        try {
            const response = await fetch('/api/wishlist');
            if (response.ok) {
                const items = await response.json();
                const formatted = items.map((w: RawWinery) => formatWinery(w, { onWishlist: true }));
                setAllWishlistWineries(formatted);
                return formatted;
            }
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Could not fetch your wishlist." });
        }
        return [];
    }, [toast]);

    const fetchFavorites = useCallback(async () => {
        try {
            const result = await getFavorites();
            if (result.success) {
                const formatted = result.data.map((w: any) => formatWinery(w as RawWinery, { isFavorite: true })).filter(Boolean) as Winery[];
                setAllFavoriteWineries(formatted);
                return formatted;
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error || "Could not fetch your favorites." });
            }
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Could not fetch your favorites." });
        }
        return [];
    }, [toast]);

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

    const refreshAllData = useCallback(async () => {
        await Promise.all([fetchUserVisits(), fetchWishlist(), fetchFavorites(), fetchUpcomingTrips()]);
    }, [fetchUserVisits, fetchWishlist, fetchFavorites, fetchUpcomingTrips]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        refreshAllData();
    }, [refreshAllData]);

    const allVisitedWineries = useMemo(() => {
        if (!allUserVisits || allUserVisits.length === 0) return [];
        
        const wineriesMap = new Map<number, Winery>();
        allUserVisits.forEach(visit => {
            if (!visit.wineries) return;
            const wineryData = visit.wineries as unknown as RawWinery;
            const wineryId = wineryData.id;

            if (wineriesMap.has(wineryId)) {
                const existingWinery = wineriesMap.get(wineryId)!;
                existingWinery.visits = existingWinery.visits ? [...existingWinery.visits, visit] : [visit];
            } else {
                const formatted = formatWinery(wineryData, { visits: [visit] });
                if (formatted) {
                    wineriesMap.set(wineryId, formatted as Winery);
                }
            }
        });

        return Array.from(wineriesMap.values()).map(winery => {
            const onWishlist = allWishlistWineries.some(w => w.dbId === winery.dbId);
            const isFavorite = allFavoriteWineries.some(f => f.dbId === winery.dbId);
            return {
                ...winery,
                userVisited: true,
                onWishlist,
                isFavorite,
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

    return { allVisitedWineries, allWishlistWineries, allFavoriteWineries, allPersistentWineries, refreshAllData };
}
