// file: lib/types.ts
export interface Visit {
  id?: string;
  user_id?: string;
  visit_date: string;
  user_review: string;
  rating?: number;
  photos?: string[];
  wineries?: {
    id: number;
    google_place_id: string;
    name: string;
    address: string;
    latitude: string;
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
  id: string; // This is the google_place_id
  dbId?: number | null | undefined; // This will be the serial ID from our database
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  rating?: number;
  userVisited?: boolean;
  onWishlist?: boolean;
  isFavorite?: boolean;
  visits?: Visit[];
  trip_id?: number;
  trip_name?: string;
  trip_date?: string;
  notes?: string;
  openingHours?: OpeningHours | null;
  reviews?: PlaceReview[];
  reservable?: boolean;
}

export interface Trip {
    id: number;
    user_id: string;
    trip_date: string;
    name?: string;
    wineries: Winery[];
    members?: string[];
    wineryOrder?: number[];
    removeWineryId?: number;
    notes?: string;
    // Can be a single note update or a batch update of multiple notes
    updateNote?: { wineryId: number; notes: string; } | { notes: Record<number, string>; };
    owner_id?: string
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
