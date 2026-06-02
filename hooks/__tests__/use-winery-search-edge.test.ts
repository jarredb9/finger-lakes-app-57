import { renderHook, act } from "@testing-library/react";
import { useWinerySearch } from "../use-winery-search";
import { useMapStore } from "@/lib/stores/mapStore";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { invokeFunction } from "@/lib/utils";

// Mock dependencies
jest.mock("@vis.gl/react-google-maps", () => ({
  useMapsLibrary: jest.fn(),
}));

jest.mock("@/lib/utils", () => ({
  ...jest.requireActual("@/lib/utils"),
  invokeFunction: jest.fn(),
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// Mock google maps
(global as any).google = {
  maps: {
    Geocoder: jest.fn().mockImplementation(() => ({
      geocode: jest.fn(),
    })),
    LatLngBounds: jest.fn().mockImplementation((sw, ne) => {
      return {
        getSouthWest: jest.fn().mockReturnValue(sw || { lat: () => 0, lng: () => 0 }),
        getNorthEast: jest.fn().mockReturnValue(ne || { lat: () => 0, lng: () => 0 }),
        contains: jest.fn(),
      };
    }),
  },
};

describe("useWinerySearch (Edge Function Integration)", () => {
  let mockMap: any;
  let mockPlaces: any;
  let mockGeocoder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockMap = {
      getZoom: jest.fn().mockReturnValue(10),
      fitBounds: jest.fn(),
      setCenter: jest.fn(),
      setZoom: jest.fn(),
    };

    mockPlaces = {
      Place: {
        searchByText: jest.fn(),
      },
    };

    mockGeocoder = {
      geocode: jest.fn().mockResolvedValue({
        results: [{
          geometry: {
            viewport: {
              getSouthWest: () => ({ lat: () => 42.1, lng: () => -77.1 }),
              getNorthEast: () => ({ lat: () => 42.9, lng: () => -76.1 }),
            },
          }
        }]
      }),
    };

    (useMapsLibrary as jest.Mock).mockImplementation((lib) => {
      if (lib === "places") return mockPlaces;
      if (lib === "geocoding") return mockGeocoder;
      return null;
    });

    (google.maps.Geocoder as jest.Mock).mockImplementation(() => mockGeocoder);

    // Initial store state
    useMapStore.setState({
      map: mockMap,
      isSearching: false,
      searchResults: [],
      error: null,
      filter: ['all'],
    });
  });

  it("should call search-wineries Edge Function via invokeFunction", async () => {
    (invokeFunction as jest.Mock).mockResolvedValue({
      data: [
        { id: '1', name: 'Winery A', latitude: 42.5, longitude: -76.5 }
      ],
      error: null
    });

    const { result } = renderHook(() => useWinerySearch());

    await act(async () => {
      await result.current.executeSearch("Some Area");
    });

    // Verify invokeFunction was called instead of direct Google SDK
    expect(invokeFunction).toHaveBeenCalledWith('search-wineries', expect.objectContaining({
      body: expect.objectContaining({
        query: expect.any(String),
        locationRestriction: expect.anything()
      })
    }));

    // Verify search results are updated in store
    const state = useMapStore.getState();
    expect(state.searchResults).toHaveLength(1);
    expect(state.searchResults[0].name).toBe('Winery A');
  });

  it("should pass useEnrichment: true if filters requiring enrichment are active", async () => {
    useMapStore.setState({ filter: ['allowsDogs'] });
    
    (invokeFunction as jest.Mock).mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useWinerySearch());

    await act(async () => {
      await result.current.executeSearch(undefined, {
        east: -76.1, west: -77.1, north: 42.9, south: 42.1
      });
    });

    expect(invokeFunction).toHaveBeenCalledWith('search-wineries', expect.objectContaining({
      body: expect.objectContaining({
        useEnrichment: true
      })
    }));
  });
});
