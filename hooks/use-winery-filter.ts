"use client";

import { useMemo } from "react";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { Winery } from "@/lib/types";

export function useWineryFilter() {
  const { searchResults, filter, bounds, setFilter } = useMapStore();
  const { getWineries, getFavorites, getVisited, getWishlist } = useWineryStore();
  const { selectedTrip } = useTripStore();

  const mapWineries = useMemo(() => {
    const wineriesMap = new Map<string, Winery>();
    
    // Combine search results and persistent wineries, preferring persistent ones (more data)
    [...searchResults, ...getWineries()].forEach((w) => {
      if (w && w.id) {
        // If duplicate, this preserves the last one. 
        // We might want to be more careful here, but this matches original logic.
        wineriesMap.set(w.id, w); 
      }
    });

    const favoriteIds = new Set(getFavorites().map((w) => w.id));
    const visitedIds = new Set(getVisited().map((w) => w.id));
    const wishlistIds = new Set(getWishlist().map((w) => w.id));

    const categorizedWineries = {
      favorites: [] as Winery[],
      visited: [] as Winery[],
      wishlist: [] as Winery[],
      discovered: [] as Winery[],
    };

    wineriesMap.forEach((winery) => {
      if (favoriteIds.has(winery.id)) {
        categorizedWineries.favorites.push(winery);
      } else if (visitedIds.has(winery.id)) {
        categorizedWineries.visited.push(winery);
      } else if (wishlistIds.has(winery.id)) {
        categorizedWineries.wishlist.push(winery);
      } else {
        categorizedWineries.discovered.push(winery);
      }
    });

    return categorizedWineries;
  }, [
    searchResults,
    getWineries,
    getFavorites,
    getVisited,
    getWishlist,
  ]);

  const listResultsInView = useMemo(() => {
    if (!bounds) return [];
    if (selectedTrip) return [];

    let wineriesToFilter: Winery[] = [];
    
    if (filter.includes("all")) {
      wineriesToFilter = [
        ...mapWineries.favorites,
        ...mapWineries.visited,
        ...mapWineries.wishlist,
        ...mapWineries.discovered,
      ];
    } else {
      if (filter.includes("favorites"))
        wineriesToFilter.push(...mapWineries.favorites);
      if (filter.includes("visited"))
        wineriesToFilter.push(...mapWineries.visited);
      if (filter.includes("wantToGo"))
        wineriesToFilter.push(...mapWineries.wishlist);
      if (filter.includes("notVisited"))
        wineriesToFilter.push(...mapWineries.discovered);
    }

    // De-duplicate by ID before filtering by bounds
    const uniqueWineries = Array.from(
        new Map(wineriesToFilter.map(w => [w.id, w])).values()
    );

    return uniqueWineries.filter(
      (w) => w && w.lat && w.lng && bounds.contains({ lat: w.lat, lng: w.lng })
    );
  }, [filter, mapWineries, bounds, selectedTrip]);

  const handleFilterChange = (newFilter: string[]) => {
    if (newFilter.length === 0) {
      setFilter(["all"]);
      return;
    }
    if (newFilter.length > 1 && newFilter.includes("all")) {
      if (filter.includes("all")) {
        setFilter(newFilter.filter((f) => f !== "all"));
        return;
      } else {
        setFilter(["all"]);
        return;
      }
    }
    setFilter(newFilter);
  };

  return {
    mapWineries,
    listResultsInView,
    filter,
    handleFilterChange,
  };
}
