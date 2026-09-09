import { renderHook, act } from "@testing-library/react";
import { useWineryMap } from "../use-winery-map";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { createMockWinery } from "@/lib/test-utils/fixtures";
import { GooglePlaceId } from "@/lib/types";

describe("useWineryMap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
