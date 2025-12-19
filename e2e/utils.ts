import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Page } from '@playwright/test';
import mockPlaces from './mocks/places-search.json';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for test utils');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

export interface TestUser {
  id: string;
  email: string;
  password:string;
}

/**
 * Mocks the Google Maps Places API responses for E2E tests.
 * This prevents real API calls to Google, saving costs and making tests deterministic.
 */
export async function mockGoogleMapsApi(page: Page) {
  // Intercept the Places API text search
  await page.route('https://maps.googleapis.com/maps/api/place/js/PlaceService.SearchByText', (route) => {
    console.log('✅ Mocking Google Places API: SearchByText');
    const jsonResponse = { places: mockPlaces };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(jsonResponse),
    });
  });

  // Mock geocoding as well to prevent calls when searching by location text
  await page.route('https://maps.googleapis.com/maps/api/geocode/json**', (route) => {
    console.log('✅ Mocking Google Geocoding API');
    const mockGeocodeResponse = {
      results: [
        {
          geometry: {
            viewport: {
              south: 42.5,
              west: -77.0,
              north: 42.9,
              east: -76.8,
            },
          },
        },
      ],
      status: 'OK',
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockGeocodeResponse),
    });
  });
}

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${uuidv4()}@example.com`;
  const password = `pass-${uuidv4()}`;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm the email
  });

  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }

  return {
    id: data.user.id,
    email,
    password,
  };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  
  if (error) {
    console.error(`Failed to delete test user ${userId}:`, error);
    // Don't throw here to avoid masking the actual test error if called in cleanup
  }
}
