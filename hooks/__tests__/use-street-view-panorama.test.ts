import { renderHook, act } from "@testing-library/react";
import { useStreetViewPanorama } from "../use-street-view-panorama";
import { useMapStore } from "@/lib/stores/mapStore";
import * as googleLoader from "@/lib/utils/google-maps-loader";

jest.mock("@/lib/utils/google-maps-loader");

describe("useStreetViewPanorama Hook", () => {
  let mockPanorama: any;
  let mockStreetViewLib: any;
  let visibleChangedListener: Function | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    useMapStore.getState().reset();
    visibleChangedListener = null;

    mockPanorama = {
      setPosition: jest.fn(),
      setVisible: jest.fn(),
      getVisible: jest.fn().mockReturnValue(false),
      addListener: jest.fn().mockImplementation((event: string, cb: Function) => {
        if (event === "visible_changed") {
          visibleChangedListener = cb;
        }
      }),
    };

    mockStreetViewLib = {
      StreetViewPanorama: jest.fn().mockImplementation(() => mockPanorama),
    };

    (googleLoader.getGoogleLibrary as jest.Mock).mockResolvedValue(mockStreetViewLib);
  });

  it("initializes with isStreetViewActive false and container ref", () => {
    const { result } = renderHook(() => useStreetViewPanorama());

    expect(result.current.isStreetViewActive).toBe(false);
    expect(result.current.containerRef).toBeDefined();
    expect(typeof result.current.openStreetView).toBe("function");
  });

  it("creates panorama and sets active when openStreetView is called", async () => {
    const { result } = renderHook(() => useStreetViewPanorama());

    // Mock DOM node attached to ref
    const div = document.createElement("div");
    (result.current.containerRef as any).current = div;

    await act(async () => {
      await result.current.openStreetView(42.5, -76.8);
    });

    expect(googleLoader.getGoogleLibrary).toHaveBeenCalledWith("streetView");
    expect(mockStreetViewLib.StreetViewPanorama).toHaveBeenCalledWith(div, {
      position: { lat: 42.5, lng: -76.8 },
      visible: true,
      enableCloseButton: true,
    });
    expect(useMapStore.getState().isStreetViewActive).toBe(true);
  });

  it("reuses existing panorama instance on subsequent openStreetView calls", async () => {
    const { result } = renderHook(() => useStreetViewPanorama());

    const div = document.createElement("div");
    (result.current.containerRef as any).current = div;

    await act(async () => {
      await result.current.openStreetView(42.5, -76.8);
    });

    expect(mockStreetViewLib.StreetViewPanorama).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.openStreetView(43.1, -77.2);
    });

    expect(mockStreetViewLib.StreetViewPanorama).toHaveBeenCalledTimes(1);
    expect(mockPanorama.setPosition).toHaveBeenCalledWith({ lat: 43.1, lng: -77.2 });
    expect(mockPanorama.setVisible).toHaveBeenCalledWith(true);
  });

  it("synchronizes isStreetViewActive when panorama visible_changed event fires", async () => {
    const { result } = renderHook(() => useStreetViewPanorama());

    const div = document.createElement("div");
    (result.current.containerRef as any).current = div;

    await act(async () => {
      await result.current.openStreetView(42.5, -76.8);
    });

    expect(visibleChangedListener).not.toBeNull();

    // Simulate closing panorama via close button
    mockPanorama.getVisible.mockReturnValue(false);
    act(() => {
      if (visibleChangedListener) visibleChangedListener();
    });

    expect(useMapStore.getState().isStreetViewActive).toBe(false);
  });
});
