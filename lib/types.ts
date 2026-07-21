import { Database, Json } from './database.types';

type Tables = Database['public']['Tables'];

// Basic Row Types
export type DbWinery = Tables['wineries']['Row'];
export type DbTrip = Tables['trips']['Row'];
export type DbVisit = Tables['visits']['Row'];
export type DbProfile = Tables['profiles']['Row'];
export type DbFriend = Tables['friends']['Row'];

// Distinct types for IDs to prevent confusion between Google Place IDs and Database IDs
export type GooglePlaceId = string & { __brand: 'GooglePlaceId' };
export type WineryDbId = number & { __brand: 'WineryDbId' };

// RPC Return Types
export interface MapMarkerRpc {
  id: WineryDbId;
  google_place_id: GooglePlaceId;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  is_favorite: boolean;
  on_wishlist: boolean;
  user_visited: boolean;
  is_favorite_private?: boolean;
  on_wishlist_private?: boolean;
  google_rating?: number | null;
  opening_hours?: Json | null;
  phone?: string | null;
}

export interface WineryDetailsRpc {
  id: WineryDbId;
  google_place_id: GooglePlaceId;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  google_rating: number | null;
  user_rating_count: number | null;
  opening_hours: Json | null; // Use Json for unstructured JSONB
  reviews: Json | null; // Use Json for unstructured JSONB
  reservable: boolean | null;
  is_favorite: boolean;
  on_wishlist: boolean;
  user_visited: boolean;
  is_favorite_private?: boolean;
  on_wishlist_private?: boolean;
  visits: Visit[]; // Assuming this RPC also returns visits
  trip_info?: any; // Optional as it's not always returned
}

// A more complete DbWinery type that includes the joined user data from RPCs
// This is the shape of data from RPCs like get_all_wineries_with_user_data
export interface DbWineryWithUserData extends DbWinery {
  is_favorite: boolean;
  on_wishlist: boolean;
  user_visited: boolean;
  is_favorite_private?: boolean;
  on_wishlist_private?: boolean;
  visits?: Visit[]; // Visits can be included
  trip_id?: number;
  trip_name?: string;
  trip_date?: string;
  // May also include other joined data
}


export type SyncStatus = 'synced' | 'pending' | 'error';

export interface SyncItem {
  id: string; // UUID or timestamp-based ID
  type: 'log_visit' | 'update_visit' | 'delete_visit' | 'create_trip' | 'update_trip' | 'delete_trip' | 'update_profile' | 'social_action' | 'winery_action';
  encryptedPayload: string; // AES-GCM encrypted JSON
  createdAt: string;
  userId: string; // To ensure multi-user isolation on the same device
  status?: SyncStatus;
}

// Derived Interfaces (Frontend Models)

export interface Visit {
  id?: string; // String for temp ID (optimistic updates), number for DB ID (will refine later if needed)
  user_id?: string;
  visit_date: string;
  user_review: string;
  rating?: number;
  photos?: string[];
  winery_id?: WineryDbId; // Use new distinct type
  is_private?: boolean;
  updated_at?: string;
  syncStatus?: SyncStatus;
  // Expanded fields often joined in queries
  wineries?: {
    id: WineryDbId; // Use new distinct type
    google_place_id: GooglePlaceId; // Use new distinct type
    name: string;
    address: string;
    latitude: number; // Numeric in DB
    longitude: number;
  };
  profiles?: {
    name: string;
  };
}

export interface PlaceReview {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number;
  author_url?: string | null;
  language?: string | null;
  profile_photo_url?: string | null;
}

export interface OpeningHoursPoint {
  day: number;
  hour: number;
  minute: number;
}

export interface OpeningHours {
  open_now?: boolean;
  periods?: { open: OpeningHoursPoint; close?: OpeningHoursPoint | null }[];
  weekday_text?: string[];
  toJSON?: () => Json; // From Google Places API
}

export interface Winery {
  // The 'id' here is strictly the Google Place ID for UI/Map consistency.
  id: GooglePlaceId; 
  // Use 'dbId' for database operations.
  dbId?: WineryDbId | null; 
  
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  
  phone?: string | null;
  website?: string | null;
  rating?: number | null; // Google Rating
  userRatingCount?: number | null;
  
  // User interaction state (derived)
  userVisited?: boolean;
  onWishlist?: boolean;
  isFavorite?: boolean;
  favoriteIsPrivate?: boolean;
  wishlistIsPrivate?: boolean;
  
