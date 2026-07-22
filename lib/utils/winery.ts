import { Winery, DbWinery, GooglePlaceId, WineryDbId, OpeningHours, PlaceReview, MapMarkerRpc, WineryDetailsRpc } from '@/lib/types'; // Import RPC types and Json
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

// Helper to check if a source is GoogleWinery
function isGoogleWinery(source: any): source is GoogleWinery {
  return 'place_id' in source && 'geometry' in source;
}

// Helper to check if a source is MapMarkerRpc
function isMapMarkerRpc(source: any): source is MapMarkerRpc {
  // MapMarkerRpc always has latitude/longitude (standardized) or lat/lng (legacy)
  // and some form of google id (google_place_id OR id as string)
  const hasGoogleId = 'google_place_id' in source || (typeof source.id === 'string');
  const hasCoords = 'latitude' in source || 'lat' in source;
  
  return (
    hasGoogleId &&
    hasCoords &&
    !('visits' in source)
  );
}

// Helper to check if a source is WineryDetailsRpc
function isWineryDetailsRpc(source: any): source is WineryDetailsRpc {
    // WineryDetailsRpc is the ONLY one with 'visits'
    const hasGoogleId = 'google_place_id' in source || (typeof source.id === 'string');
    return hasGoogleId && 'visits' in source; 
}

// Helper to check if a source has raw DbWinery properties (without extended user data from RPC)
function isRawDbWinery(source: any): source is DbWinery {
  return !isGoogleWinery(source) && !isMapMarkerRpc(source) && !isWineryDetailsRpc(source) && 'created_at' in source;
}

