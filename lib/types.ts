// file: lib/types.ts
export interface Visit {
  id?: string;
  visit_date: string;
  user_review: string;
  rating?: number;
  photos?: string[];
  // This was previously just an object, now it's correctly typed
  wineries?: {
    id: number;
    google_place_id: string;
    name: string;
    address: string;
    latitude: string;
    longitude: string;
  };
}

export interface Winery {
  id: string; // This is the google_place_id
  dbId?: number; // This will be the serial ID from our database
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
  // ** FIX: Add new optional properties for trip information **
  trip_id?: number;
  trip_name?: string;
  trip_date?: string;
}

export interface Trip {
    id: number;
    user_id: string;
    trip_date: string;
    name?: string;
    wineries: Winery[];
    members?: string[];
}