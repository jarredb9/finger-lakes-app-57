"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useToast } from "@/hooks/use-toast";
import { Winery } from "@/lib/types";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUIStore } from "@/lib/stores/uiStore";

export function useWineryMap(userId: string) {
  const {
    map,
    setMap,
    bounds,
    setBounds,
    isSearching,
    setIsSearching,
    searchResults,
    setSearchResults,
    filter,
    setFilter,
    autoSearch,
    setAutoSearch,
    hitApiLimit,
    setHitApiLimit,
    searchLocation,
    setSearchLocation,
  } = useMapStore();

  const {
    visitedWineries,
    wishlistWineries,
    favoriteWineries,
    persistentWineries,
    error,
    fetchWineryData,
    ensureWineryDetails,
  } = useWineryStore();

  const { openWineryModal } = useUIStore();
  const { fetchUpcomingTrips, selectedTrip } = useTripStore();
  const { toast } = useToast();

  const [proposedWinery, setProposedWinery] = useState<Winery | null>(null);
  const searchFnRef = useRef<
    | ((
        locationText?: string,
        bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral
      ) => Promise<void>)
    | null
  >(null);

  const places = useMapsLibrary("places");
  const geocoding = useMapsLibrary("geocoding");
  const core = useMapsLibrary("core");
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const googleMapInstance = useMap();

  useEffect(() => {
    if (geocoding) {
      setGeocoder(new google.maps.Geocoder());
    }
    if (userId) {
      fetchWineryData();
      fetchUpcomingTrips();
    }
  }, [geocoding, userId, fetchWineryData, fetchUpcomingTrips]);

  useEffect(() => {
    if (googleMapInstance) {
      setMap(googleMapInstance);
    }
  }, [googleMapInstance, setMap]);

  useEffect(() => {
    if (
      map &&
      core &&
      selectedTrip &&
      selectedTrip.wineries &&
      selectedTrip.wineries.length > 0
    ) {
      const newBounds = new core.LatLngBounds();
      selectedTrip.wineries.forEach((winery) => {
        newBounds.extend(new core.LatLng(winery.lat, winery.lng));
      });
      map.fitBounds(newBounds);
    }
  }, [map, core, selectedTrip]);

  const mapWineries = useMemo(() => {
    const wineriesMap = new Map<string, Winery>();
    [...searchResults, ...persistentWineries].forEach((w) => {
      if (w && w.id) {
        wineriesMap.set(w.id, w);
      }
    });

    const favoriteIds = new Set(favoriteWineries.map((w) => w.id));
    const visitedIds = new Set(visitedWineries.map((w) => w.id));
    const wishlistIds = new Set(wishlistWineries.map((w) => w.id));

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
    persistentWineries,
    favoriteWineries,
    visitedWineries,
    wishlistWineries,
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

    return wineriesToFilter.filter(
      (w) => w && w.lat && w.lng && bounds.contains({ lat: w.lat, lng: w.lng })
    );
  }, [filter, mapWineries, bounds, selectedTrip]);

  const executeSearch = useCallback(
    async (
      locationText?: string,
      searchBounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral
    ) => {
      if (!places || !geocoder) return;
      setIsSearching(true);
      setSearchResults([]);

      let finalSearchBounds: google.maps.LatLngBounds;
      if (locationText) {
        try {
          const { results } = await geocoder.geocode({ address: locationText });
          if (results && results.length > 0 && results[0].geometry.viewport) {
            finalSearchBounds = results[0].geometry.viewport;
            map?.fitBounds(finalSearchBounds);
          } else {
            toast({
              variant: "destructive",
              description: "Could not find that location.",
            });
            setIsSearching(false);
            return;
          }
        } catch (error) {
          console.error("Geocoding failed:", error);
          setIsSearching(false);
          return;
        }
      } else if (searchBounds) {
        finalSearchBounds = new google.maps.LatLngBounds(searchBounds);
      } else {
        setIsSearching(false);
        return;
      }

      const searchTerms = ["winery", "vineyard", "tasting room"];
      const allFoundPlaces = new Map<string, google.maps.places.Place>();
      let hitApiLimit = false;

      for (const term of searchTerms) {
        const request = {
          textQuery: term,
          fields: [
            "displayName",
            "location",
            "formattedAddress",
            "rating",
            "id",
            "websiteURI",
            "nationalPhoneNumber",
          ],
          locationRestriction: finalSearchBounds,
        };

        try {
          const { places: foundPlaces } =
            await google.maps.places.Place.searchByText(request);
          if (foundPlaces.length === 20) {
            hitApiLimit = true;
          }
          foundPlaces.forEach((place) => {
            if (place.id) {
              allFoundPlaces.set(place.id, place);
            }
          });
        } catch (error) {
          console.error(
            `Google Places search error for term \"${term}\":`,
            error
          );
        }
      }

      const wineries = Array.from(allFoundPlaces.values()).map((place) => ({
        id: place.id!,
        name: place.displayName!,
        address: place.formattedAddress!,
        lat: place.location!.lat(),
        lng: place.location!.lng(),
        rating: place.rating ?? undefined,
        website: place.websiteURI ?? undefined,
        phone: place.nationalPhoneNumber ?? undefined,
      }));

      setSearchResults(wineries);
      setIsSearching(false);
      setHitApiLimit(hitApiLimit);
    },
    [map, places, geocoder, toast, setIsSearching, setSearchResults, setHitApiLimit]
  );

  useEffect(() => {
    searchFnRef.current = executeSearch;
  });

  useEffect(() => {
    if (!map) return;
    const idleListener = map.addListener("idle", () => {
      const currentBounds = map.getBounds();
      if (currentBounds) {
        setBounds(currentBounds);
        if (autoSearch) {
          searchFnRef.current?.(undefined, currentBounds);
        }
      }
    });
    return () => {
      google.maps.event.removeListener(idleListener);
    };
  }, [map, autoSearch, setBounds]);

  const handleMapClick = useCallback(
    async (e: google.maps.IconMouseEvent) => {
      if (!places || !geocoding || !e.latLng || !e.placeId) return;
      e.stop();
      const isKnown = persistentWineries.some((w) => w.id === e.placeId);
      if (isKnown) return;

      try {
        const placeDetails = new places.Place({ id: e.placeId });
        await placeDetails.fetchFields({
          fields: [
            "displayName",
            "formattedAddress",
            "websiteURI",
            "nationalPhoneNumber",
            "location",
          ],
        });
        if (!placeDetails.location) {
          toast({
            variant: "destructive",
            description: "Could not get details for this location.",
          });
          return;
        }
        const newWinery: Winery = {
          id: e.placeId,
          name: placeDetails.displayName || "Unnamed Location",
          address: placeDetails.formattedAddress || "N/A",
          lat: placeDetails.location.lat(),
          lng: placeDetails.location.lng(),
          website: placeDetails.websiteURI ?? undefined,
          phone: placeDetails.nationalPhoneNumber ?? undefined,
        };
        setProposedWinery(newWinery);
      } catch (error) {
        toast({
          variant: "destructive",
          description: "An error occurred while fetching location details.",
        });
      }
    },
    [places, geocoding, toast, persistentWineries]
  );

  useEffect(() => {
    if (!map) return;
    const clickListener = map.addListener("click", handleMapClick);
    return () => {
      clickListener.remove();
    };
  }, [map, handleMapClick]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLocation.trim()) {
      executeSearch(searchLocation.trim());
    }
  };
  const handleManualSearchArea = () => {
    if (map) {
      executeSearch(undefined, map.getBounds());
    }
  };

  const handleOpenModal = useCallback(
    async (winery: Winery) => {
      await ensureWineryDetails(winery.id);
      openWineryModal(winery.id);
    },
    [openWineryModal, ensureWineryDetails]
  );

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
    error,
    mapWineries,
    listResultsInView,
    isSearching,
    hitApiLimit,
    searchLocation,
    setSearchLocation,
    autoSearch,
    setAutoSearch,
    filter,
    handleSearchSubmit,
    handleManualSearchArea,
    handleFilterChange,
    handleOpenModal,
    proposedWinery,
    setProposedWinery,
    selectedTrip,
  };
}
