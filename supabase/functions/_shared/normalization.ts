export interface NormalizedWinery {
  google_place_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
  website?: string | null;
  google_rating?: number | null;
  user_rating_count?: number | null;
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
    user_rating_count: place.userRatingCount || null,
    opening_hours: place.regularOpeningHours,
    reviews: place.reviews ? place.reviews.map((r: any) => ({
      author_name: r.authorAttribution?.displayName || 'Anonymous',
      rating: r.rating,
      relative_time_description: r.relativePublishTimeDescription,
      text: r.text?.text || r.originalText?.text || '',
      time: r.publishTime ? new Date(r.publishTime).getTime() / 1000 : 0
    })) : undefined,
    enrichment_tier: tier,
    last_enriched_at: tier === 'enriched' ? new Date().toISOString() : null,
    generative_summary: place.generativeSummary ? { overview: { text: place.generativeSummary.overview?.text } } : undefined,
    neighborhood_summary: place.neighborhoodSummary ? { overview: { text: place.neighborhoodSummary.overview?.text } } : undefined,
    editorial_summary: place.editorialSummary ? { overview: { text: place.editorialSummary.overview?.text } } : undefined,
    allows_dogs: place.allowsDogs,
    has_ev_charging: place.evChargeOptions !== undefined && place.evChargeOptions !== null
      ? (typeof place.evChargeOptions.connectorCount === 'number' ? place.evChargeOptions.connectorCount > 0 : true)
      : (place.parkingOptions?.hasEvChargingStations),
    serves_wine: place.servesWine,
    good_for_children: place.goodForChildren,
    outdoor_seating: place.outdoorSeating,
    parking_options: place.parkingOptions,
    accessibility_flags: place.accessibilityOptions,
    primary_photo_reference: place.photos && place.photos.length > 0 ? place.photos[0].name : null,
    photo_references: place.photos && place.photos.length > 0 ? place.photos.map((p: any) => p.name) : null,
  };
}
