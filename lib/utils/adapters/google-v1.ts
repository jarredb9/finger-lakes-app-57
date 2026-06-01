import { GoogleV1Place, Winery, GooglePlaceId } from '../../types';

/**
 * Adapter to normalize Google Places API (New) / V1 response data
 * into the application's internal Winery interface.
 * 
 * MANDATORY: 
 * - Explicitly normalize to latitude/longitude.
 * - Map displayName.text to name.
 * - Map formattedAddress to address.
 * - Map camelCase (API) to snake_case (DB/Winery internal fields).
 */
export function googleV1ToWinery(place: GoogleV1Place): Winery {
  const winery: Winery = {
    // Explicitly cast Google API ID to internal GooglePlaceId type
    id: place.id as GooglePlaceId,
    name: place.displayName.text,
    address: place.formattedAddress,
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    
    website: place.websiteUri || null,
    rating: place.rating || null,
    
    // Enrichment fields (mapped from camelCase to snake_case as per plan)
    generative_summary: place.generativeSummary?.overview?.text || null,
    neighborhood_summary: place.neighborhoodSummary?.overview?.text || null,
    allows_dogs: place.allowsDogs ?? null,
    has_ev_charging: (place.parkingOptions as any)?.hasEvChargingStations ?? null,
    serves_wine: place.servesWine ?? null,
    good_for_children: place.goodForChildren ?? null,
    outdoor_seating: place.outdoorSeating ?? null,
  };

  return winery;
}
