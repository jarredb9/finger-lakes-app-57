export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      favorites: {
        Row: {
          id: number
          user_id: string
          winery_id: number
          created_at: string | null
        }
        Insert: {
          id?: number
          user_id: string
          winery_id: number
          created_at?: string | null
        }
        Update: {
          id?: number
          user_id?: string
          winery_id?: number
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_winery_id_fkey"
            columns: ["winery_id"]
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          }
        ]
      }
      friends: {
        Row: {
          id: number
          user1_id: string
          user2_id: string
          status: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          user1_id: string
          user2_id: string
          status: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          user1_id?: string
          user2_id?: string
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friends_user1_id_fkey"
            columns: ["user1_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friends_user2_id_fkey"
            columns: ["user2_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          id: string
          name: string | null
          email: string | null
        }
        Insert: {
          id: string
          name?: string | null
          email?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      trip_wineries: {
        Row: {
          id: number
          trip_id: number
          winery_id: number
          visit_order: number
          created_at: string | null
          notes: string | null
        }
        Insert: {
          id?: number
          trip_id: number
          winery_id: number
          visit_order: number
          created_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: number
          trip_id?: number
          winery_id?: number
          visit_order?: number
          created_at?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_wineries_trip_id_fkey"
            columns: ["trip_id"]
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_wineries_winery_id_fkey"
            columns: ["winery_id"]
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          }
        ]
      }
      trips: {
        Row: {
          id: number
          user_id: string
          trip_date: string
          name: string | null
          created_at: string | null
          members: string[] | null
        }
        Insert: {
          id?: number
          user_id: string
          trip_date: string
          name?: string | null
          created_at?: string | null
          members?: string[] | null
        }
        Update: {
          id?: number
          user_id?: string
          trip_date?: string
          name?: string | null
          created_at?: string | null
          members?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      visits: {
        Row: {
          id: number
          user_id: string
          winery_id: number
          visit_date: string
          user_review: string | null
          rating: number | null
          photos: string[] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          user_id: string
          winery_id: number
          visit_date: string
          user_review?: string | null
          rating?: number | null
          photos?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          user_id?: string
          winery_id?: number
          visit_date?: string
          user_review?: string | null
          rating?: number | null
          photos?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_winery_id_fkey"
            columns: ["winery_id"]
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          }
        ]
      }
      wineries: {
        Row: {
          id: number
          google_place_id: string | null
          name: string
          address: string
          latitude: number | null
          longitude: number | null
          phone: string | null
          website: string | null
          google_rating: number | null
          created_at: string | null
          opening_hours: Json | null
          reviews: Json | null
          reservable: boolean | null
        }
        Insert: {
          id?: number
          google_place_id?: string | null
          name: string
          address: string
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          website?: string | null
          google_rating?: number | null
          created_at?: string | null
          opening_hours?: Json | null
          reviews?: Json | null
          reservable?: boolean | null
        }
        Update: {
          id?: number
          google_place_id?: string | null
          name?: string
          address?: string
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          website?: string | null
          google_rating?: number | null
          created_at?: string | null
          opening_hours?: Json | null
          reviews?: Json | null
          reservable?: boolean | null
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          id: number
          user_id: string
          winery_id: number
          created_at: string | null
        }
        Insert: {
          id?: number
          user_id: string
          winery_id: number
          created_at?: string | null
        }
        Update: {
          id?: number
          user_id?: string
          winery_id?: number
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_winery_id_fkey"
            columns: ["winery_id"]
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_friends_activity_for_winery: {
        Args: {
          winery_id_param: number
        }
        Returns: Json
      }
      get_friends_ids: {
        Args: Record<PropertyKey, never>
        Returns: {
          friend_id: string
        }[]
      }
      get_friends_ratings_for_winery: {
        Args: {
          winery_id_param: number
        }
        Returns: {
          user_id: string
          name: string
          email: string
          rating: number
          user_review: string
          photos: string[]
        }[]
      }
      get_map_markers: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: number
          google_place_id: string
          name: string
          address: string
          lat: number
          lng: number
          is_favorite: boolean
          on_wishlist: boolean
          user_visited: boolean
        }[]
      }
      get_trips_for_date: {
        Args: {
          target_date: string
        }
        Returns: {
          id: number
          name: string
          trip_date: string
          wineries: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
