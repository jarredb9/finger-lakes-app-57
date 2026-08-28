import { renderHook, act } from "@testing-library/react";
import { useStreetViewPanorama } from "../use-street-view-panorama";
import { useMapStore } from "@/lib/stores/mapStore";

describe("useStreetViewPanorama Hook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useMapStore.getState().reset();
    window.open = jest.fn();
  });

  it("initializes with isStreetViewActive false and openStreetView function", () => {
    const { result } = renderHook(() => useStreetViewPanorama());

    expect(result.current.isStreetViewActive).toBe(false);
    expect(typeof result.current.openStreetView).toBe("function");
  });

  it("launches Google Maps Universal URL when openStreetView is called", () => {
    const { result } = renderHook(() => useStreetViewPanorama());

    act(() => {
      result.current.openStreetView(42.5367, -76.9248);
    });

    expect(window.open).toHaveBeenCalledWith(
      "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=42.5367,-76.9248",
      "_blank",
      "noopener,noreferrer"
    );
  });
});
