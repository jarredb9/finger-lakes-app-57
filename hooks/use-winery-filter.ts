"use client";

import { useMemo } from "react";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { Winery } from "@/lib/types";
import { isCoordinateInBounds } from "@/lib/utils/map-utils";

export function useWineryFilter() {
  const { searchResults = [], filter = ['all'], bounds, setFilter } = useMapStore();
  const persistentWineries = useWineryDataStore((state) => state.persistentWineries);
  const { selectedTrip } = useTripStore();

  const mapWineries = useMemo(() => {
    const wineriesMap = new Map<string, Winery>();
    
    [...searchResults, ...persistentWineries].forEach((w) => {
      if (w && w.id) {
        wineriesMap.set(w.id, w); 
      }
    });

    const activeAttributes = filter.filter(f =>
      ["allowsDogs", "goodForChildren", "outdoorSeating", "hasEvCharging"].includes(f)
    );

    const categorizedWineries = {
      favorites: [] as Winery[],
      visited: [] as Winery[],
      wishlist: [] as Winery[],
      discovered: [] as Winery[],
    };

    wineriesMap.forEach((winery) => {
      const matchesAttributes = activeAttributes.every(attr => {
        if (attr === "allowsDogs") return winery.allows_dogs === true;
        if (attr === "goodForChildren") return winery.good_for_children === true;
        if (attr === "outdoorSeating") return winery.outdoor_seating === true;
        if (attr === "hasEvCharging") return winery.has_ev_charging === true;
        return true;
      });

      if (!matchesAttributes) return;

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
    filter,
  ]);

  const listResultsInView = useMemo(() => {
    if (selectedTrip || !bounds) return [];

    // When a search has been performed, the results list should ONLY show those results
    // that are within the current map bounds.
    if (searchResults.length > 0) {
        let results = searchResults;
        if (filter.includes("allowsDogs")) {
          results = results.filter((w) => w.allows_dogs === true);
        }
        if (filter.includes("goodForChildren")) {
          results = results.filter((w) => w.good_for_children === true);
        }
        if (filter.includes("outdoorSeating")) {
          results = results.filter((w) => w.outdoor_seating === true);
        }
        if (filter.includes("hasEvCharging")) {
          results = results.filter((w) => w.has_ev_charging === true);
        }
        return results.filter(
            (w) => w && w.latitude && w.longitude && isCoordinateInBounds({ latitude: w.latitude, longitude: w.longitude }, bounds)
        );
    }

    // If no search is active, filter all known wineries by the current view
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

    // Fallback if only attributes are selected but no category (so wineriesToFilter would be empty)
    const categories = ["all", "favorites", "visited", "wantToGo", "notVisited"];
    const hasCategory = filter.some((f) => categories.includes(f));
    if (!hasCategory) {
      wineriesToFilter = [
        ...mapWineries.favorites,
        ...mapWineries.visited,
        ...mapWineries.wishlist,
        ...mapWineries.discovered,
      ];
    }

    if (filter.includes("allowsDogs")) {
      wineriesToFilter = wineriesToFilter.filter((w) => w.allows_dogs === true);
    }
    if (filter.includes("goodForChildren")) {
      wineriesToFilter = wineriesToFilter.filter((w) => w.good_for_children === true);
    }
    if (filter.includes("outdoorSeating")) {
      wineriesToFilter = wineriesToFilter.filter((w) => w.outdoor_seating === true);
    }
    if (filter.includes("hasEvCharging")) {
      wineriesToFilter = wineriesToFilter.filter((w) => w.has_ev_charging === true);
    }
    
    const uniqueWineries = Array.from(
        new Map(wineriesToFilter.map(w => [w.id, w])).values()
    );

    return uniqueWineries.filter(
      (w) => w && w.latitude && w.longitude && isCoordinateInBounds({ latitude: w.latitude, longitude: w.longitude }, bounds)
    );
  }, [filter, mapWineries, bounds, selectedTrip, searchResults]);

  const handleFilterChange = (newFilter: string[]) => {
    const categories = ["all", "visited", "favorites", "wantToGo", "notVisited"];
    const attributes = ["allowsDogs", "goodForChildren", "outdoorSeating", "hasEvCharging"];

    const selectedCategories = newFilter.filter((f) => categories.includes(f));
    const selectedAttributes = newFilter.filter((f) => attributes.includes(f));

    let finalCategories = [...selectedCategories];

    if (finalCategories.length === 0) {
      finalCategories = ["all"];
    } else if (finalCategories.includes("all") && finalCategories.length > 1) {
      // If "all" was clicked while other categories were selected, or vice versa
      if (filter.includes("all")) {
        // "all" was already active, so the user clicked a new category. Remove "all".
        finalCategories = finalCategories.filter((c) => c !== "all");
      } else {
        // "all" was NOT active previously, so the user clicked "all". Keep only "all".
        finalCategories = ["all"];
      }
    }

    setFilter([...finalCategories, ...selectedAttributes]);
  };

  return {
    mapWineries,
    listResultsInView,
    filter,
    handleFilterChange,
  };
}
