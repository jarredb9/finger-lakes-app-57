import { Database } from './database.types';

type Tables = Database['public']['Tables'];

// Basic Row Types
export type DbWinery = Tables['wineries']['Row'];
export type DbTrip = Tables['trips']['Row'];
export type DbVisit = Tables['visits']['Row'];
export type DbProfile = Tables['profiles']['Row'];
export type DbFriend = Tables['friends']['Row'];

// Derived Interfaces (Frontend Models)

export interface Visit {
  id?: string | number; // String for temp ID, number for DB ID
  user_id?: string;
  visit_date: string;
  user_review: string;
  rating?: number;
  photos?: string[];
  winery_id?: number;
  // Expanded fields often joined in queries
  wineries?: {
    id: number;
    google_place_id: string;
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
  toJSON?: () => any; // From Google Places API
}

export interface Winery {
  // The 'id' here is strictly the Google Place ID for UI/Map consistency.
  // Use 'dbId' for database operations.
  id: string; 
  dbId?: number | null; 
  
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
    
    // UI-specific fields for form handling
    wineryOrder?: number[];
    removeWineryId?: number;
    notes?: string;
    updateNote?: { wineryId: number; notes: string; } | { notes: Record<number, string>; };
    owner_id?: string;
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