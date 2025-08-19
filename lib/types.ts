export interface Visit {
  id?: string;
  visit_date: string;
  user_review: string;
  rating?: number;
  photos?: string[];
  wineries: {
    google_place_id: string;
  };
}

export interface Winery {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  rating?: number;
  userVisited?: boolean;
  visits?: Visit[];
}