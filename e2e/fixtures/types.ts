import { Database } from '@/lib/database.types';
import { 
  Trip, 
  VisitWithWinery, 
  MapMarkerRpc
} from '@/lib/types';

/**
 * Derived Types from Database Schema (Senior Standard)
 * These ensure 100% alignment with the Supabase schema and RPC definitions.
 */
export type RpcVisitWithWinery = Omit<Database['public']['Functions']['get_paginated_visits_with_winery_and_friends']['Returns'][number], 'user_review' | 'rating'> & {
  user_id: string;
  updated_at: string;
  user_review: string | null;
  rating: number | null;
  idempotency_key?: string | null;
};

export type FriendActivityFeedItem = {
  activity_type: Database['public']['Tables']['activity_ledger']['Row']['activity_type'];
  created_at: string;
  activity_user_id: Database['public']['Tables']['profiles']['Row']['id'];
  user_name: string | null;
  user_email: string | null;
  winery_id: Database['public']['Tables']['wineries']['Row']['id'];
  winery_name: Database['public']['Tables']['wineries']['Row']['name'];
  latitude: number;
  longitude: number;
  visit_rating: Database['public']['Tables']['visits']['Row']['rating'];
  visit_review: Database['public']['Tables']['visits']['Row']['user_review'];
  visit_photos: Database['public']['Tables']['visits']['Row']['photos'];
};

export type TripMember = Database['public']['Tables']['trip_members']['Row'] & {
  name: string | null;
  email: string | null;
};

export type Profile = Database['public']['Tables']['profiles']['Row'];

export type MapMarker = MapMarkerRpc;
export type TripDetails = Trip;
export type MockTrip = Trip & {
  idempotency_key?: string | null;
  winery_id?: number | null;
};
export type VisitItem = VisitWithWinery;

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/**
 * Shared state container to allow coordination between 
 * multiple contexts in a single test without using static class properties 
 * that can leak between worker-level test runs.
 */
export interface MockMapsState {
  trips: MockTrip[] | null;
  visits: RpcVisitWithWinery[] | null;
  activityFeed: FriendActivityFeedItem[] | null;
  social: {
    friends: Profile[];
    pending_incoming: Profile[];
    pending_outgoing: Profile[];
  } | null;
  socialMap: Map<string, {
    friends: Profile[];
    pending_incoming: Profile[];
    pending_outgoing: Profile[];
  }>;
  tripMembersMap: Map<number, TripMember[]>;
  favoritesMap: Map<string, Set<string>>;
  wishlistMap: Map<string, Set<string>>;
  favoritePrivacyMap: Map<string, Set<string>>;
  wishlistPrivacyMap: Map<string, Set<string>>;
}

export function createDefaultMockState(): MockMapsState {
  return {
    trips: null,
    visits: null,
    activityFeed: null,
    social: null,
    socialMap: new Map(),
    tripMembersMap: new Map(),
    favoritesMap: new Map(),
    wishlistMap: new Map(),
    favoritePrivacyMap: new Map(),
    wishlistPrivacyMap: new Map()
  };
}