// Helper to parse Json reviews to PlaceReview[]
function parseReviewsJson(json: any): PlaceReview[] | null | undefined {
    if (json === undefined) return undefined;
    if (json === null) return null;
    if (Array.isArray(json)) {
        const normalized: PlaceReview[] = [];
        for (const item of json) {
            if (!item || typeof item !== 'object') continue;

            const textObj = item.text;
            let textVal = '';
            let languageVal: string | null = null;
            if (typeof textObj === 'object' && textObj !== null) {
                textVal = String(textObj.text || '');
                languageVal = textObj.languageCode ? String(textObj.languageCode) : null;
            } else if (typeof textObj === 'string') {
                textVal = textObj;
            }

            const authorAttr = item.authorAttribution;
            let authorNameVal = '';
            let authorUrlVal: string | null = null;
            let photoUriVal: string | null = null;
            if (typeof authorAttr === 'object' && authorAttr !== null) {
                authorNameVal = String(authorAttr.displayName || '');
                authorUrlVal = authorAttr.uri ? String(authorAttr.uri) : null;
                photoUriVal = authorAttr.photoUri ? String(authorAttr.photoUri) : null;
            } else if ('author_name' in item) {
                authorNameVal = String(item.author_name || '');
            }

            if (!authorNameVal) {
                authorNameVal = 'A Google User';
            }

            const ratingVal = typeof item.rating === 'number' ? item.rating : 0;
            const relativeTimeVal = String(item.relativePublishTimeDescription || item.relative_time_description || '');
            
            let timeVal = 0;
            if (typeof item.time === 'number') {
                timeVal = item.time;
            } else if (item.publishTime) {
                timeVal = Math.floor(new Date(item.publishTime).getTime() / 1000);
            }

            normalized.push({
                author_name: authorNameVal,
                rating: ratingVal,
                relative_time_description: relativeTimeVal,
                text: textVal,
                time: timeVal,
                author_url: authorUrlVal || item.author_url || null,
                language: languageVal || item.language || null,
                profile_photo_url: photoUriVal || item.profile_photo_url || null,
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
    if (typeof json === 'object' && json !== null && 'periods' in json) {
        const obj = json as any;
        return {
            ...obj,
            weekday_text: obj.weekday_text || obj.weekdayDescriptions || obj.weekday_descriptions
        } as OpeningHours;
    }
    return null;
}


/**
 * Standardizes winery data from various sources (DB, Google API, Mixed) into a single Winery object.
 * This is the single source of truth for data shape transformations.
 */
export const standardizeWineryData = (
  source: any, 
  existing?: Winery
): Winery | null => {
  if (!source) return null;

  // 1. Resolve ID (Google Place ID)
  // RPCs are inconsistent: some return 'google_place_id', some return 'google_place_id as id'
  const googleId = (
    (isGoogleWinery(source) && source.place_id) ||
    source.google_place_id ||
    (typeof source.id === 'string' && !/^\d+$/.test(source.id) ? source.id : undefined) ||
    existing?.id
  ) as GooglePlaceId;

  if (!googleId) {
    console.warn('[Validation] Winery missing Google Place ID:', source);
    return null;
  }

  // 2. Resolve DB ID
  let resolvedDbId: number | undefined;
  
  if (typeof source.dbId === 'number') {
      resolvedDbId = source.dbId;
  } else if (typeof source.id === 'number') {
      resolvedDbId = source.id;
  } else if (typeof source.id === 'string' && /^\d+$/.test(source.id)) {
      resolvedDbId = Number(source.id);
  } else if (isRawDbWinery(source) && typeof (source as DbWinery).id === 'number') {
      resolvedDbId = (source as DbWinery).id;
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

  if (source.location && typeof source.location.latitude === 'number' && typeof source.location.longitude === 'number') {
    // V1 / GoogleV1Place structure
    lat = source.location.latitude;
    lng = source.location.longitude;
  } else if (isGoogleWinery(source) && source.geometry?.location) {
    lat = typeof source.geometry.location.lat === 'function' ? source.geometry.location.lat() : source.geometry.location.lat;
    lng = typeof source.geometry.location.lng === 'function' ? source.geometry.location.lng() : source.geometry.location.lng;
  } else if ('latitude' in source && 'longitude' in source && (source.latitude !== null && source.longitude !== null)) {
    lat = Number(source.latitude);
    lng = Number(source.longitude);
  } else if ('lat' in source && ('lng' in source || 'long' in source)) { 
    // Legacy support for older RPCs or mocks
    lat = Number(source.lat);
    lng = Number(source.lng || source.long);
  } else {
    console.warn('[Validation] No valid coordinates found for source:', source);
    return null; 
  }
  
  // Determine incoming and existing enrichment tiers
  const incomingTier = source.enrichment_tier || source.enrichmentTier || (isWineryDetailsRpc(source) ? 'enriched' : undefined);
  const isIncomingEnriched = incomingTier === 'enriched' || incomingTier === 'full';
  const existingTier = existing?.enrichment_tier;
  const enrichmentTier = (existingTier === 'enriched' || existingTier === 'full') && (incomingTier !== 'enriched' && incomingTier !== 'full')
    ? existingTier
    : (incomingTier || existingTier || 'basic');

  // Helper to merge fields while preventing overwriting of enriched data by basic markers
  const mergeField = <T>(newVal: T | null | undefined, existingVal: T | null | undefined): T | null | undefined => {
    if (!isIncomingEnriched && existingVal !== undefined && existingVal !== null) {
      return existingVal;
    }
    return newVal !== undefined && newVal !== null ? newVal : existingVal;
  };

  // Conditionally access properties using type guards
  const name = source.name || existing?.name || 'Unknown Winery';
  const address = isGoogleWinery(source) ? (source.formatted_address || source.address) : source.address;
  
  // Resolve fields from source, preserving existing data if source is null/undefined (Merge Guard)
  const sourcePhone = isGoogleWinery(source) ? (source.international_phone_number || source.phone) : isRawDbWinery(source) ? source.phone : (isMapMarkerRpc(source) ? (source as any).phone : isWineryDetailsRpc(source) ? (source as any).phone : source.phone);
  const phone = mergeField(sourcePhone, existing?.phone);

  const sourceWebsite = isGoogleWinery(source) ? source.website : isRawDbWinery(source) ? source.website : (isMapMarkerRpc(source) ? null : isWineryDetailsRpc(source) ? (source as any).website : source.website);
  const website = mergeField(sourceWebsite, existing?.website);

  const sourceRating = isGoogleWinery(source) 
    ? (source.rating || source.google_rating) 
    : isRawDbWinery(source) 
        ? source.google_rating 
        : (isMapMarkerRpc(source) 
            ? ((source as any).google_rating ?? (source as any).rating) 
            : isWineryDetailsRpc(source) 
                ? ((source as any).google_rating ?? (source as any).rating) 
                : source.rating);
  const rating = mergeField(sourceRating, existing?.rating);

  const sourceUserRatingCount = isGoogleWinery(source) 
    ? source.userRatingCount 
    : isRawDbWinery(source) 
        ? (source as any).user_rating_count 
        : (isWineryDetailsRpc(source) 
            ? ((source as any).user_rating_count ?? (source as any).userRatingCount) 
            : (source.userRatingCount ?? (source as any).user_rating_count ?? null));
  const userRatingCount = mergeField(sourceUserRatingCount, existing?.userRatingCount);

  // Handle openingHours more carefully to avoid overwriting with null if missing from source
  const sourceOpeningHoursRaw = isGoogleWinery(source) 
    ? source.opening_hours 
    : (isWineryDetailsRpc(source) 
        ? ((source as any).opening_hours ?? (source as any).openingHours) 
        : (isRawDbWinery(source) 
            ? source.opening_hours 
            : (isMapMarkerRpc(source) ? ((source as any).opening_hours ?? (source as any).openingHours) : (source.openingHours || (source as any).opening_hours))));
  const parsedOpeningHours = parseOpeningHoursJson(sourceOpeningHoursRaw);
  const openingHours = mergeField(parsedOpeningHours, existing?.openingHours);
  
  const rawReviewsSource = (
    isGoogleWinery(source)
      ? source.reviews
      : (isWineryDetailsRpc(source)
          ? (source as any).reviews
          : (isRawDbWinery(source) ? source.reviews : source.reviews))
  );
  const parsedReviews = parseReviewsJson(rawReviewsSource);
  const reviews = mergeField(parsedReviews, existing?.reviews);

  const sourceReservable = isGoogleWinery(source) ? source.reservable : (isWineryDetailsRpc(source) ? (source as any).reservable : (isRawDbWinery(source) ? source.reservable : source.reservable));
  const reservable = sourceReservable !== undefined && sourceReservable !== null ? sourceReservable : existing?.reservable;

  const userVisited = source.user_visited !== undefined ? source.user_visited : (source.userVisited !== undefined ? source.userVisited : (existing?.userVisited ?? false));
  const onWishlist = source.on_wishlist !== undefined ? source.on_wishlist : (source.onWishlist !== undefined ? source.onWishlist : (existing?.onWishlist ?? false));
  const isFavorite = source.is_favorite !== undefined ? source.is_favorite : (source.isFavorite !== undefined ? source.isFavorite : (existing?.isFavorite ?? false));
  
  const favoriteIsPrivate = source.is_favorite_private !== undefined ? source.is_favorite_private : (source.favorite_is_private !== undefined ? source.favorite_is_private : (source.favoriteIsPrivate !== undefined ? source.favoriteIsPrivate : (existing?.favoriteIsPrivate ?? false)));
  const wishlistIsPrivate = source.on_wishlist_private !== undefined ? source.on_wishlist_private : (source.wishlist_is_private !== undefined ? source.wishlist_is_private : (existing?.wishlistIsPrivate ?? false));

  // Enrichment (Places API v1)
  const lastEnrichedAt = source.last_enriched_at || existing?.last_enriched_at;
  
  // Handle generative_summary potentially being an object (from DB) or a string (from Edge Function)
  let generativeSummary = source.generative_summary !== undefined ? source.generative_summary : (source.generativeSummary !== undefined ? source.generativeSummary : existing?.generative_summary);
  if (typeof generativeSummary === 'object' && generativeSummary !== null) {
      const summaryObj = generativeSummary as any;
      generativeSummary = summaryObj.overview?.text || summaryObj.text || null;
  }
  generativeSummary = mergeField(generativeSummary, existing?.generative_summary);
  
  let neighborhoodSummary = source.neighborhood_summary !== undefined ? source.neighborhood_summary : (source.neighborhoodSummary !== undefined ? source.neighborhoodSummary : existing?.neighborhood_summary);
  if (typeof neighborhoodSummary === 'object' && neighborhoodSummary !== null) {
      const summaryObj = neighborhoodSummary as any;
      neighborhoodSummary = summaryObj.overview?.text || summaryObj.text || null;
  }
  neighborhoodSummary = mergeField(neighborhoodSummary, existing?.neighborhood_summary);

  const allowsDogs = mergeField(source.allows_dogs !== undefined ? source.allows_dogs : null, existing?.allows_dogs);
  const hasEvCharging = mergeField(source.has_ev_charging !== undefined ? source.has_ev_charging : null, existing?.has_ev_charging);
  const servesWine = mergeField(source.serves_wine !== undefined ? source.serves_wine : null, existing?.serves_wine);
  const goodForChildren = mergeField(source.good_for_children !== undefined ? source.good_for_children : null, existing?.good_for_children);
  const outdoorSeating = mergeField(source.outdoor_seating !== undefined ? source.outdoor_seating : null, existing?.outdoor_seating);
  
  let parkingOptions = source.parking_options !== undefined ? source.parking_options : null;
  if (parkingOptions && typeof parkingOptions === 'object' && !Array.isArray(parkingOptions)) {
    const pObj = parkingOptions as Record<string, any>;
    if (pObj.freeParking === undefined) {
      const hasFree = 
        pObj.freeParkingLot === true || 
        pObj.freeStreetParking === true || 
        pObj.freeGarageParking === true ||
        pObj.freeValetParking === true;
        
      const hasPaid = 
        pObj.paidParkingLot === true || 
        pObj.paidStreetParking === true || 
        pObj.paidGarageParking === true ||
        pObj.paidValetParking === true;

      let freeParkingVal: boolean | undefined = undefined;
      if (hasFree) {
        freeParkingVal = true;
      } else if (hasPaid) {
        freeParkingVal = false;
      }

      if (freeParkingVal !== undefined) {
        parkingOptions = {
          ...pObj,
          freeParking: freeParkingVal
        };
      }
    }
  }
  parkingOptions = mergeField(parkingOptions, existing?.parking_options);

  const sourceAccessibility = source.accessibility_options !== undefined 
    ? source.accessibility_options 
    : (source.accessibility_flags !== undefined ? source.accessibility_flags : null);
  const accessibilityOptions = mergeField(sourceAccessibility, existing?.accessibility_options);

  const sourcePrimaryPhoto = source.primary_photo_reference !== undefined ? source.primary_photo_reference : (source.primaryPhotoReference !== undefined ? source.primaryPhotoReference : null);
  const primaryPhotoReference = mergeField(sourcePrimaryPhoto, existing?.primary_photo_reference);

  const sourcePhotoRefs = source.photo_references !== undefined ? source.photo_references : (source.photoReferences !== undefined ? source.photoReferences : null);
  const photoReferences = mergeField(sourcePhotoRefs, existing?.photo_references);

  const cachedPhotos = mergeField(source.cached_photos !== undefined ? source.cached_photos : null, existing?.cached_photos);

  // Logic to preserve existing visits unless new data overrides it
  // CRITICAL FIX: If source explicitly says userVisited is false, we MUST clear the visits array to prevent "ghost visits"
  // from persisting in the local cache after a deletion sync.
  let visits = (isWineryDetailsRpc(source) && source.visits) ? source.visits : (source.visits || existing?.visits || []);
  
  if ('user_visited' in source && source.user_visited === false) {
      visits = [];
  }

  const trip_id = (isWineryDetailsRpc(source) && source.trip_info?.[0]?.trip_id) ? source.trip_info[0].trip_id : (source.trip_id || existing?.trip_id);
  const trip_name = (isWineryDetailsRpc(source) && source.trip_info?.[0]?.trip_name) ? source.trip_info[0].trip_name : (source.trip_name || existing?.trip_name);
  const trip_date = (isWineryDetailsRpc(source) && source.trip_info?.[0]?.trip_date) ? source.trip_info[0].trip_date : (source.trip_date || existing?.trip_date);
  
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
    varietals: mergeField(source.varietals !== undefined ? source.varietals : null, existing?.varietals),
    vibe_tags: mergeField(source.vibe_tags !== undefined ? source.vibe_tags : null, existing?.vibe_tags),
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
    (window as any).standardizeWineryData = standardizeWineryData;
    (window as any).getWineryVibeTags = getWineryVibeTags;
}

