export interface NormalizedWinery {
  google_place_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
  website?: string | null;
  google_rating?: number | null;
  opening_hours?: any | null;
  reviews?: any | null;
  enrichment_tier: 'basic' | 'enriched';
  last_enriched_at: string | null;
  generative_summary?: any | null;
  neighborhood_summary?: any | null;
  editorial_summary?: any | null;
  allows_dogs?: boolean | null;
  has_ev_charging?: boolean | null;
  serves_wine?: boolean | null;
  good_for_children?: boolean | null;
  outdoor_seating?: boolean | null;
  parking_options?: any | null;
  accessibility_flags?: any | null;
  primary_photo_reference?: string | null;
  photo_references?: string[] | null;
}

/**
 * Normalizes Google Places V1 API response to the Supabase database schema.
 * Enforces property-based coordinate access (latitude/longitude).
 */
export function normalizeGooglePlaceV1(place: any, tier: 'basic' | 'enriched' = 'basic'): NormalizedWinery {
  return {
    google_place_id: place.id,
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    phone: place.internationalPhoneNumber || null,
    website: place.websiteUri || null,
    google_rating: place.rating || null,
    opening_hours: place.regularOpeningHours || null,
    reviews: place.reviews || null,
    enrichment_tier: tier,
    last_enriched_at: tier === 'enriched' ? new Date().toISOString() : null,
    generative_summary: place.generativeSummary ? { overview: { text: place.generativeSummary.overview?.text } } : null,
    neighborhood_summary: place.neighborhoodSummary ? { overview: { text: place.neighborhoodSummary.overview?.text } } : null,
    editorial_summary: place.editorialSummary ? { overview: { text: place.editorialSummary.overview?.text } } : null,
    allows_dogs: place.allowsDogs ?? null,
    has_ev_charging: place.evChargeOptions !== undefined && place.evChargeOptions !== null
      ? (typeof place.evChargeOptions.connectorCount === 'number' ? place.evChargeOptions.connectorCount > 0 : true)
      : (place.parkingOptions?.hasEvChargingStations ?? null),
    serves_wine: place.servesWine ?? null,
    good_for_children: place.goodForChildren ?? null,
    outdoor_seating: place.outdoorSeating ?? null,
    parking_options: place.parkingOptions || null,
    accessibility_flags: place.accessibilityOptions || null,
    primary_photo_reference: place.photos && place.photos.length > 0 ? place.photos[0].name : null,
    photo_references: place.photos && place.photos.length > 0 ? place.photos.map((p: any) => p.name) : null,
  };
}
