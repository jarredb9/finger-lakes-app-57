import { 
  Winery, 
  Trip, 
  Visit, 
  AuthenticatedUser, 
  GooglePlaceId, 
  WineryDbId,
  MapMarkerRpc,
  VisitWithWinery
} from '@/lib/types';

/**
 * Standardized Test Fixtures
 * 
 * Use these factory functions to create consistent mock data across Jest and Playwright.
 * These ensure that if our Type definitions change, we only update them here.
 */

export const createMockWinery = (overrides: Partial<Winery> = {}): Winery => ({
  id: 'ch-mock-winery-1' as GooglePlaceId,
  dbId: 1 as WineryDbId,
  name: 'Mock Winery One',
  address: '123 Mockingbird Lane, Fakeville, FK 12345',
  lat: 42.7,
  lng: -76.9,
  rating: 4.5,
  userVisited: false,
  onWishlist: false,
  isFavorite: false,
  visits: [],
  ...overrides,
});

export const createMockTrip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 100,
  user_id: 'user-123',
  trip_date: new Date().toISOString().split('T')[0],
  name: 'Test Trip',
  wineries: [],
  members: ['user-123'],
  ...overrides,
});

export const createMockVisit = (overrides: Partial<Visit> = {}): Visit => ({
  id: 'visit-1',
  user_id: 'user-123',
  visit_date: new Date().toISOString().split('T')[0],
  user_review: 'Excellent wine and view!',
  rating: 5,
  photos: [],
  ...overrides,
});

export const createMockVisitWithWinery = (overrides: Partial<VisitWithWinery> = {}): VisitWithWinery => {
  const winery = createMockWinery();
  return {
    ...createMockVisit(),
    wineryName: winery.name,
    wineryId: winery.id,
    wineries: {
      id: winery.dbId!,
      google_place_id: winery.id,
      name: winery.name,
      address: winery.address,
      latitude: winery.lat.toString(),
      longitude: winery.lng.toString(),
    },
    ...overrides,
  };
};

export const createMockUser = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  ...overrides,
});

/**
 * RPC Specific Mocks
 * Standardizes the shape of data returned by Supabase functions
 */
export const createMockMapMarkerRpc = (overrides: Partial<MapMarkerRpc> = {}): MapMarkerRpc => ({
  id: 1 as WineryDbId,
  google_place_id: 'ch-mock-winery-1' as GooglePlaceId,
  name: 'Mock Winery One',
  address: '123 Mockingbird Lane, Fakeville, FK 12345',
  lat: 42.7,
  lng: -76.9,
  is_favorite: false,
  on_wishlist: false,
  user_visited: false,
  ...overrides,
});
