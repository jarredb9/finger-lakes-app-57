import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getUser } from '@/lib/auth';
import { createClient as createAdminClient } from '@supabase/supabase-js';

jest.mock('@/lib/auth');
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('GET /api/wineries - Places API (New) V1 & Awaited Upsert (BE-14)', () => {
  const originalEnv = process.env;
  const mockUpsert = jest.fn();
  let mockFetch: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'test-google-api-key',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    };

    (getUser as jest.Mock).mockResolvedValue({ id: 'test-user-id' });

    mockUpsert.mockResolvedValue({ data: null, error: null });
    (createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        upsert: mockUpsert,
      }),
    });
  });

  afterEach(() => {
    if (mockFetch) mockFetch.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('calls Places API (New) V1 endpoint and awaits database cache upsert', async () => {
    const mockPlacesV1Response = {
      places: [
        {
          id: 'ChIJPlaceV1Id',
          displayName: { text: 'Lamoreaux Landing Wine Cellars' },
          formattedAddress: '9224 State Route 414, Lodi, NY',
          location: { latitude: 42.6071, longitude: -76.8778 },
          rating: 4.7,
        },
      ],
    };

    mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockPlacesV1Response,
    } as any);

    const request = new NextRequest('http://localhost:3000/api/wineries?query=lamoreaux');
    const response = await GET(request);

    expect(response.status).toBe(200);

    // Verify Places API (New) V1 call format
    expect(mockFetch).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:searchText',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': 'test-google-api-key',
          'X-Goog-FieldMask': expect.stringContaining('places.id'),
        }),
        body: JSON.stringify({ textQuery: 'lamoreaux winery' }),
      })
    );

    // Verify database upsert is properly awaited
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        {
          google_place_id: 'ChIJPlaceV1Id',
          name: 'Lamoreaux Landing Wine Cellars',
          address: '9224 State Route 414, Lodi, NY',
          latitude: 42.6071,
          longitude: -76.8778,
          google_rating: 4.7,
        },
      ],
      { onConflict: 'google_place_id' }
    );

    const body = await response.json();
    expect(body).toEqual([
      {
        id: 'ChIJPlaceV1Id',
        name: 'Lamoreaux Landing Wine Cellars',
        address: '9224 State Route 414, Lodi, NY',
        latitude: 42.6071,
        longitude: -76.8778,
        rating: 4.7,
      },
    ]);
  });
});
