import {
  Winery,
  DbWinery,
  GooglePlaceId,
  OpeningHours,
  PlaceReview,
  MapMarkerRpc,
  WineryDetailsRpc,
  Visit,
  WineryVarietal,
  toGooglePlaceId,
  toWineryDbId,
  isGooglePlaceId,
  isWineryDbId,
} from '@/lib/types'; // Import RPC types and Json
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
  userRatingCount?: number | null;
  opening_hours?: OpeningHours | null;
  reviews?: PlaceReview[] | null;
  reservable?: boolean | null;
}

// Safe type guard excluding null and arrays
export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

// Helper to check if a source is GoogleWinery
export function isGoogleWinery(source: unknown): source is GoogleWinery {
  return (
    isRecord(source) &&
    typeof source.place_id === 'string' &&
    source.place_id.trim().length > 0 &&
    isRecord(source.geometry)
  );
}

// Helper to check if a source is MapMarkerRpc
export function isMapMarkerRpc(source: unknown): source is MapMarkerRpc {
  if (!isRecord(source)) return false;
  // MapMarkerRpc always has latitude/longitude (standardized) or lat/lng (legacy)
  // and some form of google id (google_place_id OR id as string)
  const hasGoogleId = isGooglePlaceId(source.google_place_id) || (typeof source.id === 'string' && source.id.trim().length > 0);
  const hasCoords = 'latitude' in source || 'lat' in source;
  
  return (
    hasGoogleId &&
    hasCoords &&
    !('visits' in source)
  );
}

// Helper to check if a source is WineryDetailsRpc
export function isWineryDetailsRpc(source: unknown): source is WineryDetailsRpc {
  if (!isRecord(source)) return false;
  // WineryDetailsRpc is the ONLY one with 'visits'
  const hasGoogleId = isGooglePlaceId(source.google_place_id) || (typeof source.id === 'string' && source.id.trim().length > 0);
  return hasGoogleId && 'visits' in source; 
}

// Helper to check if a source has raw DbWinery properties (without extended user data from RPC)
export function isRawDbWinery(source: unknown): source is DbWinery {
  return isRecord(source) && !isGoogleWinery(source) && !isMapMarkerRpc(source) && !isWineryDetailsRpc(source) && 'created_at' in source;
}

// Helper to parse Json reviews to PlaceReview[]
function parseReviewsJson(json: unknown): PlaceReview[] | null | undefined {
    if (json === undefined) return undefined;
    if (json === null) return null;
    if (Array.isArray(json)) {
        const normalized: PlaceReview[] = [];
        for (const item of json) {
            if (!isRecord(item)) continue;

            const textObj = item.text;
            let textVal = '';
            let languageVal: string | null = null;
            if (isRecord(textObj)) {
                textVal = String(textObj.text || '');
                languageVal = typeof textObj.languageCode === 'string' ? textObj.languageCode : null;
            } else if (typeof textObj === 'string') {
                textVal = textObj;
            }

            const authorAttr = item.authorAttribution;
            let authorNameVal = '';
            let authorUrlVal: string | null = null;
            let photoUriVal: string | null = null;
            if (isRecord(authorAttr)) {
                authorNameVal = String(authorAttr.displayName || '');
                authorUrlVal = typeof authorAttr.uri === 'string' ? authorAttr.uri : null;
                photoUriVal = typeof authorAttr.photoUri === 'string' ? authorAttr.photoUri : null;
            } else if (typeof item.author_name === 'string') {
                authorNameVal = item.author_name;
            }

            if (!authorNameVal) {
                authorNameVal = 'A Google User';
            }

            const ratingVal = typeof item.rating === 'number' ? item.rating : 0;
            const relativeTimeVal = String(item.relativePublishTimeDescription || item.relative_time_description || '');
            
            let timeVal = 0;
            if (typeof item.time === 'number' && !isNaN(item.time)) {
                timeVal = item.time;
            } else if (item.publishTime) {
                const parsedMs = new Date(String(item.publishTime)).getTime();
                if (!isNaN(parsedMs)) {
                    timeVal = Math.floor(parsedMs / 1000);
                }
            }

            normalized.push({
                author_name: authorNameVal,
                rating: ratingVal,
                relative_time_description: relativeTimeVal,
                text: textVal,
                time: timeVal,
                author_url: authorUrlVal || (typeof item.author_url === 'string' ? item.author_url : null),
                language: languageVal || (typeof item.language === 'string' ? item.language : null),
                profile_photo_url: photoUriVal || (typeof item.profile_photo_url === 'string' ? item.profile_photo_url : null),
            });
        }
        return normalized.length > 0 ? normalized : null;
    }
    return null;
}

