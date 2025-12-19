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
  // Check if we should skip mocking for "Full Integrity" verification
  if (process.env.E2E_REAL_DATA === 'true') {
    console.log('⚠️ RUNNING IN REAL DATA MODE: Google API costs will be incurred.');
    return;
  }
  
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

  // 2. Mock the Supabase RPC for map markers
  // We use a broad regex to ensure we catch the RPC call regardless of the full URL
  await page.route(/\/rpc\/get_map_markers/, (route) => {
    console.log(`[MOCK] Intercepted get_map_markers: ${route.request().url()}`);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockPlaces.map((p, index) => ({
        id: index + 1,
        google_place_id: p.id,
        name: p.displayName, // Corrected mapping
        address: p.formattedAddress,
        lat: p.location.latitude,
        lng: p.location.longitude,
        is_favorite: false,
        on_wishlist: false,
        user_visited: false
      }))),
    });
  });

  // 3. Surgical blocking of Google Data APIs
  await page.route(/(google|googleapis|places)/, async (route) => {
    const url = route.request().url();
    const type = route.request().resourceType();

    // ALLOW: Library scripts, fonts, and CSS
    if (type === 'script' || type === 'font' || type === 'stylesheet' || url.includes('js?key=')) {
      return route.continue();
    }

    // BLOCK & MOCK: Map Tiles (Transparent PNG)
    if (url.includes('vt/lyrs') || url.includes('khms') || url.includes('StaticMapService')) {
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
      });
    }

    // BLOCK & MOCK: Places Search (For any network level calls)
    if (url.includes('searchByText') || url.includes('SearchByText') || url.includes('places:search')) {
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ 
                places: mockPlaces.map(p => ({
                    id: p.id,
                    displayName: { text: p.displayName },
                    formattedAddress: p.formattedAddress,
                    location: { latitude: p.location.latitude, longitude: p.location.longitude },
                    rating: p.rating
                })) 
            }),
        });
    }

    // BLOCK everything else
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
