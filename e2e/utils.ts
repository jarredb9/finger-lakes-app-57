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
 */
export async function mockGoogleMapsApi(page: Page) {
  if (process.env.E2E_REAL_DATA === 'true') return;

  // 1. Inject a mock bounds object into the store to satisfy the useWineryFilter hook
  // This bypasses the need for real map tiles/initialization.
  await page.addInitScript(() => {
    const mockBounds = { 
      contains: () => true,
      getCenter: () => ({ lat: () => 42.7, lng: () => -76.9 }),
      extend: () => {},
      getNorthEast: () => ({ lat: () => 43, lng: () => -76 }),
      getSouthWest: () => ({ lat: () => 42, lng: () => -77 })
    };

    const interval = setInterval(() => {
      const store = (window as any).useMapStore;
      if (store && store.setState) {
        // 1. Inject bounds directly
        store.setState({ bounds: mockBounds });

        // 2. Patch the map instance if it exists to prevent overwriting
        const state = store.getState();
        if (state.map && !state.map._isPatched) {
            console.log('[E2E Mock] Patching map.getBounds');
            state.map.getBounds = () => mockBounds;
            state.map._isPatched = true;
            // Clear interval only after we've patched the map, or after a safety timeout?
            // Actually, keep doing it for a bit to be safe, or just clear now.
            // Let's clear if map is patched.
            clearInterval(interval);
        }
      }
    }, 100);
  });

  // 2. Mock the internal proxy route for winery details
  await page.route('**/api/wineries/details', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        google_place_id: mockPlaces[0].id,
        name: mockPlaces[0].displayName,
        address: mockPlaces[0].formattedAddress,
        latitude: mockPlaces[0].location.latitude,
        longitude: mockPlaces[0].location.longitude,
        google_rating: mockPlaces[0].rating,
        opening_hours: { weekday_text: ["Monday: 10:00 AM – 5:00 PM"] },
        reviews: [],
      }),
    });
  });

  // 2. Mock the Supabase RPC for map markers
  await page.route(/\/rpc\/get_map_markers/, (route) => {
    console.log('[E2E Mock] Intercepted get_map_markers RPC');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockPlaces.map((p, index) => ({
        id: index + 1,
        google_place_id: p.id,
        name: p.displayName,
        address: p.formattedAddress,
        lat: p.location.latitude,
        lng: p.location.longitude,
        is_favorite: false,
        on_wishlist: false,
        user_visited: false
      }))),
    });
  });

  // 2.5 Mock the Supabase RPC for visit history
  await page.route(/\/rpc\/get_paginated_visits_with_winery_and_friends/, (route) => {
    console.log('[E2E Mock] Intercepted get_paginated_visits RPC');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        visit_id: 'mock-visit-1',
        user_id: 'mock-user-1',
        visit_date: new Date().toISOString().split('T')[0],
        user_review: 'Excellent wine and view!',
        rating: 5,
        photos: [],
        winery_id: 1,
        winery_name: 'Mock Winery One',
        google_place_id: mockPlaces[0].id,
        winery_address: mockPlaces[0].formattedAddress,
        friend_visits: []
      }]),
    });
  });

  // 2.6 Mock log_visit RPC
  await page.route(/\/rpc\/log_visit/, (route) => {
    console.log('[E2E Mock] Intercepted log_visit RPC');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ visit_id: 'mock-visit-new' }),
    });
  });

  // 2.7 Mock delete visit (Supabase REST)
  await page.route(/\/rest\/v1\/visits\?/, (route) => {
    if (route.request().method() === 'DELETE') {
        console.log('[E2E Mock] Intercepted Supabase DELETE Visit');
        route.fulfill({
            status: 204, // Supabase returns 204 No Content for successful deletes usually
        });
    } else {
        route.continue();
    }
  });

  // 3. Block costly Google Data APIs
  await page.route(/(google|googleapis|places)/, async (route) => {
    const url = route.request().url();
    const type = route.request().resourceType();

    // ALLOW: Library scripts and fonts (Free)
    if (type === 'script' || type === 'font' || type === 'stylesheet' || url.includes('js?key=')) {
      return route.continue();
    }

    // BLOCK everything else (Tiles, Search, Telemetry)
    return route.abort('failed');
  });
}

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${uuidv4()}@example.com`;
  const password = `pass-${uuidv4()}`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Failed: ${error?.message}`);
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(userId: string): Promise<void> {
  await supabase.auth.admin.deleteUser(userId);
}