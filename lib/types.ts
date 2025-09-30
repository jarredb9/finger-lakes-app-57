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
    updateNote?: {
        wineryId: number;
        notes: string;
    };
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
