import { normalizeGooglePlaceV1, GooglePlaceInput } from '@/supabase/functions/_shared/normalization';

describe('normalizeGooglePlaceV1 - Tri-State Amenity Normalization', () => {
  it('normalizes omitted amenity fields to explicit null instead of undefined or false', () => {
    const place: GooglePlaceInput = {
      id: 'places/ChIJ12345',
      displayName: { text: 'Toast Winery' },
      formattedAddress: '123 Wine Trail, Geneva, NY 14456',
      location: { latitude: 42.85, longitude: -76.98 },
    };

    const normalized = normalizeGooglePlaceV1(place);

    // Invariant: Un-enriched or omitted attributes must retain null
    expect(normalized.allows_dogs).toBeNull();
    expect(normalized.has_ev_charging).toBeNull();
    expect(normalized.serves_wine).toBeNull();
    expect(normalized.good_for_children).toBeNull();
    expect(normalized.outdoor_seating).toBeNull();
  });

  it('preserves explicitly confirmed true and false amenity attributes', () => {
    const place: GooglePlaceInput = {
      id: 'places/ChIJ67890',
      displayName: { text: 'Confirmed Amenities Winery' },
      allowsDogs: true,
      servesWine: true,
      goodForChildren: false,
      outdoorSeating: true,
      parkingOptions: {
        hasEvChargingStations: false,
      },
    };

    const normalized = normalizeGooglePlaceV1(place);

    expect(normalized.allows_dogs).toBe(true);
    expect(normalized.serves_wine).toBe(true);
    expect(normalized.good_for_children).toBe(false);
    expect(normalized.outdoor_seating).toBe(true);
    expect(normalized.has_ev_charging).toBe(false);
  });

  it('correctly evaluates has_ev_charging from evChargeOptions when connectorCount > 0', () => {
    const placeWithConnectors: GooglePlaceInput = {
      id: 'places/ChIJEV1',
      displayName: { text: 'EV Connector Winery' },
      evChargeOptions: {
        connectorCount: 4,
      },
    };

    const normalized = normalizeGooglePlaceV1(placeWithConnectors);
    expect(normalized.has_ev_charging).toBe(true);
  });

  it('evaluates has_ev_charging from parkingOptions if connectorCount is 0 or absent', () => {
    const placeWithParkingEV: GooglePlaceInput = {
      id: 'places/ChIJEV2',
      displayName: { text: 'Parking EV Winery' },
      evChargeOptions: {
        connectorCount: 0,
      },
      parkingOptions: {
        hasEvChargingStations: true,
      },
    };

    const normalized = normalizeGooglePlaceV1(placeWithParkingEV);
    expect(normalized.has_ev_charging).toBe(true);
  });

  it('evaluates has_ev_charging as null when evChargeOptions connectorCount is 0 and parkingOptions is omitted', () => {
    const place: GooglePlaceInput = {
      id: 'places/ChIJEV3',
      displayName: { text: 'No Info EV Winery' },
      evChargeOptions: {
        connectorCount: 0,
      },
    };

    const normalized = normalizeGooglePlaceV1(place);
    expect(normalized.has_ev_charging).toBeNull();
  });
});