// Helper to parse Json opening_hours to OpeningHours
function parseOpeningHoursJson(json: Json | null | undefined): OpeningHours | null | undefined {
    if (json === undefined) return undefined;
    if (json === null) return null;
    if (isRecord(json) && 'periods' in json) {
        const weekdayText = json.weekday_text || json.weekdayDescriptions || json.weekday_descriptions;
        return {
            ...json,
            ...(weekdayText ? { weekday_text: weekdayText as string[] } : {})
        } as unknown as OpeningHours;
    }
    return null;
}


/**
 * Standardizes winery data from various sources (DB, Google API, Mixed) into a single Winery object.
 * This is the single source of truth for data shape transformations.
 */
export const standardizeWineryData = (
  source: unknown, 
  existing?: Winery
): Winery | null => {
  if (!isRecord(source)) return null;
  const record = source;

  // 1. Resolve ID (Google Place ID)
  // RPCs are inconsistent: some return 'google_place_id', some return 'google_place_id as id'
  const rawGoogleId = (
    (isGoogleWinery(source) && source.place_id) ||
    (typeof record['google_place_id'] === 'string' ? record['google_place_id'] : undefined) ||
    (typeof record['id'] === 'string' && !/^\d+$/.test(record['id']) ? record['id'] : undefined) ||
    existing?.id
  );
  const googleId = toGooglePlaceId(rawGoogleId);

  if (!googleId || !isGooglePlaceId(googleId)) {
    console.warn('[Validation] Winery missing or invalid Google Place ID:', source);
    return null;
  }

  // 2. Resolve DB ID
  let resolvedDbId: number | undefined;
  
  if (record['dbId'] !== undefined && record['dbId'] !== null && !isNaN(Number(record['dbId']))) {
      resolvedDbId = Number(record['dbId']);
  } else if (typeof record['id'] === 'number') {
      resolvedDbId = record['id'];
  } else if (typeof record['id'] === 'string' && /^\d+$/.test(record['id'])) {
      resolvedDbId = Number(record['id']);
  } else if (isRawDbWinery(source) && typeof source.id === 'number') {
      resolvedDbId = source.id;
  } else {
      resolvedDbId = (existing?.dbId !== undefined && existing?.dbId !== null && !isNaN(Number(existing.dbId))) ? Number(existing.dbId) : undefined;
  }

  // Final fallback to avoid NaN, non-integer, or non-positive
  if (resolvedDbId !== undefined && (isNaN(resolvedDbId) || !Number.isInteger(resolvedDbId) || resolvedDbId <= 0)) {
      resolvedDbId = undefined;
  }

  const rawDbId = toWineryDbId(resolvedDbId);
  const dbId = isWineryDbId(rawDbId) ? rawDbId : undefined;

  // 3. Resolve Coordinates
  let lat: number = 0;
  let lng: number = 0;

  const loc = isRecord(record['location']) ? record['location'] : null;
  if (loc && typeof loc['latitude'] === 'number' && typeof loc['longitude'] === 'number') {
    // V1 / GoogleV1Place structure
    lat = Number(loc['latitude']);
    lng = Number(loc['longitude']);
  } else if (loc && (typeof loc['lat'] === 'function' || typeof loc['lat'] === 'number' || typeof loc['latitude'] === 'number')) {
    const latFn = typeof loc['lat'] === 'function' ? (loc['lat'] as () => number)() : loc['lat'];
    const lngFn = typeof loc['lng'] === 'function' ? (loc['lng'] as () => number)() : (loc['lng'] || loc['long']);
    lat = Number(typeof loc['latitude'] === 'number' ? loc['latitude'] : latFn);
    lng = Number(typeof loc['longitude'] === 'number' ? loc['longitude'] : lngFn);
  } else if (isGoogleWinery(source) && source.geometry?.location) {
    lat = Number(typeof source.geometry.location.lat === 'function' ? source.geometry.location.lat() : source.geometry.location.lat);
    lng = Number(typeof source.geometry.location.lng === 'function' ? source.geometry.location.lng() : source.geometry.location.lng);
  } else if ('latitude' in record && 'longitude' in record && (record['latitude'] !== null && record['longitude'] !== null)) {
    lat = Number(record['latitude']);
    lng = Number(record['longitude']);
  } else if ('lat' in record && ('lng' in record || 'long' in record)) { 
    // Legacy support for older RPCs or mocks
    lat = Number(record['lat']);
    lng = Number(record['lng'] || record['long']);
  } else {
    console.warn('[Validation] No valid coordinates found for source:', source);
    return null; 
  }
  
  // Determine incoming and existing enrichment tiers
  const rawIncomingTier = typeof record['enrichment_tier'] === 'string'
    ? record['enrichment_tier']
    : (typeof record['enrichmentTier'] === 'string' ? record['enrichmentTier'] : undefined);
  const incomingTier = (rawIncomingTier === 'basic' || rawIncomingTier === 'enriched' || rawIncomingTier === 'full')
    ? rawIncomingTier
    : (isWineryDetailsRpc(source) ? 'enriched' : undefined);
  const isIncomingEnriched = incomingTier === 'enriched' || incomingTier === 'full';
  const existingTier = (existing?.enrichment_tier === 'basic' || existing?.enrichment_tier === 'enriched' || existing?.enrichment_tier === 'full')
    ? existing.enrichment_tier
    : undefined;
  const enrichmentTier: 'basic' | 'enriched' | 'full' = (existingTier === 'enriched' || existingTier === 'full') && (incomingTier !== 'enriched' && incomingTier !== 'full')
    ? existingTier
    : (incomingTier || existingTier || 'basic');

  // Helper to merge fields while preventing overwriting of enriched data by basic markers
  const mergeField = <T>(newVal: T | null | undefined, existingVal: T | null | undefined): T | null | undefined => {
    if (Array.isArray(newVal) && newVal.length === 0 && Array.isArray(existingVal) && existingVal.length > 0) {
      return existingVal;
    }
    if (!isIncomingEnriched && existingVal !== undefined && existingVal !== null) {
      return existingVal;
    }
    return newVal !== undefined && newVal !== null ? newVal : existingVal;
  };

  // Conditionally access properties using type guards
  const rawDisplayName = isRecord(record['displayName']) && typeof record['displayName']['text'] === 'string'
    ? (record['displayName']['text'] as string)
    : (typeof record['displayName'] === 'string' ? record['displayName'] : undefined);
  const rawName = (typeof record['name'] === 'string' ? record['name'] : undefined) || rawDisplayName || existing?.name;
  const name = rawName || 'Unknown Winery';
  const address = isGoogleWinery(source) 
    ? (source.formatted_address || source.address) 
    : ((typeof record['formattedAddress'] === 'string' ? record['formattedAddress'] : undefined) || (typeof record['address'] === 'string' ? record['address'] : undefined));
  
  // Resolve fields from source, preserving existing data if source is null/undefined (Merge Guard)
  let sourcePhone: string | null | undefined;
  if (isGoogleWinery(source)) {
    sourcePhone = source.international_phone_number || source.phone;
  } else if (isWineryDetailsRpc(source) || isMapMarkerRpc(source)) {
    sourcePhone = source.phone;
  } else if (isRawDbWinery(source)) {
    sourcePhone = source.phone;
  } else {
    sourcePhone = typeof record['phone'] === 'string' ? record['phone'] : (record['phone'] === null ? null : undefined);
  }
  const phone = mergeField(sourcePhone, existing?.phone);

  let sourceWebsite: string | null | undefined;
  if (isGoogleWinery(source)) {
    sourceWebsite = source.website;
  } else if (isWineryDetailsRpc(source)) {
    sourceWebsite = source.website;
  } else if (isRawDbWinery(source)) {
    sourceWebsite = source.website;
  } else {
    sourceWebsite = typeof record['website'] === 'string' ? record['website'] : (typeof record['websiteUri'] === 'string' ? record['websiteUri'] : (record['website'] === null ? null : undefined));
  }
  const website = mergeField(sourceWebsite, existing?.website);

  let rawRating: unknown;
  if (isGoogleWinery(source)) {
    rawRating = source.rating || source.google_rating;
  } else if (isWineryDetailsRpc(source) || isMapMarkerRpc(source)) {
    rawRating = source.google_rating ?? ('rating' in record ? record['rating'] : undefined);
  } else if (isRawDbWinery(source)) {
    rawRating = source.google_rating;
  } else {
    rawRating = record['google_rating'] ?? record['rating'];
  }
  const parsedRating = typeof rawRating === 'number' && rawRating > 0 
    ? rawRating 
    : (typeof rawRating === 'string' && Number(rawRating) > 0 ? Number(rawRating) : null);
  const sanitizedExistingRating = typeof existing?.rating === 'number' && existing.rating > 0 
    ? existing.rating 
    : (typeof existing?.rating === 'string' && Number(existing.rating) > 0 ? Number(existing.rating) : null);
  const rating = mergeField(parsedRating, sanitizedExistingRating);

  let rawUserRatingCount: unknown;
  if (isGoogleWinery(source)) {
    rawUserRatingCount = source.userRatingCount;
  } else if (isWineryDetailsRpc(source)) {
    rawUserRatingCount = source.user_rating_count ?? ('userRatingCount' in record ? record['userRatingCount'] : undefined);
  } else if (isRawDbWinery(source)) {
    rawUserRatingCount = 'user_rating_count' in record ? record['user_rating_count'] : undefined;
  } else {
    rawUserRatingCount = record['user_rating_count'] ?? record['userRatingCount'] ?? null;
  }
  const parsedUserRatingCount = typeof rawUserRatingCount === 'number' && rawUserRatingCount > 0 
    ? rawUserRatingCount 
    : (typeof rawUserRatingCount === 'string' && Number(rawUserRatingCount) > 0 ? Number(rawUserRatingCount) : null);
  const sanitizedExistingRatingCount = typeof existing?.userRatingCount === 'number' && existing.userRatingCount > 0 
    ? existing.userRatingCount 
    : (typeof existing?.userRatingCount === 'string' && Number(existing.userRatingCount) > 0 ? Number(existing.userRatingCount) : null);
  const userRatingCount = mergeField(parsedUserRatingCount, sanitizedExistingRatingCount);

  // Handle openingHours more carefully to avoid overwriting with null if missing from source
  let sourceOpeningHoursRaw: unknown;
  if (isGoogleWinery(source)) {
    sourceOpeningHoursRaw = source.opening_hours;
  } else if (isWineryDetailsRpc(source) || isMapMarkerRpc(source)) {
    sourceOpeningHoursRaw = source.opening_hours ?? ('openingHours' in record ? record['openingHours'] : undefined);
  } else if (isRawDbWinery(source)) {
    sourceOpeningHoursRaw = source.opening_hours;
  } else {
    sourceOpeningHoursRaw = record['opening_hours'] ?? record['openingHours'];
  }
  const parsedOpeningHours = parseOpeningHoursJson(sourceOpeningHoursRaw as Json | null | undefined);
  const openingHours = mergeField(parsedOpeningHours, existing?.openingHours);
  
  let rawReviewsSource: unknown;
  if (isGoogleWinery(source)) {
    rawReviewsSource = source.reviews;
  } else if (isWineryDetailsRpc(source)) {
    rawReviewsSource = source.reviews;
  } else if (isRawDbWinery(source)) {
    rawReviewsSource = source.reviews;
  } else {
    rawReviewsSource = 'reviews' in record ? record['reviews'] : undefined;
  }
  const parsedReviews = parseReviewsJson(rawReviewsSource);
  const reviews = mergeField(parsedReviews, existing?.reviews);

  let sourceReservable: boolean | null | undefined;
  if (isGoogleWinery(source)) {
    sourceReservable = source.reservable;
  } else if (isWineryDetailsRpc(source)) {
    sourceReservable = source.reservable;
  } else if (isRawDbWinery(source)) {
    sourceReservable = source.reservable;
  } else if ('reservable' in record) {
    sourceReservable = typeof record['reservable'] === 'boolean' || record['reservable'] === null ? (record['reservable'] as boolean | null) : undefined;
  }
  const reservable = sourceReservable !== undefined && sourceReservable !== null ? sourceReservable : existing?.reservable;

  const userVisited = record['user_visited'] !== undefined ? Boolean(record['user_visited']) : (record['userVisited'] !== undefined ? Boolean(record['userVisited']) : (existing?.userVisited ?? false));

  const rawOnWishlist = record['on_wishlist'] !== undefined ? Boolean(record['on_wishlist']) : (record['onWishlist'] !== undefined ? Boolean(record['onWishlist']) : undefined);
  const onWishlist = rawOnWishlist !== undefined ? (rawOnWishlist || (existing?.onWishlist ?? false)) : (existing?.onWishlist ?? false);

  const rawIsFavorite = record['is_favorite'] !== undefined ? Boolean(record['is_favorite']) : (record['isFavorite'] !== undefined ? Boolean(record['isFavorite']) : undefined);
  const isFavorite = rawIsFavorite !== undefined ? (rawIsFavorite || (existing?.isFavorite ?? false)) : (existing?.isFavorite ?? false);
  
  const rawFavPriv = record['is_favorite_private'] !== undefined ? Boolean(record['is_favorite_private']) : (record['favorite_is_private'] !== undefined ? Boolean(record['favorite_is_private']) : (record['favoriteIsPrivate'] !== undefined ? Boolean(record['favoriteIsPrivate']) : undefined));
  const favoriteIsPrivate = rawFavPriv !== undefined ? (rawFavPriv || (existing?.favoriteIsPrivate ?? false)) : (existing?.favoriteIsPrivate ?? false);

  const rawWishPriv = record['on_wishlist_private'] !== undefined ? Boolean(record['on_wishlist_private']) : (record['wishlist_is_private'] !== undefined ? Boolean(record['wishlist_is_private']) : (record['wishlistIsPrivate'] !== undefined ? Boolean(record['wishlistIsPrivate']) : undefined));
  const wishlistIsPrivate = rawWishPriv !== undefined ? (rawWishPriv || (existing?.wishlistIsPrivate ?? false)) : (existing?.wishlistIsPrivate ?? false);

  // Enrichment (Places API v1)
  const lastEnrichedAt = (typeof record['last_enriched_at'] === 'string' ? record['last_enriched_at'] : undefined) || existing?.last_enriched_at;
  
  // Handle generative_summary potentially being an object (from DB) or a string (from Edge Function)
  const rawGenSummary = record['generative_summary'] !== undefined ? record['generative_summary'] : (record['generativeSummary'] !== undefined ? record['generativeSummary'] : existing?.generative_summary);
  let generativeSummaryText: string | null | undefined;
  if (isRecord(rawGenSummary)) {
      const overview = isRecord(rawGenSummary['overview']) ? rawGenSummary['overview'] : null;
      generativeSummaryText = (typeof overview?.['text'] === 'string' ? overview['text'] : null) || (typeof rawGenSummary['text'] === 'string' ? rawGenSummary['text'] : null);
  } else if (typeof rawGenSummary === 'string') {
      generativeSummaryText = rawGenSummary;
  } else if (rawGenSummary === null) {
      generativeSummaryText = null;
  }
  const generativeSummary = mergeField(generativeSummaryText, existing?.generative_summary);
  
  const rawNeighSummary = record['neighborhood_summary'] !== undefined ? record['neighborhood_summary'] : (record['neighborhoodSummary'] !== undefined ? record['neighborhoodSummary'] : existing?.neighborhood_summary);
  let neighborhoodSummaryText: string | null | undefined;
  if (isRecord(rawNeighSummary)) {
      const overview = isRecord(rawNeighSummary['overview']) ? rawNeighSummary['overview'] : null;
      neighborhoodSummaryText = (typeof overview?.['text'] === 'string' ? overview['text'] : null) || (typeof rawNeighSummary['text'] === 'string' ? rawNeighSummary['text'] : null);
  } else if (typeof rawNeighSummary === 'string') {
      neighborhoodSummaryText = rawNeighSummary;
  } else if (rawNeighSummary === null) {
      neighborhoodSummaryText = null;
  }
  const neighborhoodSummary = mergeField(neighborhoodSummaryText, existing?.neighborhood_summary);

  const allowsDogs = mergeField(record['allows_dogs'] !== undefined ? Boolean(record['allows_dogs']) : null, existing?.allows_dogs);
  const hasEvCharging = mergeField(record['has_ev_charging'] !== undefined ? Boolean(record['has_ev_charging']) : null, existing?.has_ev_charging);
  const servesWine = mergeField(record['serves_wine'] !== undefined ? Boolean(record['serves_wine']) : null, existing?.serves_wine);
  const goodForChildren = mergeField(record['good_for_children'] !== undefined ? Boolean(record['good_for_children']) : null, existing?.good_for_children);
  const outdoorSeating = mergeField(record['outdoor_seating'] !== undefined ? Boolean(record['outdoor_seating']) : null, existing?.outdoor_seating);
  
  const sourceParking = record['parking_options'] !== undefined 
    ? record['parking_options'] 
    : (record['parkingOptions'] !== undefined ? record['parkingOptions'] : undefined);
  let rawParkingOptions: Record<string, any> | null | undefined;
  if (isRecord(sourceParking)) {
    rawParkingOptions = sourceParking as Record<string, any>;
  } else if (sourceParking !== undefined) {
    rawParkingOptions = null;
  }
  if (isRecord(rawParkingOptions)) {
    const pObj = rawParkingOptions;
    if (pObj['freeParking'] === undefined) {
      const hasFree = 
        pObj['freeParkingLot'] === true || 
        pObj['freeStreetParking'] === true || 
        pObj['freeGarageParking'] === true ||
        pObj['freeValetParking'] === true;
        
      const hasPaid = 
        pObj['paidParkingLot'] === true || 
        pObj['paidStreetParking'] === true || 
        pObj['paidGarageParking'] === true ||
        pObj['paidValetParking'] === true;

      let freeParkingVal: boolean | undefined = undefined;
      if (hasFree) {
        freeParkingVal = true;
      } else if (hasPaid) {
        freeParkingVal = false;
      }

      if (freeParkingVal !== undefined) {
        rawParkingOptions = {
          ...pObj,
          freeParking: freeParkingVal
        };
      }
    }
  }
  const parkingOptions = mergeField(rawParkingOptions, existing?.parking_options) ?? null;

  const sourceAccessibility = record['accessibility_options'] !== undefined 
    ? record['accessibility_options'] 
    : (record['accessibility_flags'] !== undefined ? record['accessibility_flags'] : (record['accessibilityOptions'] !== undefined ? record['accessibilityOptions'] : undefined));
  let rawAccessibility: Record<string, any> | null | undefined;
  if (isRecord(sourceAccessibility)) {
    rawAccessibility = sourceAccessibility as Record<string, any>;
  } else if (sourceAccessibility !== undefined) {
    rawAccessibility = null;
  }
  const accessibilityOptions = mergeField(rawAccessibility, existing?.accessibility_options) ?? null;

  const sourcePrimaryPhoto = typeof record['primary_photo_reference'] === 'string' 
    ? record['primary_photo_reference'] 
    : (typeof record['primaryPhotoReference'] === 'string' ? record['primaryPhotoReference'] : null);
  const primaryPhotoReference = mergeField(sourcePrimaryPhoto, existing?.primary_photo_reference);

  const sourcePhotoRefs = Array.isArray(record['photo_references']) 
    ? (record['photo_references'] as string[]) 
    : (Array.isArray(record['photoReferences']) ? (record['photoReferences'] as string[]) : null);
  const photoReferences = mergeField(sourcePhotoRefs, existing?.photo_references);

  const cachedPhotos = isRecord(record['cached_photos']) 
    ? (record['cached_photos'] as Record<string, string>) 
    : (isRecord(record['cachedPhotos']) ? (record['cachedPhotos'] as Record<string, string>) : null);

  // Logic to preserve existing visits unless new data overrides it
  // CRITICAL FIX: If source explicitly says userVisited is false, we MUST clear the visits array to prevent "ghost visits"
  // from persisting in the local cache after a deletion sync.
  let visits = (isWineryDetailsRpc(source) && source.visits) ? source.visits : (Array.isArray(record['visits']) ? (record['visits'] as Visit[]) : existing?.visits || []);
  
  if (
    ('user_visited' in record && record['user_visited'] === false) ||
    ('userVisited' in record && record['userVisited'] === false) ||
    record['user_visited'] === false ||
    record['userVisited'] === false
  ) {
      visits = [];
  }

  let rawTripInfo: Record<string, unknown> | undefined;
  if ('trip_info' in record && Array.isArray(record['trip_info']) && record['trip_info'].length > 0 && isRecord(record['trip_info'][0])) {
    rawTripInfo = record['trip_info'][0];
  }
  const rawTripId = rawTripInfo?.['trip_id'] !== undefined ? rawTripInfo['trip_id'] : (record['trip_id'] !== undefined ? record['trip_id'] : existing?.trip_id);
  const trip_id = (rawTripId !== undefined && rawTripId !== null && !isNaN(Number(rawTripId))) 
    ? Number(rawTripId) 
    : undefined;
  const trip_name = (typeof rawTripInfo?.['trip_name'] === 'string' ? rawTripInfo['trip_name'] : undefined) || (typeof record['trip_name'] === 'string' ? record['trip_name'] : existing?.trip_name);
  const trip_date = (typeof rawTripInfo?.['trip_date'] === 'string' ? rawTripInfo['trip_date'] : undefined) || (typeof record['trip_date'] === 'string' ? record['trip_date'] : existing?.trip_date);

  // Construct the Standard Object
  const standardized: Winery = {
    id: googleId,
    dbId: dbId,
    name: name,
    address: address || existing?.address || '',
    latitude: lat,
    longitude: lng,
    phone,
    website,
    rating,
    userRatingCount,
    
    // Complex fields that might be missing in partial updates
    openingHours,
    reviews,
    reservable,
    
    // User State (Preserve if not provided by source)
    userVisited: userVisited,
    onWishlist: onWishlist,
    isFavorite: isFavorite,
    favoriteIsPrivate: favoriteIsPrivate,
    wishlistIsPrivate: wishlistIsPrivate,
    
    // Arrays (Preserve)
    visits: visits,
    
    // Trip Context
    trip_id: trip_id,
    trip_name: trip_name,
    trip_date: trip_date,

    // Enrichment (Places API v1)
    enrichment_tier: enrichmentTier,
    last_enriched_at: lastEnrichedAt,
    generative_summary: generativeSummary,
    neighborhood_summary: neighborhoodSummary,
    allows_dogs: allowsDogs,
    has_ev_charging: hasEvCharging,
    serves_wine: servesWine,
    good_for_children: goodForChildren,
    outdoor_seating: outdoorSeating,
    parking_options: parkingOptions,
    accessibility_options: accessibilityOptions,
    primary_photo_reference: primaryPhotoReference,
    photo_references: photoReferences,
    cached_photos: cachedPhotos,
    varietals: mergeField(Array.isArray(record['varietals']) ? (record['varietals'] as WineryVarietal[]) : null, existing?.varietals),
    vibe_tags: mergeField(Array.isArray(record['vibe_tags']) ? (record['vibe_tags'] as string[]) : null, existing?.vibe_tags),
  };

  // Final Validation
  if (!standardized.name || isNaN(standardized.latitude) || isNaN(standardized.longitude)) {
    console.warn('[Validation] Invalid winery data:', standardized);
    return null;
  }

  return standardized;
};

/**
 * Returns vibe/specialty tags for a winery.
 * If vibe_tags exists and is non-empty, returns it.
 * Otherwise, maps Boolean attributes to text badges.
 */
export const getWineryVibeTags = (winery: Partial<Winery> | null | undefined): string[] => {
  if (!winery) return [];
  if (Array.isArray(winery.vibe_tags) && winery.vibe_tags.length > 0) {
    return winery.vibe_tags;
  }
  
  const tags: string[] = [];
  if (winery.allows_dogs === true) tags.push("Dog Friendly");
  if (winery.has_ev_charging === true) tags.push("EV Charging");
  if (winery.outdoor_seating === true) tags.push("Outdoor Seating");
  if (winery.good_for_children === true) tags.push("Kid Friendly");
  
  return tags;
};

// Expose for E2E testing
if (typeof window !== 'undefined') {
    window.standardizeWineryData = standardizeWineryData;
    window.getWineryVibeTags = getWineryVibeTags;
}

