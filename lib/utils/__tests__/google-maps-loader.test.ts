import {
  isMockGoogleMapsKey,
  getGoogleLibrary,
  loadGoogleMaps,
  __resetGoogleMapsLoaderStateForTesting,
} from "../google-maps-loader";
import * as jsApiLoader from "@googlemaps/js-api-loader";

jest.mock("@googlemaps/js-api-loader", () => ({
  setOptions: jest.fn(),
  importLibrary: jest.fn(),
}));

describe("google-maps-loader", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete (window as any).google;
    delete (window as any)._E2E_MOCKS_ACTIVE;
    if (typeof __resetGoogleMapsLoaderStateForTesting === "function") {
      __resetGoogleMapsLoaderStateForTesting();
    }
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("isMockGoogleMapsKey", () => {
    it("classifies e2e-mock-google-maps-key as mock", () => {
      expect(isMockGoogleMapsKey("e2e-mock-google-maps-key")).toBe(true);
    });

    it("classifies keys starting with e2e-mock or mock- as mock", () => {
      expect(isMockGoogleMapsKey("e2e-mock-token-123")).toBe(true);
      expect(isMockGoogleMapsKey("mock-api-key")).toBe(true);
    });

    it("classifies empty or undefined key as mock", () => {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      expect(isMockGoogleMapsKey("")).toBe(true);
      expect(isMockGoogleMapsKey(undefined)).toBe(true);
    });

    it("classifies real Google Maps API keys as non-mock", () => {
      expect(isMockGoogleMapsKey("AIzaSyD-1234567890abcdef")).toBe(false);
    });

    it("falls back to process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY when no argument is supplied", () => {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "e2e-mock-google-maps-key";
      expect(isMockGoogleMapsKey()).toBe(true);

      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "AIzaSyD-real-production-key";
      expect(isMockGoogleMapsKey()).toBe(false);
    });
  });

  describe("getGoogleLibrary in Mock / E2E mode", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "e2e-mock-google-maps-key";
      process.env.NEXT_PUBLIC_IS_E2E = "true";
    });

    it("returns in-memory mock library for 'maps' without invoking @googlemaps/js-api-loader", async () => {
      const mapsLib = await getGoogleLibrary("maps");

      expect(jsApiLoader.importLibrary).not.toHaveBeenCalled();
      expect(mapsLib).toBeDefined();
      expect(mapsLib.Map).toBeDefined();

      const container = document.createElement("div");
      const map = new mapsLib.Map(container, {
        center: { lat: 42.7, lng: -76.9 },
        zoom: 9,
      });

      expect(map).toBeDefined();
      expect(map.getZoom()).toBe(9);
      expect(map.getCenter().lat()).toBe(42.7);
      expect(map.getCenter().lng()).toBe(-76.9);

      const bounds = map.getBounds();
      expect(bounds.getNorthEast().lat()).toBe(43.0);
      expect(bounds.getSouthWest().lat()).toBe(42.0);

      // Verify attached to window.google.maps
      expect((window as any).google?.maps?.Map).toBeDefined();
      expect((window as any).google?.maps?.LatLngBounds).toBeDefined();
    });

    it("returns in-memory mock library for 'marker' without network request", async () => {
      const markerLib = await getGoogleLibrary("marker");

      expect(jsApiLoader.importLibrary).not.toHaveBeenCalled();
      expect(markerLib.AdvancedMarkerElement).toBeDefined();
      expect(markerLib.PinElement).toBeDefined();

      const marker = new markerLib.AdvancedMarkerElement({
        position: { lat: 42.7, lng: -76.9 },
        title: "Test Marker",
      });
      expect(marker.title).toBe("Test Marker");

      const handler = jest.fn();
      marker.addEventListener("gmp-click", handler);
      marker.removeEventListener("gmp-click", handler);
    });

    it("returns in-memory mock library for 'places' and 'geocoding'", async () => {
      const placesLib = await getGoogleLibrary("places");
      expect(placesLib.AutocompleteSessionToken).toBeDefined();

      const token = new placesLib.AutocompleteSessionToken();
      expect(token).toBeDefined();
      expect(token.id).toBeDefined();

      expect(placesLib.AutocompleteSuggestion).toBeDefined();
      expect(placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions).toBeDefined();

      const res = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: "Mock Winery",
      });
      expect(res.suggestions).toBeDefined();
      expect(res.suggestions.length).toBeGreaterThan(0);

      const first = res.suggestions[0];
      expect(first.placePrediction).toBeDefined();
      expect(first.placePrediction.text.text).toContain("Mock Winery One");
      expect(first.placePrediction.mainText.text).toBe("Mock Winery One");
      expect(first.placePrediction.toPlace).toBeDefined();

      const place = first.placePrediction.toPlace();
      expect(place).toBeDefined();
      expect(place.id).toBe("ch-12345-mock-winery-1");
      expect(place.displayName).toBe("Mock Winery One");
      expect(place.formattedAddress).toBe("123 Vineyard Way, NY");
      expect(place.location.lat()).toBe(42.5);
      expect(place.location.lng()).toBe(-76.8);
      expect(place.location.latitude).toBe(42.5);
      expect(place.location.longitude).toBe(-76.8);

      const fetched = await place.fetchFields({ fields: ["displayName", "location"] });
      expect(fetched).toBe(place);

      const geocodingLib = await getGoogleLibrary("geocoding");
      expect(geocodingLib.Geocoder).toBeDefined();
    });

    it("prefers existing window.google.maps.importLibrary if present", async () => {
      const customMock = { Map: class CustomMap {} };
      (window as any).google = {
        maps: {
          importLibrary: jest.fn().mockResolvedValue(customMock),
        },
      };

      const result = await getGoogleLibrary("maps");
      expect(result).toBe(customMock);
      expect((window as any).google.maps.importLibrary).toHaveBeenCalledWith("maps");
    });
  });

  describe("getGoogleLibrary in Production mode", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "AIzaSyRealValidKey12345";
      delete process.env.NEXT_PUBLIC_IS_E2E;
    });

    it("calls @googlemaps/js-api-loader importLibrary when valid key is present", async () => {
      const liveMockLib = { Map: class LiveMap {} };
      (jsApiLoader.importLibrary as jest.Mock).mockResolvedValueOnce(liveMockLib);

      const result = await getGoogleLibrary("maps");
      expect(jsApiLoader.importLibrary).toHaveBeenCalledWith("maps");
      expect(result).toBe(liveMockLib);
    });

    it("falls back gracefully without throwing when @googlemaps/js-api-loader rejects", async () => {
      (jsApiLoader.importLibrary as jest.Mock).mockRejectedValueOnce(
        new Error("NetworkError: Failed to fetch")
      );

      const result = await getGoogleLibrary("maps");
      expect(result).toBeDefined();
      expect(result.Map).toBeDefined();
    });
  });

  describe("loadGoogleMaps", () => {
    it("returns mock core library in mock mode without network calls", async () => {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "e2e-mock-google-maps-key";
      const result = await loadGoogleMaps();
      expect(jsApiLoader.importLibrary).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
