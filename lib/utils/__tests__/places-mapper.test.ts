import {
  extractLatitude,
  extractLongitude,
  mapSdkPlaceToV1Place,
} from "../places-mapper";
import { standardizeWineryData } from "../winery";

describe("places-mapper", () => {
  describe("extractLatitude & extractLongitude", () => {
    it("extracts coordinates from SDK LatLng functions", () => {
      const place = {
        location: {
          lat: () => 42.8765,
          lng: () => -76.9876,
        },
      };

      expect(extractLatitude(place)).toBe(42.8765);
      expect(extractLongitude(place)).toBe(-76.9876);
    });

    it("extracts coordinates from object properties (latitude/longitude)", () => {
      const place = {
        location: {
          latitude: 42.1234,
          longitude: -77.5678,
        },
      };

      expect(extractLatitude(place)).toBe(42.1234);
      expect(extractLongitude(place)).toBe(-77.5678);
    });

    it("extracts coordinates from object properties (lat/lng numbers)", () => {
      const place = {
        location: {
          lat: 42.4321,
          lng: -76.1234,
        },
      };

      expect(extractLatitude(place)).toBe(42.4321);
      expect(extractLongitude(place)).toBe(-76.1234);
    });

    it("extracts coordinates from legacy geometry.location (functions and properties)", () => {
      const placeFn = {
        geometry: {
          location: {
            lat: () => 42.5555,
            lng: () => -76.4444,
          },
        },
      };

      expect(extractLatitude(placeFn)).toBe(42.5555);
      expect(extractLongitude(placeFn)).toBe(-76.4444);

      const placeProp = {
        geometry: {
          location: {
            lat: 42.6666,
            lng: -76.3333,
          },
        },
      };

      expect(extractLatitude(placeProp)).toBe(42.6666);
      expect(extractLongitude(placeProp)).toBe(-76.3333);
    });

    it("extracts flat coordinates from top-level properties", () => {
      const place = {
        latitude: 42.7777,
        longitude: -76.2222,
      };

      expect(extractLatitude(place)).toBe(42.7777);
      expect(extractLongitude(place)).toBe(-76.2222);
    });

    it("returns 0 safely when location is missing or undefined", () => {
      expect(extractLatitude(null)).toBe(0);
      expect(extractLongitude(null)).toBe(0);
      expect(extractLatitude({})).toBe(0);
      expect(extractLongitude({})).toBe(0);
    });
  });

  describe("mapSdkPlaceToV1Place", () => {
    it("maps basic SDK place properties to V1 intermediate representation", () => {
      const mockSdkPlace = {
        id: "ChIJ1234567890",
        displayName: "Boundary Breaks Vineyard",
        formattedAddress: "1568 Porter Covert Rd, Lodi, NY 14860",
        location: {
          lat: () => 42.6105,
          lng: () => -76.8456,
        },
        nationalPhoneNumber: "(607) 532-4211",
        websiteUri: "https://boundarybreaks.com",
        rating: 4.8,
        userRatingCount: 250,
        allowsDogs: true,
        servesWine: true,
        isGoodForChildren: false,
        hasOutdoorSeating: true,
      };

      const result = mapSdkPlaceToV1Place(mockSdkPlace, "Fallback Name", "2026-08-26T12:00:00.000Z");

      expect(result).toEqual(
        expect.objectContaining({
          google_place_id: "ChIJ1234567890",
          name: "Boundary Breaks Vineyard",
          address: "1568 Porter Covert Rd, Lodi, NY 14860",
          latitude: 42.6105,
          longitude: -76.8456,
          phone: "(607) 532-4211",
          website: "https://boundarybreaks.com",
          google_rating: 4.8,
          user_rating_count: 250,
          allows_dogs: true,
          serves_wine: true,
          good_for_children: false,
          outdoor_seating: true,
          enrichment_tier: "enriched",
          last_enriched_at: "2026-08-26T12:00:00.000Z",
        })
      );
    });

    it("handles displayName as an object with text property", () => {
      const mockSdkPlace = {
        id: "ChIJ_TEST",
        displayName: { text: "Lamoreaux Landing Wine Cellars" },
      };

      const result = mapSdkPlaceToV1Place(mockSdkPlace);
      expect(result.name).toBe("Lamoreaux Landing Wine Cellars");
    });

    it("falls back to fallbackText when displayName is missing", () => {
      const mockSdkPlace = {
        id: "ChIJ_TEST",
      };

      const result = mapSdkPlaceToV1Place(mockSdkPlace, "Dr. Konstantin Frank Winery");
      expect(result.name).toBe("Dr. Konstantin Frank Winery");
    });

    it("normalizes photos into primary_photo_reference and photo_references", () => {
      const mockSdkPlace = {
        id: "ChIJ_TEST",
        photos: [
          { name: "places/ChIJ_TEST/photos/photo1" },
          { name: "places/ChIJ_TEST/photos/photo2" },
        ],
      };

      const result = mapSdkPlaceToV1Place(mockSdkPlace);
      expect(result.primary_photo_reference).toBe("places/ChIJ_TEST/photos/photo1");
      expect(result.photo_references).toEqual([
        "places/ChIJ_TEST/photos/photo1",
        "places/ChIJ_TEST/photos/photo2",
      ]);
    });

    it("normalizes generative, neighborhood, and editorial summaries", () => {
      const mockSdkPlace = {
        id: "ChIJ_TEST",
        generativeSummary: { overview: { text: "Scenic Seneca Lake winery with Rieslings." } },
        neighborhoodSummary: "Lodi wine trail area",
        editorialSummary: { text: "Established producer with lake views." },
      };

      const result = mapSdkPlaceToV1Place(mockSdkPlace);
      expect(result.generative_summary).toEqual({
        overview: { text: "Scenic Seneca Lake winery with Rieslings." },
      });
      expect(result.neighborhood_summary).toEqual({
        overview: { text: "Lodi wine trail area" },
      });
      expect(result.editorial_summary).toEqual({
        overview: { text: "Established producer with lake views." },
      });
    });

    it("normalizes accessibility options from JS SDK boolean properties", () => {
      const mockSdkPlace = {
        id: "ChIJ_TEST",
        accessibilityOptions: {
          hasWheelchairAccessibleEntrance: true,
          hasWheelchairAccessibleParking: true,
          hasWheelchairAccessibleRestroom: false,
          hasWheelchairAccessibleSeating: true,
        },
      };

      const result = mapSdkPlaceToV1Place(mockSdkPlace);
      expect(result.accessibility_options).toEqual({
        wheelchairAccessibleEntrance: true,
        wheelchairAccessibleParking: true,
        wheelchairAccessibleRestroom: false,
        wheelchairAccessibleSeating: true,
      });
      expect(result.accessibility_flags).toEqual(result.accessibility_options);
    });

    it("correctly determines EV charging from connectorCount or parkingOptions", () => {
      const placeWithEv = {
        id: "ChIJ_EV_1",
        evChargeOptions: { connectorCount: 4 },
      };
      expect(mapSdkPlaceToV1Place(placeWithEv).has_ev_charging).toBe(true);

      const placeWithNoEv = {
        id: "ChIJ_EV_2",
        evChargeOptions: { connectorCount: 0 },
      };
      expect(mapSdkPlaceToV1Place(placeWithNoEv).has_ev_charging).toBe(false);

      const placeWithParkingEv = {
        id: "ChIJ_EV_3",
        parkingOptions: { hasEvChargingStations: true },
      };
      expect(mapSdkPlaceToV1Place(placeWithParkingEv).has_ev_charging).toBe(true);
    });

    it("integrates cleanly with standardizeWineryData to yield a valid Winery domain object", () => {
      const mockSdkPlace = {
        id: "ChIJ_FULL_TEST",
        displayName: "Hermann J. Wiemer Vineyard",
        formattedAddress: "3962 NY-14, Dundee, NY 14837",
        location: {
          lat: () => 42.5367,
          lng: () => -76.9248,
        },
        rating: 4.9,
        userRatingCount: 320,
        allowsDogs: true,
        servesWine: true,
        isGoodForChildren: false,
        hasOutdoorSeating: true,
      };

      const v1Place = mapSdkPlaceToV1Place(mockSdkPlace);
      const winery = standardizeWineryData(v1Place);

      expect(winery).not.toBeNull();
      expect(winery?.id).toBe("ChIJ_FULL_TEST");
      expect(winery?.name).toBe("Hermann J. Wiemer Vineyard");
      expect(winery?.latitude).toBe(42.5367);
      expect(winery?.longitude).toBe(-76.9248);
      expect(winery?.allows_dogs).toBe(true);
      expect(winery?.serves_wine).toBe(true);
      expect((winery as any).lat).toBeUndefined();
      expect((winery as any).lng).toBeUndefined();
    });
  });
});
