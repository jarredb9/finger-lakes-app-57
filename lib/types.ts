export interface Visit {
  id?: string;
  visit_date: string;
  user_review: string;
  rating?: number;
  photos?: string[];
  wineries: {
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
}