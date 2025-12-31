"use client";

import { useMemo } from "react";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { Winery } from "@/lib/types";

export function useWineryFilter() {
  const { searchResults, filter, setFilter } = useMapStore();
  const persistentWineries = useWineryDataStore((state) => state.persistentWineries);
  
  const mapWineries = useMemo(() => {
    const wineriesMap = new Map<string, Winery>();
    
    // Combine search results and persistent wineries, preferring persistent ones
    [...searchResults, ...persistentWineries].forEach((w) => {
      if (w && w.id) {
        wineriesMap.set(w.id, w); 
      }
    });

    const categorizedWineries = {
      favorites: [] as Winery[],
      visited: [] as Winery[],
      wishlist: [] as Winery[],
      discovered: [] as Winery[],
    };

    wineriesMap.forEach((winery) => {
      if (winery.isFavorite) {
        categorizedWineries.favorites.push(winery);
      } else if (winery.userVisited) {
        categorizedWineries.visited.push(winery);
      } else if (winery.onWishlist) {
        categorizedWineries.wishlist.push(winery);
      } else {
        categorizedWineries.discovered.push(winery);
      }
    });

    return categorizedWineries;
  }, [
    searchResults,
    persistentWineries,
  ]);

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
    filter,
    handleFilterChange,
  };
}
