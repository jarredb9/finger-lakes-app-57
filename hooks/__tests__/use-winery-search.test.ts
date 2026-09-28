import { renderHook, act } from "@testing-library/react";
import { useWinerySearch } from "../use-winery-search";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { getGoogleLibrary } from "@/lib/utils/google-maps-loader";
import { createClient } from "@/utils/supabase/client";

// Mock dependencies
jest.mock("@/lib/utils/google-maps-loader", () => ({
  getGoogleLibrary: jest.fn(),
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
  let mockPlaces: any;
  let mockGeocoder: any;
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

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

    (getGoogleLibrary as jest.Mock).mockImplementation((lib) => {
      if (lib === "places") return Promise.resolve(mockPlaces);
      if (lib === "geocoding") return Promise.resolve(mockGeocoder);
      return Promise.resolve(null);
    });

    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    // Initial store state
    useWineryStore.getState().reset();
    useMapStore.setState({
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

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    console.log("CALLING EXECUTE SEARCH");
    await act(async () => {
      await result.current.executeSearch("Some Area");
    });
    console.log("DONE CALLING EXECUTE SEARCH");

    // Verify that error is set in the store
    const state = useMapStore.getState();
    expect(state.error).toBe("Failed to find wineries in this area. Please check your connection and try again.");
  });

  it("should fallback to cached wineries in viewport when search service fails", async () => {
    const cachedWinery = {
      id: "cached-winery-1" as any,
      name: "Cached Winery",
      address: "123 Wine Trail",
      latitude: 0,
      longitude: 0,
      visits: [],
    };
    useWineryStore.setState({
      persistentWineries: [cachedWinery],
    });

    const { result } = renderHook(() => useWinerySearch());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.executeSearch("Some Area");
    });

    const state = useMapStore.getState();
    expect(state.searchResults).toEqual([cachedWinery]);
    expect(state.error).toBe("Unable to reach live search service. Displaying cached wineries for this area.");
  });
});
