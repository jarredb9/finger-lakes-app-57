import { renderHook, act } from "@testing-library/react";
import { useWineryFilter } from "../use-winery-filter";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { createMockWinery } from "@/lib/test-utils/fixtures";
import { GooglePlaceId } from "@/lib/types";

describe("useWineryFilter", () => {
  const mockBounds = {
    contains: jest.fn().mockReturnValue(true),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset stores
    useMapStore.setState({
      searchResults: [],
      filter: ["all"],
      bounds: mockBounds as any,
    });

    useWineryStore.setState({
      persistentWineries: [],
    });

    useTripStore.setState({
      selectedTrip: null,
    });
  });

  it("should return all wineries when filter is 'all'", () => {
    const winery1 = createMockWinery({ id: "w1" as GooglePlaceId, isFavorite: true });
    const winery2 = createMockWinery({ id: "w2" as GooglePlaceId, userVisited: true });
    
    useWineryStore.setState({
      persistentWineries: [winery1, winery2],
    });

    const { result } = renderHook(() => useWineryFilter());

    expect(result.current.listResultsInView).toHaveLength(2);
    expect(result.current.listResultsInView).toContainEqual(winery1);
    expect(result.current.listResultsInView).toContainEqual(winery2);
  });

  it("should return wineries even if bounds is not yet initialized (graceful fallback)", () => {
    const winery1 = createMockWinery({ id: "w1" as GooglePlaceId });
    useWineryStore.setState({
      persistentWineries: [winery1],
    });
    useMapStore.setState({
      bounds: null,
    });

    const { result } = renderHook(() => useWineryFilter());

    expect(result.current.listResultsInView).toHaveLength(1);
    expect(result.current.listResultsInView[0].id).toBe("w1");
  });

  it("should filter by category 'favorites'", () => {
    const winery1 = createMockWinery({ id: "w1" as GooglePlaceId, isFavorite: true });
    const winery2 = createMockWinery({ id: "w2" as GooglePlaceId, userVisited: true });
    
    useWineryStore.setState({
      persistentWineries: [winery1, winery2],
    });
    
    useMapStore.setState({
      filter: ["favorites"],
    });

    const { result } = renderHook(() => useWineryFilter());

    expect(result.current.listResultsInView).toHaveLength(1);
    expect(result.current.listResultsInView[0].id).toBe("w1");
  });

  it("should apply attribute filters such as dog friendly (allows_dogs)", () => {
    const dogFriendly = createMockWinery({ id: "w1" as GooglePlaceId, allows_dogs: true });
    const notDogFriendly = createMockWinery({ id: "w2" as GooglePlaceId, allows_dogs: false });
    const unknownDog = createMockWinery({ id: "w3" as GooglePlaceId, allows_dogs: null });

    useWineryStore.setState({
      persistentWineries: [dogFriendly, notDogFriendly, unknownDog],
    });

    useMapStore.setState({
      filter: ["allowsDogs"],
    });

    const { result } = renderHook(() => useWineryFilter());

    expect(result.current.listResultsInView).toHaveLength(1);
    expect(result.current.listResultsInView[0].id).toBe("w1");
  });

  it("should combine categories and attribute filters (e.g., favorites + allowsDogs)", () => {
    const favDog = createMockWinery({ id: "w1" as GooglePlaceId, isFavorite: true, allows_dogs: true });
    const favNoDog = createMockWinery({ id: "w2" as GooglePlaceId, isFavorite: true, allows_dogs: false });
    const dogNoFav = createMockWinery({ id: "w3" as GooglePlaceId, isFavorite: false, allows_dogs: true });

    useWineryStore.setState({
      persistentWineries: [favDog, favNoDog, dogNoFav],
    });

    useMapStore.setState({
      filter: ["favorites", "allowsDogs"],
    });

    const { result } = renderHook(() => useWineryFilter());

    expect(result.current.listResultsInView).toHaveLength(1);
    expect(result.current.listResultsInView[0].id).toBe("w1");
  });

  it("should correctly handle filter toggle selection changes in handleFilterChange", () => {
    const { result } = renderHook(() => useWineryFilter());

    act(() => {
      result.current.handleFilterChange(["all", "allowsDogs"]);
    });

    expect(useMapStore.getState().filter).toEqual(["all", "allowsDogs"]);

    act(() => {
      // Toggle category to 'visited' from 'all'
      result.current.handleFilterChange(["visited", "allowsDogs"]);
    });
    expect(useMapStore.getState().filter).toEqual(["visited", "allowsDogs"]);

    act(() => {
      // User clicks 'all' again while 'visited' and 'allowsDogs' is selected
      result.current.handleFilterChange(["all", "visited", "allowsDogs"]);
    });
    // Should clear the specific categories but keep attributes
    expect(useMapStore.getState().filter).toEqual(["all", "allowsDogs"]);
  });

  it("should filter mapWineries categories by active attributes", () => {
    const winery1 = createMockWinery({ id: "w1" as GooglePlaceId, isFavorite: true, allows_dogs: true });
    const winery2 = createMockWinery({ id: "w2" as GooglePlaceId, isFavorite: true, allows_dogs: false });
    
    useWineryStore.setState({
      persistentWineries: [winery1, winery2],
    });
    
    useMapStore.setState({
      filter: ["favorites", "allowsDogs"],
    });

    const { result } = renderHook(() => useWineryFilter());

    expect(result.current.mapWineries.favorites).toHaveLength(1);
    expect(result.current.mapWineries.favorites[0].id).toBe("w1");
  });

  // --- Phase 4 Task 1: Viewport List Unification & Vibe Tag Filtering Tests (TDD Red phase) ---

  describe("viewport list unification and user badge preservation", () => {
    it("should include both persistentWineries and searchResults in listResultsInView when searches are performed", () => {
      const winery1 = createMockWinery({ id: "w1" as GooglePlaceId, name: "Persisted Winery" });
      const winery2 = createMockWinery({ id: "w2" as GooglePlaceId, name: "Searched Winery" });

      useWineryStore.setState({
        persistentWineries: [winery1],
      });

      useMapStore.setState({
        searchResults: [winery2],
        filter: ["all"],
      });

      const { result } = renderHook(() => useWineryFilter());

      // listResultsInView must unify persisted and searched wineries in view
      expect(result.current.listResultsInView).toHaveLength(2);
      expect(result.current.listResultsInView.map((w) => w.id)).toEqual(
        expect.arrayContaining(["w1", "w2"])
      );
    });

    it("should filter out wineries outside viewport bounds for both persistent and search results", () => {
      // Coordinate inside bounding box [42.0 to 43.0 lat, -77.0 to -76.0 lng]
      const inBoundsPersisted = createMockWinery({
        id: "w1" as GooglePlaceId,
        latitude: 42.5,
        longitude: -76.5,
      });
      // Coordinate outside bounding box
      const outOfBoundsPersisted = createMockWinery({
        id: "w2" as GooglePlaceId,
        latitude: 44.0,
        longitude: -76.5,
      });
      // Searched winery inside bounding box
      const inBoundsSearch = createMockWinery({
        id: "w3" as GooglePlaceId,
        latitude: 42.6,
        longitude: -76.4,
      });
      // Searched winery outside bounding box
      const outOfBoundsSearch = createMockWinery({
        id: "w4" as GooglePlaceId,
        latitude: 40.0,
        longitude: -76.5,
      });

      useWineryStore.setState({
        persistentWineries: [inBoundsPersisted, outOfBoundsPersisted],
      });

      useMapStore.setState({
        searchResults: [inBoundsSearch, outOfBoundsSearch],
        bounds: { north: 43.0, south: 42.0, east: -76.0, west: -77.0 },
        filter: ["all"],
      });

      const { result } = renderHook(() => useWineryFilter());

      expect(result.current.listResultsInView).toHaveLength(2);
      expect(result.current.listResultsInView.map((w) => w.id)).toEqual(
        expect.arrayContaining(["w1", "w3"])
      );
    });

    it("should deduplicate wineries present in both persistentWineries and searchResults", () => {
      const persisted = createMockWinery({
        id: "w1" as GooglePlaceId,
        name: "Persisted Record",
        isFavorite: true,
      });
      const searchedDuplicate = createMockWinery({
        id: "w1" as GooglePlaceId,
        name: "Search Record",
        isFavorite: false,
      });

      useWineryStore.setState({
        persistentWineries: [persisted],
      });

      useMapStore.setState({
        searchResults: [searchedDuplicate],
        filter: ["all"],
      });

      const { result } = renderHook(() => useWineryFilter());

      expect(result.current.listResultsInView).toHaveLength(1);
      expect(result.current.listResultsInView[0].id).toBe("w1");
    });

    it("should preserve authoritative user badges (isFavorite, userVisited, onWishlist) in listResultsInView when searchResults has un-badged record", () => {
      const authoritativeWinery = createMockWinery({
        id: "w1" as GooglePlaceId,
        name: "Beloved Estate",
        isFavorite: true,
        userVisited: true,
        onWishlist: true,
      });
      const rawSearchWinery = createMockWinery({
        id: "w1" as GooglePlaceId,
        name: "Beloved Estate (Search)",
        isFavorite: false,
        userVisited: false,
        onWishlist: false,
      });

      useWineryStore.setState({
        persistentWineries: [authoritativeWinery],
      });

      useMapStore.setState({
        searchResults: [rawSearchWinery],
        filter: ["all"],
      });

      const { result } = renderHook(() => useWineryFilter());

      expect(result.current.listResultsInView).toHaveLength(1);
      const item = result.current.listResultsInView[0];
      expect(item.id).toBe("w1");
      expect(item.isFavorite).toBe(true);
      expect(item.userVisited).toBe(true);
      expect(item.onWishlist).toBe(true);
    });

    it("should respect category filtering ('favorites', 'visited', 'wantToGo', 'notVisited') when searchResults are present", () => {
      const favWinery = createMockWinery({
        id: "w_fav" as GooglePlaceId,
        isFavorite: true,
        userVisited: false,
        onWishlist: false,
      });
      const visitedWinery = createMockWinery({
        id: "w_visited" as GooglePlaceId,
        isFavorite: false,
        userVisited: true,
        onWishlist: false,
      });
      const wishlistWinery = createMockWinery({
        id: "w_wishlist" as GooglePlaceId,
        isFavorite: false,
        userVisited: false,
        onWishlist: true,
      });
      const searchedDiscovered = createMockWinery({
        id: "w_searched" as GooglePlaceId,
        isFavorite: false,
        userVisited: false,
        onWishlist: false,
      });

      useWineryStore.setState({
        persistentWineries: [favWinery, visitedWinery, wishlistWinery],
      });

      useMapStore.setState({
        searchResults: [searchedDiscovered],
        filter: ["favorites"],
      });

      const { result, rerender } = renderHook(() => useWineryFilter());

      // 1. Filter by favorites
      expect(result.current.listResultsInView).toHaveLength(1);
      expect(result.current.listResultsInView[0].id).toBe("w_fav");

      // 2. Filter by visited
      act(() => {
        useMapStore.setState({ filter: ["visited"] });
      });
      rerender();
      expect(result.current.listResultsInView).toHaveLength(1);
      expect(result.current.listResultsInView[0].id).toBe("w_visited");

      // 3. Filter by wantToGo (wishlist)
      act(() => {
        useMapStore.setState({ filter: ["wantToGo"] });
      });
      rerender();
      expect(result.current.listResultsInView).toHaveLength(1);
      expect(result.current.listResultsInView[0].id).toBe("w_wishlist");

      // 4. Filter by notVisited (discovered)
      act(() => {
        useMapStore.setState({ filter: ["notVisited"] });
      });
      rerender();
      expect(result.current.listResultsInView).toHaveLength(1);
      expect(result.current.listResultsInView[0].id).toBe("w_searched");
    });
  });

  describe("strict Vibe Tag filtering", () => {
    it("should strictly match Vibe Tags === true and exclude null (un-enriched) and false records across all Vibe Tags", () => {
      // Good for children tri-state
      const childTrue = createMockWinery({ id: "c_true" as GooglePlaceId, good_for_children: true });
      const childFalse = createMockWinery({ id: "c_false" as GooglePlaceId, good_for_children: false });
      const childNull = createMockWinery({ id: "c_null" as GooglePlaceId, good_for_children: null });

      // Outdoor seating tri-state
      const outdoorTrue = createMockWinery({ id: "o_true" as GooglePlaceId, outdoor_seating: true });
      const outdoorFalse = createMockWinery({ id: "o_false" as GooglePlaceId, outdoor_seating: false });
      const outdoorNull = createMockWinery({ id: "o_null" as GooglePlaceId, outdoor_seating: null });

      // EV charging tri-state
      const evTrue = createMockWinery({ id: "ev_true" as GooglePlaceId, has_ev_charging: true });
      const evFalse = createMockWinery({ id: "ev_false" as GooglePlaceId, has_ev_charging: false });
      const evNull = createMockWinery({ id: "ev_null" as GooglePlaceId, has_ev_charging: null });

      useWineryStore.setState({
        persistentWineries: [
          childTrue, childFalse, childNull,
          outdoorTrue, outdoorFalse, outdoorNull,
          evTrue, evFalse, evNull,
        ],
      });

      // Test goodForChildren
      useMapStore.setState({ filter: ["goodForChildren"] });
      const { result, rerender } = renderHook(() => useWineryFilter());
      expect(result.current.listResultsInView.map((w) => w.id)).toEqual(["c_true"]);

      // Test outdoorSeating
      act(() => {
        useMapStore.setState({ filter: ["outdoorSeating"] });
      });
      rerender();
      expect(result.current.listResultsInView.map((w) => w.id)).toEqual(["o_true"]);

      // Test hasEvCharging
      act(() => {
        useMapStore.setState({ filter: ["hasEvCharging"] });
      });
      rerender();
      expect(result.current.listResultsInView.map((w) => w.id)).toEqual(["ev_true"]);
    });

    it("should filter by multiple Vibe Tags using strict conjunction (AND), excluding records with null or false for any selected tag", () => {
      const matchAll = createMockWinery({
        id: "w_all" as GooglePlaceId,
        allows_dogs: true,
        outdoor_seating: true,
        has_ev_charging: true,
      });
      const missingDog = createMockWinery({
        id: "w_no_dog" as GooglePlaceId,
        allows_dogs: null,
        outdoor_seating: true,
        has_ev_charging: true,
      });
      const falseDog = createMockWinery({
        id: "w_false_dog" as GooglePlaceId,
        allows_dogs: false,
        outdoor_seating: true,
        has_ev_charging: true,
      });
      const missingOutdoor = createMockWinery({
        id: "w_no_outdoor" as GooglePlaceId,
        allows_dogs: true,
        outdoor_seating: null,
        has_ev_charging: true,
      });

      useWineryStore.setState({
        persistentWineries: [matchAll, missingDog, falseDog, missingOutdoor],
      });

      useMapStore.setState({
        filter: ["allowsDogs", "outdoorSeating", "hasEvCharging"],
      });

      const { result } = renderHook(() => useWineryFilter());

      expect(result.current.listResultsInView).toHaveLength(1);
      expect(result.current.listResultsInView[0].id).toBe("w_all");
    });

    it("should apply Vibe Tag filters across unified persistent and search results", () => {
      const persistedDog = createMockWinery({
        id: "w_p_dog" as GooglePlaceId,
        allows_dogs: true,
      });
      const persistedNoDog = createMockWinery({
        id: "w_p_nodog" as GooglePlaceId,
        allows_dogs: false,
      });
      const searchedDog = createMockWinery({
        id: "w_s_dog" as GooglePlaceId,
        allows_dogs: true,
      });
      const searchedUnenriched = createMockWinery({
        id: "w_s_null" as GooglePlaceId,
        allows_dogs: null,
      });

      useWineryStore.setState({
        persistentWineries: [persistedDog, persistedNoDog],
      });

      useMapStore.setState({
        searchResults: [searchedDog, searchedUnenriched],
        filter: ["allowsDogs"],
      });

      const { result } = renderHook(() => useWineryFilter());

      // Both persisted and searched wineries with allows_dogs === true must be included
      expect(result.current.listResultsInView).toHaveLength(2);
      expect(result.current.listResultsInView.map((w) => w.id)).toEqual(
        expect.arrayContaining(["w_p_dog", "w_s_dog"])
      );
    });
  });
});
