import { renderHook, act } from "@testing-library/react";
import { useWinerySearch } from "../use-winery-search";
import { useMapStore } from "@/lib/stores/mapStore";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { createClient } from "@/utils/supabase/client";

// Mock dependencies
jest.mock("@vis.gl/react-google-maps", () => ({
  useMapsLibrary: jest.fn(),
}));

// Mock google maps
(global as any).google = {
  maps: {
    Geocoder: jest.fn().mockImplementation(() => ({
      geocode: jest.fn(),
    })),
    LatLngBounds: jest.fn().mockImplementation((sw) => {
      const result = {
        getSouthWest: jest.fn().mockReturnValue({ lat: () => 0, lng: () => 0 }),
        getNorthEast: jest.fn().mockReturnValue({ lat: () => 0, lng: () => 0 }),
        contains: jest.fn(),
      };
      if (sw && sw.getSouthWest) {
        result.getSouthWest = sw.getSouthWest;
        result.getNorthEast = sw.getNorthEast;
      }
      return result;
    }),
    places: {
      Place: {
        searchByText: jest.fn(),
      },
    },
  },
};

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

describe("useWinerySearch", () => {
  let mockMap: any;
  let mockPlaces: any;
  let mockGeocoder: any;
  let mockSupabase: any;

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
              getSouthWest: () => ({ lat: () => 0, lng: () => 0 }),
              getNorthEast: () => ({ lat: () => 0, lng: () => 0 }),
            },
            location: {
                lat: () => 0,
                lng: () => 0
            }
          }
        }]
      }),
    };

    (global as any).google.maps.Geocoder.mockImplementation(() => mockGeocoder);

    mockSupabase = {
      rpc: jest.fn(),
    };

    (useMapsLibrary as jest.Mock).mockImplementation((lib) => {
      if (lib === "places") return mockPlaces;
      if (lib === "geocoding") return mockGeocoder;
      return null;
    });

    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    // Initial store state
    useMapStore.setState({
      map: mockMap,
      isSearching: false,
      searchResults: [],
      error: null,
    });
  });

  it("should set store error when both cache and Google search fail", async () => {
    // 1. Mock cache failure (Supabase RPC returns error or empty)
    mockSupabase.rpc.mockResolvedValue({ data: null, error: new Error("DB Error") });

    // 2. Mock Google search failure
    mockPlaces.Place.searchByText.mockRejectedValue(new Error("Google Error"));

    const { result } = renderHook(() => useWinerySearch());

    console.log("CALLING EXECUTE SEARCH");
    await act(async () => {
      await result.current.executeSearch("Some Area");
    });
    console.log("DONE CALLING EXECUTE SEARCH");

    // Verify that error is set in the store
    // NOTE: This will fail because 'setError' doesn't exist and 'error' isn't being set yet.
    const state = useMapStore.getState();
    expect(state.error).toBe("Failed to find wineries in this area. Please check your connection and try again.");
  });
});
