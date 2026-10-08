import { renderHook, act } from "@testing-library/react";
import { useWineryMap } from "../use-winery-map";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { createMockWinery } from "@/lib/test-utils/fixtures";
import { GooglePlaceId } from "@/lib/types";

import { useMap } from "react-map-gl/mapbox";

jest.mock("react-map-gl/mapbox", () => ({
  useMap: jest.fn(),
}));

describe("useWineryMap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useMap as jest.Mock).mockReturnValue(undefined);
    useMapStore.getState().reset();
    useWineryStore.getState().reset();
    useUIStore.getState().reset();
  });

  it("should initialize and register listeners on mapInstance", () => {
    const { result } = renderHook(() => useWineryMap(""));

    expect(result.current).toBeDefined();
    expect(result.current.handlePlaceSelect).toBeDefined();
    expect(result.current.handleOpenModal).toBeDefined();
  });

  it("should immediately open winery modal and upsert winery on handlePlaceSelect", async () => {
    const { result } = renderHook(() => useWineryMap(""));
    const mockWinery = createMockWinery({
      id: "ChIJ_test_winery" as GooglePlaceId,
      name: "Dr. Konstantin Frank",
      latitude: 42.5,
      longitude: -77.1,
    });

    await act(async () => {
      await result.current.handlePlaceSelect(mockWinery, {
        types: ["food", "point_of_interest", "establishment"],
      });
    });

    // Verify winery is stored in persistent cache
    const stored = useWineryStore.getState().getWinery("ChIJ_test_winery");
    expect(stored).toBeDefined();
    expect(stored?.name).toBe("Dr. Konstantin Frank");

    // Allow small UX delay timer (150ms) to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Verify modal is opened
    expect(useUIStore.getState().isWineryModalOpen).toBe(true);
    expect(useUIStore.getState().activeWineryId).toBe("ChIJ_test_winery");
  });

  it("should handle open modal for winery pins directly", async () => {
    const { result } = renderHook(() => useWineryMap(""));
    const mockWinery = createMockWinery({
      id: "pin-winery-1" as GooglePlaceId,
      name: "Boundary Breaks",
    });

    await act(async () => {
      await result.current.handleOpenModal(mockWinery);
    });

    expect(useUIStore.getState().isWineryModalOpen).toBe(true);
    expect(useUIStore.getState().activeWineryId).toBe("pin-winery-1");
  });

  it("should clear map error when map movement occurs", () => {
    const mockMapInstance = {
      on: jest.fn(),
      off: jest.fn(),
      getBounds: jest.fn().mockReturnValue({
        north: 43,
        south: 42,
        east: -76,
        west: -77,
      }),
      getZoom: jest.fn().mockReturnValue(10),
    };

    (useMap as jest.Mock).mockReturnValue({
      current: mockMapInstance,
    });

    useMapStore.setState({ error: "Failed to find wineries in this area." });
    expect(useMapStore.getState().error).toBe("Failed to find wineries in this area.");

    renderHook(() => useWineryMap(""));

    // Movement handler is invoked on mount, which auto-dismisses previous error
    expect(useMapStore.getState().error).toBeNull();
  });

  it("seeds lastSearchedBounds from currentBounds on initial map mount if not previously set", () => {
    const mockMapInstance = {
      on: jest.fn(),
      off: jest.fn(),
      getBounds: jest.fn().mockReturnValue({
        north: 43,
        south: 42,
        east: -76,
        west: -77,
      }),
      getZoom: jest.fn().mockReturnValue(10),
    };

    (useMap as jest.Mock).mockReturnValue({
      current: mockMapInstance,
    });

    expect(useMapStore.getState().lastSearchedBounds).toBeNull();

    renderHook(() => useWineryMap(""));

    // On initial mount, lastSearchedBounds must be seeded with initial map bounds
    expect(useMapStore.getState().lastSearchedBounds).toEqual({
      north: 43,
      south: 42,
      east: -76,
      west: -77,
    });
  });
});