  visits?: Visit[];
  
  // Trip context (derived)
  trip_id?: number;
  trip_name?: string;
  trip_date?: string;
  notes?: string;
  
  // Extended Details (Lazy Loaded)
  openingHours?: OpeningHours | null;
  reviews?: PlaceReview[] | null;
  reservable?: boolean | null;

  // Enrichment (Places API v1)
  enrichment_tier?: 'basic' | 'enriched' | 'full';
  last_enriched_at?: string | null;
  generative_summary?: string | null;
  neighborhood_summary?: string | null;
  allows_dogs?: boolean | null;
  has_ev_charging?: boolean | null;
  serves_wine?: boolean | null;
  good_for_children?: boolean | null;
  outdoor_seating?: boolean | null;
  primary_photo_reference?: string | null;
  photo_references?: string[] | null;
  cached_photos?: Record<string, string> | null;
  parking_options?: Record<string, any> | null;
  accessibility_options?: Record<string, any> | null;
  varietals?: WineryVarietal[] | null;
  vibe_tags?: string[] | null;
}

export interface WineryVarietal {
  name: string;
  dryness?: number; // 0 (Dry) to 10 (Sweet)
  sweetness?: number; // 0 (Dry) to 10 (Sweet)
  body?: number; // 0 (Light) to 10 (Full Body)
  tasting_notes?: string;
  description?: string;
  price?: string;
}

/**
 * Google Places API (New) / V1 Response Interface
 */
export interface GoogleV1Place {
  id: string;
  displayName: {
    text: string;
    languageCode: string;
  };
  formattedAddress: string;
  location: {
    latitude: number;
    longitude: number;
  };
  viewport: {
    low: { latitude: number; longitude: number };
    high: { latitude: number; longitude: number };
  };
  types: string[];
  photos?: {
    name: string;
    widthPx: number;
    heightPx: number;
    authorAttributions: {
      displayName: string;
      uri: string;
      photoUri: string;
    }[];
  }[];
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  generativeSummary?: {
    overview: {
      text: string;
      languageCode: string;
    };
  };
  neighborhoodSummary?: {
    overview: {
      text: string;
      languageCode: string;
    };
  };
  editorialSummary?: {
    text: string;
    languageCode: string;
  };
  reviews?: unknown[];
  servesWine?: boolean;
  allowsDogs?: boolean;
  goodForChildren?: boolean;
  outdoorSeating?: boolean;
  parkingOptions?: Record<string, unknown>;
  accessibilityOptions?: Record<string, unknown>;
  evChargeOptions?: Record<string, any> | null;
}

export interface TripMember {
    id: string;
    role: 'owner' | 'member';
    status: 'invited' | 'joined';
    name: string;
    email: string;
}

export interface Trip {
    id: number;
    user_id: string;
    trip_date: string;
    name?: string;
    wineries: Winery[];
    wineries_count?: number;
    members?: TripMember[];
    
    // UI-specific fields for form handling
    wineryOrder?: WineryDbId[]; // Use new distinct type
    removeWineryId?: WineryDbId; // Use new distinct type
    notes?: string;
    updateNote?: { wineryId: WineryDbId; notes: string; } | { notes: Record<WineryDbId, string>; }; // Use new distinct type
    owner_id?: string;
    updated_at?: string;
    syncStatus?: SyncStatus;
}

export interface VisitWithWinery extends Visit {
  wineryName?: string; // Optional convenience fields
  wineryId?: GooglePlaceId;
  friend_visits?: any[]; // From social joined queries
  wineries: {
    id: WineryDbId;
    google_place_id: GooglePlaceId;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  };
}

export interface Friend {
  id: string;
  name: string;
  email: string;
  status?: 'pending' | 'accepted';
  requester_id?: string;
  privacy_level?: 'public' | 'friends_only' | 'private';
}

export interface FriendRequest {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  requester_name?: string;
  requester_email?: string;
  receiver_name?: string;
  receiver_email?: string;
}

export interface FriendActivity {
  activity_type: string;
  created_at: string;
  activity_user_id: string;
  user_name: string;
  user_email: string;
  winery_id: number;
  winery_name: string;
  latitude: number;
  longitude: number;
  visit_rating: number | null;
  visit_review: string | null;
  visit_photos: string[] | null;
}

export interface FriendRating {
  user_id: string;
  name: string;
  rating: number;
  user_review: string;
  photos?: string[];
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}
