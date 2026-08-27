import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GoogleMapFallback } from "../google-map-fallback";
import { useMapStore } from "@/lib/stores/mapStore";
import * as googleLoader from "@/lib/utils/google-maps-loader";
import { Winery } from "@/lib/types";

jest.mock("@/lib/utils/google-maps-loader");

describe("GoogleMapFallback Component", () => {
  let mockGmap: any;
  let mockMapsLib: any;
  let mockMarkerLib: any;
  let mockMarker: any;
  let markerClickHandler: Function | null = null;

  const sampleWinery: Winery = {
    id: "winery-1" as any,
    name: "Fox Run Vineyards",
    address: "670 NY-14, Penn Yan, NY 14527",
    latitude: 42.7123,
    longitude: -76.9987,
    phone: "315-536-4616",
    website: "https://foxrunvineyards.com",
    rating: 4.7,
    userRatingCount: 500,
    visits: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useMapStore.getState().reset();
    markerClickHandler = null;

    mockGmap = {
      setMapTypeId: jest.fn(),
      getStreetView: jest.fn().mockReturnValue(null),
      getZoom: jest.fn().mockReturnValue(9),
      setZoom: jest.fn(),
      setCenter: jest.fn(),
      addListener: jest.fn(),
    };

    mockMapsLib = {
      Map: jest.fn().mockImplementation(() => mockGmap),
      Marker: jest.fn().mockImplementation(() => ({
        setMap: jest.fn(),
        addListener: jest.fn(),
      })),
    };

    mockMarker = {
      setMap: jest.fn(),
      addEventListener: jest.fn().mockImplementation((event: string, handler: Function) => {
        if (event === "gmp-click") {
          markerClickHandler = handler;
        }
      }),
    };

    mockMarkerLib = {
      PinElement: jest.fn().mockImplementation(() => ({})),
      AdvancedMarkerElement: jest.fn().mockImplementation(() => mockMarker),
    };

    (googleLoader.getGoogleLibrary as jest.Mock).mockImplementation((lib: string) => {
      if (lib === "maps") return Promise.resolve(mockMapsLib);
      if (lib === "marker") return Promise.resolve(mockMarkerLib);
      return Promise.resolve({});
    });
  });

  it("renders container with data-testid and stable DOM structure", async () => {
    render(
      <GoogleMapFallback
        discoveredWineries={[sampleWinery]}
        visitedWineries={[]}
        wishlistWineries={[]}
        favoriteWineries={[]}
        filter={["all"]}
        onMarkerClick={jest.fn()}
      />
    );

    expect(screen.getByTestId("google-map-fallback")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /outdoors/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /streets/i })).toBeInTheDocument();
  });

  it("initializes Google Map and registers adapter with useMapStore", async () => {
    render(
      <GoogleMapFallback
        discoveredWineries={[sampleWinery]}
        visitedWineries={[]}
        wishlistWineries={[]}
        favoriteWineries={[]}
        filter={["all"]}
        onMarkerClick={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(mockMapsLib.Map).toHaveBeenCalled();
      expect(useMapStore.getState().map).not.toBeNull();
    });
  });

  it("renders markers and triggers onMarkerClick on marker interaction", async () => {
    const onMarkerClick = jest.fn();

    render(
      <GoogleMapFallback
        discoveredWineries={[sampleWinery]}
        visitedWineries={[]}
        wishlistWineries={[]}
        favoriteWineries={[]}
        filter={["all"]}
        onMarkerClick={onMarkerClick}
      />
    );

    await waitFor(() => {
      expect(mockMarkerLib.AdvancedMarkerElement).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Fox Run Vineyards",
          position: { lat: 42.7123, lng: -76.9987 },
        })
      );
    });

    expect(markerClickHandler).not.toBeNull();
    if (markerClickHandler) markerClickHandler();

    expect(onMarkerClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "winery-1",
        name: "Fox Run Vineyards",
      })
    );
  });

  it("toggles map style between outdoors (terrain) and streets (roadmap)", async () => {
    render(
      <GoogleMapFallback
        discoveredWineries={[sampleWinery]}
        visitedWineries={[]}
        wishlistWineries={[]}
        favoriteWineries={[]}
        filter={["all"]}
        onMarkerClick={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(mockMapsLib.Map).toHaveBeenCalled();
    });

    const outdoorsBtn = screen.getByRole("button", { name: /outdoors/i });
    fireEvent.click(outdoorsBtn);

    expect(mockGmap.setMapTypeId).toHaveBeenCalledWith("terrain");

    const streetsBtn = screen.getByRole("button", { name: /streets/i });
    fireEvent.click(streetsBtn);

    expect(mockGmap.setMapTypeId).toHaveBeenCalledWith("roadmap");
  });
});
