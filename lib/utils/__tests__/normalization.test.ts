import { normalizeGooglePlaceV1 } from '@/supabase/functions/_shared/normalization';

type RawPlaceInput = Parameters<typeof normalizeGooglePlaceV1>[0];

describe('normalizeGooglePlaceV1 Amenity Tri-State Normalization (Issue #73)', () => {
  it('normalizes omitted amenity fields to null instead of undefined', () => {
    const rawPlace: RawPlaceInput = {
      id: 'places/ChIJ_toast_15504',
      displayName: { text: 'Toast Winery', languageCode: 'en' },
      formattedAddress: '123 Wine Trail, Hector, NY',
      location: { latitude: 42.5, longitude: -76.8 },
    } as RawPlaceInput;

    const normalized = normalizeGooglePlaceV1(rawPlace);

    expect(normalized.allows_dogs).toBeNull();
    expect(normalized.has_ev_charging).toBeNull();
    expect(normalized.serves_wine).toBeNull();
    expect(normalized.good_for_children).toBeNull();
    expect(normalized.outdoor_seating).toBeNull();
  });

  it('preserves explicitly true amenity attributes', () => {
    const rawPlace: RawPlaceInput = {
      id: 'places/ChIJ_positive_amenities',
      displayName: { text: 'Dog & EV Friendly Winery' },
      allowsDogs: true,
      servesWine: true,
      goodForChildren: true,
      outdoorSeating: true,
      parkingOptions: { hasEvChargingStations: true },
    } as RawPlaceInput;

    const normalized = normalizeGooglePlaceV1(rawPlace);

    expect(normalized.allows_dogs).toBe(true);
    expect(normalized.has_ev_charging).toBe(true);
    expect(normalized.serves_wine).toBe(true);
    expect(normalized.good_for_children).toBe(true);
    expect(normalized.outdoor_seating).toBe(true);
  });

  it('preserves explicitly false amenity attributes', () => {
    const rawPlace: RawPlaceInput = {
      id: 'places/ChIJ_negative_amenities',
      displayName: { text: 'Strict No-Dogs Winery' },
      allowsDogs: false,
      servesWine: false,
      goodForChildren: false,
      outdoorSeating: false,
      parkingOptions: { hasEvChargingStations: false },
    } as RawPlaceInput;

    const normalized = normalizeGooglePlaceV1(rawPlace);

    expect(normalized.allows_dogs).toBe(false);
    expect(normalized.has_ev_charging).toBe(false);
    expect(normalized.serves_wine).toBe(false);
    expect(normalized.good_for_children).toBe(false);
    expect(normalized.outdoor_seating).toBe(false);
  });

  it('correctly resolves evChargeOptions and normalizes to null when both are omitted', () => {
    const rawPlaceWithEvConnectors: RawPlaceInput = {
      id: 'places/ChIJ_ev_connectors',
      evChargeOptions: { connectorCount: 4 },
    } as RawPlaceInput;
    expect(normalizeGooglePlaceV1(rawPlaceWithEvConnectors).has_ev_charging).toBe(true);

    const rawPlaceWithZeroConnectors: RawPlaceInput = {
      id: 'places/ChIJ_zero_connectors',
      evChargeOptions: { connectorCount: 0 },
    } as RawPlaceInput;
    expect(normalizeGooglePlaceV1(rawPlaceWithZeroConnectors).has_ev_charging).toBe(false);

    const rawPlaceWithNoEvInfo: RawPlaceInput = {
      id: 'places/ChIJ_no_ev_info',
    } as RawPlaceInput;
    expect(normalizeGooglePlaceV1(rawPlaceWithNoEvInfo).has_ev_charging).toBeNull();
  });
});
