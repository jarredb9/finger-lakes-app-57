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
  lat: number;
  lng: number;
  is_favorite: boolean;
  on_wishlist: boolean;
  user_visited: boolean;
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
  opening_hours: Json | null; // Use Json for unstructured JSONB
  reviews: Json | null; // Use Json for unstructured JSONB
  reservable: boolean | null;
  is_favorite: boolean;
  on_wishlist: boolean;
  user_visited: boolean;
  visits: Visit[]; // Assuming this RPC also returns visits
  trip_info?: any; // Optional as it's not always returned
}

// A more complete DbWinery type that includes the joined user data from RPCs
// This is the shape of data from RPCs like get_all_wineries_with_user_data
export interface DbWineryWithUserData extends DbWinery {
  is_favorite: boolean;
  on_wishlist: boolean;
  user_visited: boolean;
  visits?: Visit[]; // Visits can be included
  trip_id?: number;
  trip_name?: string;
  trip_date?: string;
  // May also include other joined data
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
  // Expanded fields often joined in queries
  wineries?: {
    id: WineryDbId; // Use new distinct type
    google_place_id: GooglePlaceId; // Use new distinct type
    name: string;
    address: string;
    latitude: string; // Numeric in DB but often string in API/RPC responses
    longitude: string;
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
  lat: number;
  lng: number;
  
  phone?: string | null;
  website?: string | null;
  rating?: number | null; // Google Rating
  
  // User interaction state (derived)
  userVisited?: boolean;
  onWishlist?: boolean;
  isFavorite?: boolean;
  
  visits?: Visit[];
  
  // Trip context (derived)
  trip_id?: number;
  trip_name?: string;
  trip_date?: string;
  notes?: string;
  
  // Extended Details (Lazy Loaded)
  openingHours?: OpeningHours | null;
  reviews?: PlaceReview[];
  reservable?: boolean | null;
}

export interface Trip {
    id: number;
    user_id: string;
    trip_date: string;
    name?: string;
    members?: string[];
    wineries: Winery[];
    wineries_count?: number;
    
    // UI-specific fields for form handling
    wineryOrder?: WineryDbId[]; // Use new distinct type
    removeWineryId?: WineryDbId; // Use new distinct type
    notes?: string;
    updateNote?: { wineryId: WineryDbId; notes: string; } | { notes: Record<WineryDbId, string>; }; // Use new distinct type
    owner_id?: string;
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
    latitude: string;
    longitude: string;
  };
}

export interface Friend {
  id: string;
  name: string;
  email: string;
  status?: 'pending' | 'accepted';
  requester_id?: string;
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