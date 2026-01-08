import { Winery, DbWinery, GooglePlaceId, WineryDbId, OpeningHours, PlaceReview, MapMarkerRpc, WineryDetailsRpc, DbWineryWithUserData } from '@/lib/types'; // Import RPC types and Json
import { Json } from '@/lib/database.types'; // Import Json directly

// Represents raw data from Google Places API or similar external sources
export interface GoogleWinery {
  place_id?: string; // Standard Google field
  google_place_id?: GooglePlaceId; // Our internal mapping
  id?: string; // Fallback to a string ID for Google, DbWinery uses number for ID
  name: string;
  formatted_address?: string;
  address?: string;
  geometry?: {
    location: {
      lat: number | (() => number);
      lng: number | (() => number);
    };
  };
  latitude?: string | number;
  longitude?: string | number;
  international_phone_number?: string | null;
  phone?: string | null; // Allow null for consistency
  website?: string | null;
  rating?: number | null;
  google_rating?: number | null;
  opening_hours?: OpeningHours | null;
  reviews?: PlaceReview[] | null;
  reservable?: boolean | null;
}

// Helper to check if a source is GoogleWinery
function isGoogleWinery(source: any): source is GoogleWinery {
  return 'place_id' in source && 'geometry' in source;
}

// Helper to check if a source is MapMarkerRpc
function isMapMarkerRpc(source: DbWinery | GoogleWinery | MapMarkerRpc | WineryDetailsRpc | DbWineryWithUserData): source is MapMarkerRpc {
  // Must have MapMarker fields
  const hasFields = 'is_favorite' in source && 'on_wishlist' in source && 'user_visited' in source && 'id' in source;
  // Must NOT have detailed fields (visits distinguishes it from WineryDetailsRpc)
  const isNotDetailed = !('visits' in source);
  
  return hasFields && isNotDetailed;
}

// Helper to check if a source is WineryDetailsRpc
function isWineryDetailsRpc(source: DbWinery | GoogleWinery | MapMarkerRpc | WineryDetailsRpc | DbWineryWithUserData): source is WineryDetailsRpc {
    return 'visits' in source && 'trip_info' in source && 'opening_hours' in source; // Using more specific properties
}

// Helper to check if a source has raw DbWinery properties (without extended user data from RPC)
function isRawDbWinery(source: DbWinery | GoogleWinery | MapMarkerRpc | WineryDetailsRpc | DbWineryWithUserData): source is DbWinery {
  return !isGoogleWinery(source) && !isMapMarkerRpc(source) && !isWineryDetailsRpc(source) && 'created_at' in source;
}

// Helper to parse Json reviews to PlaceReview[]
function parseReviewsJson(json: Json | null): PlaceReview[] | null {
    if (!json) return null;
    if (Array.isArray(json)) {
        // Basic check for expected properties in a review object
        return json.filter(item => typeof item === 'object' && item !== null && 'author_name' in item && 'rating' in item) as unknown as PlaceReview[];
    }
    return null;
}

// Helper to parse Json opening_hours to OpeningHours
function parseOpeningHoursJson(json: Json | null): OpeningHours | null {
    if (!json) return null;
    if (typeof json === 'object' && json !== null && 'periods' in json) {
        return json as unknown as OpeningHours;
    }
    return null;
}


/**
 * Standardizes winery data from various sources (DB, Google API, Mixed) into a single Winery object.
 * This is the single source of truth for data shape transformations.
 */
