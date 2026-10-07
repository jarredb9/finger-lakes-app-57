export interface NormalizedReview {
  author_name: string;
  rating?: number;
  relative_time_description?: string;
  text: string;
  time: number;
}

export interface GooglePlacePhoto {
  name: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: Array<{
    displayName: string;
    uri: string;
    photoUri: string;
  }>;
}

export interface GooglePlaceInput {
  id: string;
  displayName?: {
    text: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  rating?: number;
  google_rating?: number;
  userRatingCount?: number;
  user_rating_count?: number;
  regularOpeningHours?: unknown;
  reviews?: Array<{
    authorAttribution?: { displayName: string };
    rating?: number;
    relativePublishTimeDescription?: string;
    text?: { text?: string } | string;
    originalText?: { text?: string };
    publishTime?: string;
  }>;
  photos?: GooglePlacePhoto[];
  generativeSummary?: { overview?: { text?: string } };
  neighborhoodSummary?: { overview?: { text?: string } };
  editorialSummary?: { overview?: { text?: string } };
  allowsDogs?: boolean;
  evChargeOptions?: { connectorCount?: number } | null;
  parkingOptions?: { hasEvChargingStations?: boolean; [key: string]: unknown };
  servesWine?: boolean;
  goodForChildren?: boolean;
  outdoorSeating?: boolean;
  accessibilityOptions?: unknown;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  varietals?: unknown;
  vibe_tags?: string[];
}

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
  opening_hours?: unknown;
  reviews?: NormalizedReview[] | null;
  enrichment_tier: 'basic' | 'enriched';
  last_enriched_at: string | null;
  generative_summary?: { overview?: { text?: string } } | null;
  neighborhood_summary?: { overview?: { text?: string } } | null;
  editorial_summary?: { overview?: { text?: string } } | null;
  allows_dogs?: boolean | null;
  has_ev_charging?: boolean | null;
  serves_wine?: boolean | null;
  good_for_children?: boolean | null;
  outdoor_seating?: boolean | null;
  parking_options?: unknown;
  accessibility_flags?: unknown;
  primary_photo_reference?: string | null;
  photo_references?: string[] | null;
  varietals?: unknown;
  vibe_tags?: string[] | null;
}

/**
 * Normalizes Google Places V1 API response to the Supabase database schema.
 * Enforces property-based coordinate access (latitude/longitude).
 */
export function normalizeGooglePlaceV1(place: GooglePlaceInput, tier: 'basic' | 'enriched' = 'basic'): NormalizedWinery {
  return {
    google_place_id: place.id,
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    latitude: place.location?.latitude ?? 0,
    longitude: place.location?.longitude ?? 0,
    phone: place.internationalPhoneNumber || null,
    website: place.websiteUri || null,
    google_rating: typeof place.rating === 'number' && place.rating > 0 
      ? place.rating 
      : (typeof place.google_rating === 'number' && place.google_rating > 0 ? place.google_rating : null),
    user_rating_count: typeof place.userRatingCount === 'number' && place.userRatingCount > 0 
      ? place.userRatingCount 
      : (typeof place.user_rating_count === 'number' && place.user_rating_count > 0 ? place.user_rating_count : null),
    opening_hours: place.regularOpeningHours || null,
    reviews: place.reviews ? place.reviews.map((r) => ({
      author_name: r.authorAttribution?.displayName || 'Anonymous',
      rating: r.rating,
      relative_time_description: r.relativePublishTimeDescription,
      text: (typeof r.text === 'object' && r.text ? r.text.text : (typeof r.text === 'string' ? r.text : r.originalText?.text)) || '',
      time: r.publishTime ? new Date(r.publishTime).getTime() / 1000 : 0
    })) : [],
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
    photo_references: place.photos && place.photos.length > 0 ? place.photos.map((p) => p.name) : null,
    varietals: place.varietals || null,
    vibe_tags: place.vibe_tags || null,
  };
}
