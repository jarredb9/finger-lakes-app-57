export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_ledger: {
        Row: {
          activity_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          object_id: string
          privacy_level: string
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          object_id: string
          privacy_level?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          object_id?: string
          privacy_level?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string | null
          id: number
          is_private: boolean | null
          metadata: Json | null
          user_id: string
          winery_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_private?: boolean | null
          metadata?: Json | null
          user_id: string
          winery_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          is_private?: boolean | null
          metadata?: Json | null
          user_id?: string
          winery_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_winery_id_fkey"
            columns: ["winery_id"]
            isOneToOne: false
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_requests: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
          status?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_requests_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_requests_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friends: {
        Row: {
          created_at: string | null
          id: number
          status: string
          updated_at: string | null
          user1_id: string
          user2_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          status: string
          updated_at?: string | null
          user1_id: string
          user2_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          status?: string
          updated_at?: string | null
          user1_id?: string
          user2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friends_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friends_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          email: string | null
          id: string
          name: string | null
          privacy_level: Database["public"]["Enums"]["privacy_level"] | null
        }
        Insert: {
          email?: string | null
          id: string
          name?: string | null
          privacy_level?: Database["public"]["Enums"]["privacy_level"] | null
        }
        Update: {
          email?: string | null
          id?: string
          name?: string | null
          privacy_level?: Database["public"]["Enums"]["privacy_level"] | null
        }
        Relationships: []
      }
      trip_members: {
        Row: {
          id: string
          invited_at: string | null
          joined_at: string | null
          role: string
          status: string
          trip_id: number
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          trip_id: number
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          trip_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_wineries: {
        Row: {
          created_at: string | null
          id: number
          notes: string | null
          trip_id: number
          visit_order: number
          winery_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          notes?: string | null
          trip_id: number
          visit_order: number
          winery_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          notes?: string | null
          trip_id?: number
          visit_order?: number
          winery_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_wineries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_wineries_winery_id_fkey"
            columns: ["winery_id"]
            isOneToOne: false
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string | null
          id: number
          name: string | null
          trip_date: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          name?: string | null
          trip_date: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string | null
          trip_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_participants: {
        Row: {
          created_at: string | null
          id: string
          status: string
          user_id: string
          visit_id: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string
          user_id: string
          visit_id: number
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string
          user_id?: string
          visit_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "visit_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_participants_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          created_at: string | null
          id: number
          is_private: boolean | null
          metadata: Json | null
          photos: string[] | null
          rating: number | null
          updated_at: string | null
          user_id: string
          user_review: string | null
          visit_date: string
          winery_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_private?: boolean | null
          metadata?: Json | null
          photos?: string[] | null
          rating?: number | null
          updated_at?: string | null
          user_id: string
          user_review?: string | null
          visit_date: string
          winery_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          is_private?: boolean | null
          metadata?: Json | null
          photos?: string[] | null
          rating?: number | null
          updated_at?: string | null
          user_id?: string
          user_review?: string | null
          visit_date?: string
          winery_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_winery_id_fkey"
            columns: ["winery_id"]
            isOneToOne: false
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          },
        ]
      }
      wineries: {
        Row: {
          address: string
          created_at: string | null
          google_place_id: string | null
          google_rating: number | null
          id: number
          latitude: number | null
          longitude: number | null
          name: string
          opening_hours: Json | null
          phone: string | null
          reservable: boolean | null
          reviews: Json | null
          website: string | null
        }
        Insert: {
          address: string
          created_at?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          name: string
          opening_hours?: Json | null
          phone?: string | null
          reservable?: boolean | null
          reviews?: Json | null
          website?: string | null
        }
        Update: {
          address?: string
          created_at?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          name?: string
          opening_hours?: Json | null
          phone?: string | null
          reservable?: boolean | null
          reviews?: Json | null
          website?: string | null
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          created_at: string | null
          id: number
          is_private: boolean | null
          metadata: Json | null
          user_id: string
          winery_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_private?: boolean | null
          metadata?: Json | null
          user_id: string
          winery_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          is_private?: boolean | null
          metadata?: Json | null
          user_id?: string
          winery_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_winery_id_fkey"
            columns: ["winery_id"]
            isOneToOne: false
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_to_wishlist: { Args: { p_winery_data: Json }; Returns: Json }
      add_trip_member_by_email: {
        Args: { p_email: string; p_trip_id: number }
        Returns: Json
      }
      add_winery_to_trip:
        | {
            Args: { p_notes?: string; p_trip_id: number; p_winery_data: Json }
            Returns: Json
          }
        | {
            Args: {
              notes_param?: string
              trip_id_param: number
              winery_id_param: number
            }
            Returns: boolean
          }
      add_winery_to_trips: {
        Args: { p_trip_ids: number[]; p_winery_id: number }
        Returns: Json
      }
      create_trip: {
        Args: { p_name: string; p_trip_date: string }
        Returns: Json
      }
      create_trip_with_winery: {
        Args: {
          p_members?: string[]
          p_notes?: string
          p_trip_date: string
          p_trip_name: string
          p_winery_data: Json
        }
        Returns: Json
      }
      delete_trip: { Args: { p_trip_id: number }; Returns: Json }
      delete_visit: { Args: { p_visit_id: number }; Returns: Json }
      ensure_winery: { Args: { p_winery_data: Json }; Returns: number }
      get_all_user_visits_list: {
        Args: never
        Returns: {
          google_place_id: string
          id: number
          lat: number
          lng: number
          photos: string[]
          rating: number
          user_review: string
          visit_date: string
          winery_address: string
          winery_id: number
          winery_name: string
        }[]
      }
      get_all_wineries_with_user_data: {
        Args: never
        Returns: {
          address: string
          google_place_id: string
          google_rating: number
          id: number
          is_favorite: boolean
          latitude: number
          longitude: number
          name: string
          on_wishlist: boolean
          phone: string
          user_visited: boolean
          website: string
        }[]
      }
      get_friend_activity_feed: { Args: { limit_val?: number }; Returns: Json }
      get_friend_profile_with_visits: {
        Args: { friend_id_param: string }
        Returns: Json
      }
      get_friends_activity_for_winery: {
        Args: { winery_id_param: number }
        Returns: Json
      }
      get_friends_and_requests: { Args: never; Returns: Json }
      get_friends_ids: {
        Args: never
        Returns: {
          friend_id: string
        }[]
      }
      get_friends_ratings_for_winery: {
        Args: { winery_id_param: number }
        Returns: {
          email: string
          name: string
          photos: string[]
          rating: number
          user_id: string
          user_review: string
        }[]
      }
      get_map_markers: {
        Args: { user_id_param?: string }
        Returns: {
          google_place_id: string
          id: number
          is_favorite: boolean
          latitude: number
          longitude: number
          name: string
          on_wishlist: boolean
          user_visited: boolean
        }[]
      }
      get_paginated_trips_with_wineries: {
        Args: { page_number: number; page_size: number; trip_type: string }
        Returns: {
          created_at: string
          id: number
          name: string
          total_count: number
          trip_date: string
          user_id: string
          wineries: Json
        }[]
      }
      get_paginated_visits_with_winery_and_friends: {
        Args: { page_number: number; page_size: number }
        Returns: {
          friend_visits: Json
          google_place_id: string
          photos: string[]
          rating: number
          user_review: string
          visit_date: string
          visit_id: number
          winery_address: string
          winery_id: number
          winery_name: string
        }[]
      }
      get_paginated_wineries: {
        Args: { p_limit?: number; p_page?: number }
        Returns: {
          address: string
          google_place_id: string
          google_rating: number
          id: number
          is_favorite: boolean
          latitude: number
          longitude: number
          name: string
          on_wishlist: boolean
          phone: string
          total_count: number
          user_visited: boolean
          website: string
        }[]
      }
      get_trip_by_id_with_wineries: {
        Args: { trip_id_param: number }
        Returns: {
          created_at: string
          id: number
          name: string
          trip_date: string
          user_id: string
          wineries: Json
        }[]
      }
      get_trip_details: { Args: { trip_id_param: number }; Returns: Json }
      get_trips_for_date: {
        Args: { target_date: string }
        Returns: {
          id: number
          name: string
          trip_date: string
          user_id: string
          wineries: Json
        }[]
      }
      get_user_dashboard: { Args: never; Returns: Json }
      get_user_winery_data_aggregated: {
        Args: never
        Returns: {
          wineries_data: Json
        }[]
      }
      get_wineries_for_trip_planner: {
        Args: { trip_date_param: string }
        Returns: {
          address: string
          google_place_id: string
          google_rating: number
          id: number
          is_favorite: boolean
          latitude: number
          longitude: number
          name: string
          notes: string
          on_wishlist: boolean
          phone: string
          trip_date: string
          trip_id: number
          trip_name: string
          user_visited: boolean
          visit_order: number
          website: string
        }[]
      }
      get_wineries_in_bounds: {
        Args: {
          max_lat: number
          max_lng: number
          min_lat: number
          min_lng: number
        }
        Returns: {
          address: string
          created_at: string | null
          google_place_id: string | null
          google_rating: number | null
          id: number
          latitude: number | null
          longitude: number | null
          name: string
          opening_hours: Json | null
          phone: string | null
          reservable: boolean | null
          reviews: Json | null
          website: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wineries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_winery_details: {
        Args: { winery_id_param: number }
        Returns: {
          address: string
          google_place_id: string
          google_rating: number
          id: number
          is_favorite: boolean
          latitude: number
          longitude: number
          name: string
          on_wishlist: boolean
          phone: string
          user_visited: boolean
          visits: Json
          website: string
        }[]
      }
      get_winery_details_by_id: {
        Args: { winery_id_param: number }
        Returns: {
          address: string
          google_place_id: string
          google_rating: number
          id: number
          is_favorite: boolean
          lat: number
          lng: number
          name: string
          on_wishlist: boolean
          opening_hours: Json
          phone: string
          reservable: boolean
          reviews: Json
          trip_info: Json
          user_visited: boolean
          visits: Json
          website: string
        }[]
      }
      is_trip_member: { Args: { trip_id_to_check: number }; Returns: boolean }
      is_visible_to_viewer: {
        Args: { p_is_item_private?: boolean; p_target_user_id: string }
        Returns: boolean
      }
      log_visit: {
        Args: { p_visit_data: Json; p_winery_data: Json }
        Returns: Json
      }
      remove_friend: { Args: { target_friend_id: string }; Returns: undefined }
      remove_winery_from_trip: {
        Args: { p_trip_id: number; p_winery_id: number }
        Returns: Json
      }
      reorder_trip_wineries: {
        Args: { p_trip_id: number; p_winery_ids: number[] }
        Returns: Json
      }
      respond_to_follow_request: {
        Args: { p_accept: boolean; p_follower_id: string }
        Returns: Json
      }
      respond_to_friend_request: {
        Args: { accept: boolean; requester_id: string }
        Returns: undefined
      }
      search_wineries_by_name_and_location: {
        Args: { search_query: string; user_lat: number; user_lng: number }
        Returns: {
          address: string
          distance_meters: number
          google_place_id: string
          google_rating: number
          id: number
          is_favorite: boolean
          latitude: number
          longitude: number
          name: string
          on_wishlist: boolean
          phone: string
          user_visited: boolean
          website: string
        }[]
      }
      send_follow_request: { Args: { p_target_id: string }; Returns: Json }
      send_friend_request: {
        Args: { target_email: string }
        Returns: undefined
      }
      toggle_favorite: { Args: { p_winery_data: Json }; Returns: boolean }
      toggle_favorite_privacy: { Args: { p_winery_id: number }; Returns: Json }
      toggle_wishlist: { Args: { p_winery_data: Json }; Returns: boolean }
      toggle_wishlist_privacy: { Args: { p_winery_id: number }; Returns: Json }
      update_profile_privacy: {
        Args: { p_privacy_level: Database["public"]["Enums"]["privacy_level"] }
        Returns: Json
      }
      update_trip_winery_notes: {
        Args: { p_notes: string; p_trip_id: number; p_winery_id: number }
        Returns: Json
      }
      update_visit: {
        Args: { p_visit_data: Json; p_visit_id: number }
        Returns: Json
      }
      upsert_wineries_from_search: {
        Args: { wineries_data: Json[] }
        Returns: undefined
      }
    }
    Enums: {
      privacy_level: "public" | "friends_only" | "private"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      privacy_level: ["public", "friends_only", "private"],
    },
  },
} as const

