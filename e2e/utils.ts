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
 * MOCKS & BLOCKS the Google Maps API for E2E tests.
 * 
 * This strategy ensures $0 cost by allowing free initialization assets 
 * while strictly blocking all costly data API calls.
 */
export async function mockGoogleMapsApi(page: Page) {
  
  // 1. Mock the internal proxy route for winery details (Highest cost call)
  await page.route('**/api/wineries/details', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        google_place_id: mockPlaces[0].id,
        name: "Mock Winery One",
        address: "123 Mockingbird Lane, Fakeville, FK 12345",
        latitude: 42.7,
        longitude: -76.9,
        google_rating: 4.5,
        opening_hours: { weekday_text: ["Monday: 10:00 AM – 5:00 PM"] },
        reviews: [],
        phone: '555-MOCK',
        website: 'https://mock.example.com'
      }),
    });
  });

  // 2. Surgical blocking of Google Data APIs
  await page.route(/(google|googleapis|places)/, async (route) => {
    const url = route.request().url();
    const type = route.request().resourceType();

    // ALLOW: Library scripts, fonts, and CSS (These are free and required for initialization)
    if (type === 'script' || type === 'font' || type === 'stylesheet') {
      return route.continue();
    }

    // BLOCK & MOCK: Places Search calls
    if (url.includes('searchByText') || url.includes('SearchByText')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ places: mockPlaces }),
      });
    }

    // BLOCK & MOCK: Geocoding
    if (url.includes('geocode')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [{ 
            geometry: { 
                location: { lat: 42.7, lng: -76.9 },
                viewport: { south: 42.5, west: -77.0, north: 42.9, east: -76.8 } 
            } 
          }],
          status: 'OK',
        }),
      });
    }

    // BLOCK: Everything else (Tiles, Logging, Details, Telemetry)
    // This ensures no real data is fetched and no cost is incurred.
    return route.abort('failed');
  });
}

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${uuidv4()}@example.com`;
  const password = `pass-${uuidv4()}`;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
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
  }
}