export const standardizeWineryData = (
  source: DbWinery | GoogleWinery | MapMarkerRpc | WineryDetailsRpc | DbWineryWithUserData, 
  existing?: Winery
): Winery | null => {
  if (!source) return null;

  if ('user_visited' in source && !isMapMarkerRpc(source) && !isWineryDetailsRpc(source)) {
    console.warn('[standardizeWineryData] Source has user_visited but isMapMarkerRpc returned false. Keys:', Object.keys(source));
    if ('id' in source) console.warn('ID type:', typeof (source as any).id);
  }

  // 1. Resolve ID (Google Place ID)
  const googleId = (
    (isGoogleWinery(source) && source.place_id) ||
    source.google_place_id ||
    (typeof source.id === 'string' ? source.id : undefined) ||
    existing?.id
  ) as GooglePlaceId;

  if (!googleId) {
    console.warn('[Validation] Winery missing Google Place ID:', source);
    return null;
  }

  // 2. Resolve DB ID
  let resolvedDbId: number | undefined;
  
  if (!isGoogleWinery(source) && !isMapMarkerRpc(source) && !isWineryDetailsRpc(source) && typeof (source as DbWinery).id === 'number') {
      resolvedDbId = (source as DbWinery).id;
  } else if (isMapMarkerRpc(source)) {
      resolvedDbId = typeof source.id === 'number' ? source.id : (source.id ? Number(source.id) : undefined);
  } else if (isWineryDetailsRpc(source)) {
      resolvedDbId = typeof source.id === 'number' ? source.id : (source.id ? Number(source.id) : undefined);
  } else {
      resolvedDbId = typeof existing?.dbId === 'number' ? existing.dbId : undefined;
  }

  // Final fallback to avoid NaN
  if (resolvedDbId !== undefined && isNaN(resolvedDbId)) {
      resolvedDbId = undefined;
  }

  const dbId = resolvedDbId as WineryDbId | undefined;

  // 3. Resolve Coordinates
  let lat: number = 0;
  let lng: number = 0;

  if (isGoogleWinery(source) && source.geometry?.location) {
    lat = typeof source.geometry.location.lat === 'function' ? source.geometry.location.lat() : source.geometry.location.lat;
    lng = typeof source.geometry.location.lng === 'function' ? source.geometry.location.lng() : source.geometry.location.lng;
  } else if ('latitude' in source && 'longitude' in source && (typeof source.latitude === 'number' || typeof source.latitude === 'string')) {
    lat = Number(source.latitude);
    lng = Number(source.longitude);
  } else if ('lat' in source && 'lng' in source && (typeof source.lat === 'number' || typeof source.lat === 'string')) { // For MapMarkerRpc
    lat = Number(source.lat);
    lng = Number(source.lng);
  } else {
    console.warn('[Validation] No valid coordinates found for source:', source);
    return null; 
  }
  
  // Conditionally access properties using type guards
  const name = source.name || existing?.name || 'Unknown Winery';
  const address = isGoogleWinery(source) ? (source.formatted_address || source.address) : source.address;
  const phone = isGoogleWinery(source) ? (source.international_phone_number || source.phone) : isRawDbWinery(source) ? source.phone : (isMapMarkerRpc(source) ? source.phone : isWineryDetailsRpc(source) ? source.phone : null);
  const website = isGoogleWinery(source) ? source.website : isRawDbWinery(source) ? source.website : (isMapMarkerRpc(source) ? null : isWineryDetailsRpc(source) ? source.website : null);
  const rating = isGoogleWinery(source) ? (source.rating || source.google_rating) : isRawDbWinery(source) ? source.google_rating : (isMapMarkerRpc(source) ? source.google_rating : isWineryDetailsRpc(source) ? source.google_rating : null);

  const openingHours = (isGoogleWinery(source) ? source.opening_hours : (isWineryDetailsRpc(source) ? source.opening_hours : parseOpeningHoursJson(isRawDbWinery(source) ? source.opening_hours : (isMapMarkerRpc(source) ? (source.opening_hours as Json) : null)))) as OpeningHours | null;
  const reviews = (isGoogleWinery(source) ? source.reviews : (isWineryDetailsRpc(source) ? source.reviews : parseReviewsJson(isRawDbWinery(source) ? source.reviews : null))) as PlaceReview[] | null;
  const reservable = isGoogleWinery(source) ? source.reservable : (isWineryDetailsRpc(source) ? source.reservable : (isRawDbWinery(source) ? source.reservable : null));

  const userVisited = isMapMarkerRpc(source) ? source.user_visited : (isWineryDetailsRpc(source) ? source.user_visited : ((source as DbWineryWithUserData).user_visited ?? existing?.userVisited ?? false));
  const onWishlist = isMapMarkerRpc(source) ? source.on_wishlist : (isWineryDetailsRpc(source) ? source.on_wishlist : ((source as DbWineryWithUserData).on_wishlist ?? existing?.onWishlist ?? false));
  const isFavorite = isMapMarkerRpc(source) ? source.is_favorite : (isWineryDetailsRpc(source) ? source.is_favorite : ((source as DbWineryWithUserData).is_favorite ?? existing?.isFavorite ?? false));
  const visits = (isWineryDetailsRpc(source) && source.visits) ? source.visits : ((source as DbWineryWithUserData).visits || existing?.visits || []);
  const trip_id = (isWineryDetailsRpc(source) && source.trip_info?.[0]?.trip_id) ? source.trip_info[0].trip_id : ((source as DbWineryWithUserData).trip_id || existing?.trip_id);
  const trip_name = (isWineryDetailsRpc(source) && source.trip_info?.[0]?.trip_name) ? source.trip_info[0].trip_name : ((source as DbWineryWithUserData).trip_name || existing?.trip_name);
  const trip_date = (isWineryDetailsRpc(source) && source.trip_info?.[0]?.trip_date) ? source.trip_info[0].trip_date : ((source as DbWineryWithUserData).trip_date || existing?.trip_date);
  
  // Construct the Standard Object
  const standardized: Winery = {
    id: googleId,
    dbId: dbId,
    name: name,
    address: address || existing?.address || '',
    lat,
    lng,
    phone: phone || existing?.phone,
    website: website || existing?.website,
    rating: rating || existing?.rating,
    
    // Complex fields that might be missing in partial updates
    openingHours: openingHours || existing?.openingHours,
    reviews: reviews || existing?.reviews,
    reservable: reservable ?? existing?.reservable,
    
    // User State (Preserve if not provided by source)
    userVisited: userVisited,
    onWishlist: onWishlist,
    isFavorite: isFavorite,
    
    // Arrays (Preserve)
    visits: visits,
    
    // Trip Context
    trip_id: trip_id,
    trip_name: trip_name,
    trip_date: trip_date,
  };

  // Final Validation
  if (!standardized.name || isNaN(standardized.lat) || isNaN(standardized.lng)) {
    console.warn('[Validation] Invalid winery data:', standardized);
    return null;
  }

  return standardized;
};