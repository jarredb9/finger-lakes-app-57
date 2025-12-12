import { Winery, DbWinery } from '@/lib/types';

// Represents raw data from Google Places API or similar external sources
export interface GoogleWinery {
  place_id?: string; // Standard Google field
  google_place_id?: string; // Our internal mapping
  id?: string | number; // Fallback
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
  international_phone_number?: string;
  phone?: string;
  website?: string;
  rating?: number;
  google_rating?: number;
  opening_hours?: any;
  reviews?: any;
  reservable?: boolean;
}

/**
 * Standardizes winery data from various sources (DB, Google API, Mixed) into a single Winery object.
 * This is the single source of truth for data shape transformations.
 */
export const standardizeWineryData = (
  source: DbWinery | GoogleWinery | any, 
  existing?: Winery
): Winery | null => {
  if (!source) return null;

  // 1. Resolve ID (Google Place ID)
  // Google Places API uses 'place_id'. Our DB uses 'google_place_id'.
  const googleId = 
    source.google_place_id || 
    source.place_id || 
    (typeof source.id === 'string' ? source.id : undefined) ||
    existing?.id;

  if (!googleId) {
    console.warn('[Validation] Winery missing Google Place ID:', source);
    return null;
  }

  // 2. Resolve DB ID
  const dbId = 
    (typeof source.id === 'number' ? source.id : undefined) || 
    existing?.dbId;

  // 3. Resolve Coordinates
  let lat: number = 0;
  let lng: number = 0;

  if (source.geometry?.location) {
    // Google API object
    lat = typeof source.geometry.location.lat === 'function' ? source.geometry.location.lat() : source.geometry.location.lat;
    lng = typeof source.geometry.location.lng === 'function' ? source.geometry.location.lng() : source.geometry.location.lng;
  } else {
    // DB or Flat object
    lat = Number(source.latitude || source.lat || 0);
    lng = Number(source.longitude || source.lng || 0);
  }

  // 4. Construct the Standard Object
  const standardized: Winery = {
    id: googleId,
    dbId: dbId,
    name: source.name || existing?.name || 'Unknown Winery',
    address: source.formatted_address || source.address || existing?.address || '',
    lat,
    lng,
    phone: source.international_phone_number || source.phone || existing?.phone,
    website: source.website || existing?.website,
    rating: source.rating || source.google_rating || existing?.rating,
    
    // Complex fields that might be missing in partial updates
    openingHours: source.opening_hours || existing?.openingHours,
    reviews: source.reviews || existing?.reviews,
    reservable: source.reservable ?? existing?.reservable,
    
    // User State (Preserve if not provided)
    userVisited: source.user_visited ?? existing?.userVisited ?? false,
    onWishlist: source.on_wishlist ?? existing?.onWishlist ?? false,
    isFavorite: source.is_favorite ?? existing?.isFavorite ?? false,
    
    // Arrays (Preserve)
    visits: source.visits || existing?.visits || [],
    
    // Trip Context
    trip_id: source.trip_id ?? existing?.trip_id,
    trip_name: source.trip_name ?? existing?.trip_name,
    trip_date: source.trip_date ?? existing?.trip_date,
  };

  // 5. Final Validation
  if (!standardized.name || isNaN(standardized.lat) || isNaN(standardized.lng)) {
    console.warn('[Validation] Invalid winery data:', standardized);
    return null;
  }

  return standardized;
};
