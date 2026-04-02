import { Trip, Winery, Visit, TripMember, GooglePlaceId, WineryDbId } from "@/lib/types";

export const createMockUser = (overrides?: Partial<any>) => ({
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
  id: 1 as any, // Cast if needed for string vs number inconsistency
  user_id: 'user-1',
  winery_id: 101 as unknown as WineryDbId,
  rating: 5,
  user_review: 'Great!',
  profiles: { name: 'Test User' },
  visit_date: '2026-03-01',
  ...overrides,
});

export const createMockWinery = (overrides?: Partial<Winery>): Winery => ({
  id: 'winery-1' as unknown as GooglePlaceId,
  dbId: 101 as unknown as WineryDbId,
  name: 'Winery One',
  address: '123 Wine St',
  lat: 42.44,
  lng: -76.50,
  openingHours: [] as any,
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
