import { Trip, Winery, Visit, TripMember, GooglePlaceId, WineryDbId, Friend, PlaceReview, AuthenticatedUser } from "@/lib/types";

/**
 * Branded type assertion helpers for factories
 */
export const asGoogleId = (id: string) => id as GooglePlaceId;
export const asWineryId = (id: number) => id as WineryDbId;

export const createMockUser = (overrides?: Partial<AuthenticatedUser>): AuthenticatedUser => ({
  id: 'user-1',
  name: 'Test User',
  email: 'user@example.com',
  ...overrides,
});

export const createMockTripMember = (overrides?: Partial<TripMember>): TripMember => ({
  id: 'user-1',
  name: 'Test User',
  email: 'user@example.com',
  role: 'owner',
  status: 'joined',
  ...overrides,
});

export const createMockVisit = (overrides?: Partial<Visit>): Visit => ({
  id: 'visit-1', // String for consistent mocking (can be cast to number if needed)
  user_id: 'user-1',
  winery_id: asWineryId(101),
  rating: 5,
  user_review: 'Great!',
  profiles: { name: 'Test User' },
  visit_date: '2026-03-01',
  updated_at: new Date().toISOString(),
  photos: [],
  ...overrides,
});

export const createMockPlaceReview = (overrides?: Partial<PlaceReview>): PlaceReview => ({
  author_name: 'Wine Lover',
  rating: 5,
  relative_time_description: 'a week ago',
  text: 'Excellent experience!',
  time: Date.now() / 1000,
  ...overrides,
});

export const createMockWinery = (overrides?: Partial<Winery>): Winery => ({
  id: asGoogleId('winery-1'),
  dbId: asWineryId(101),
  name: 'Winery One',
  address: '123 Wine St',
  lat: 42.44,
  lng: -76.50,
  openingHours: {
    open_now: true,
    weekday_text: ['Monday: 9:00 AM – 5:00 PM'],
    periods: []
  },
  reviews: [createMockPlaceReview()],
  visits: [],
  notes: '',
  ...overrides,
});

export const createMockTrip = (overrides?: Partial<Trip>): Trip => ({
  id: 1,
  name: 'Test Trip',
  trip_date: '2026-03-05',
  user_id: 'user-1',
  wineries: [createMockWinery()],
  members: [createMockTripMember()],
  ...overrides,
});

export const createMockFriend = (overrides?: Partial<Friend>): Friend => ({
  id: 'user-2',
  name: 'Friend User',
  email: 'friend@example.com',
  status: 'accepted',
  privacy_level: 'friends_only',
  ...overrides,
});
