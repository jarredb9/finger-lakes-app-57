import { renderHook, act } from "@testing-library/react";
import { useWineryFilter } from "../use-winery-filter";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
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

    useWineryDataStore.setState({
      persistentWineries: [],
    });

    useTripStore.setState({
      selectedTrip: null,
    });
  });

  it("should return all wineries when filter is 'all'", () => {
    const winery1 = createMockWinery({ id: "w1" as GooglePlaceId, isFavorite: true });
    const winery2 = createMockWinery({ id: "w2" as GooglePlaceId, userVisited: true });
    
    useWineryDataStore.setState({
      persistentWineries: [winery1, winery2],
    });

    const { result } = renderHook(() => useWineryFilter());

    expect(result.current.listResultsInView).toHaveLength(2);
    expect(result.current.listResultsInView).toContainEqual(winery1);
    expect(result.current.listResultsInView).toContainEqual(winery2);
  });

  it("should filter by category 'favorites'", () => {
    const winery1 = createMockWinery({ id: "w1" as GooglePlaceId, isFavorite: true });
    const winery2 = createMockWinery({ id: "w2" as GooglePlaceId, userVisited: true });
    
    useWineryDataStore.setState({
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

    useWineryDataStore.setState({
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

    useWineryDataStore.setState({
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
});
