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
 * MOCKS the Google Maps API by injecting overrides into the browser's JS environment.
 * This is more robust than network-level mocking for the Google Maps SDK.
 */
export async function mockGoogleMapsApi(page: Page) {
  
  // 1. Mock the internal proxy route for winery details (The highest cost call)
  await page.route('**/api/wineries/details', (route) => {
    const postData = route.request().postDataJSON();
    const placeId = postData?.placeId;
    
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        google_place_id: placeId || mockPlaces[0].id,
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

  // 2. Inject a script to override the JS SDK methods
  await page.addInitScript((mockData) => {
    // Polling function to wait for the Google SDK to load
    const interval = setInterval(() => {
      // @ts-ignore
      if (window.google && window.google.maps && window.google.maps.places && window.google.maps.places.Place) {
        clearInterval(interval);
        
        // @ts-ignore
        const Place = window.google.maps.places.Place;
        
        // Override searchByText
        Place.searchByText = async (request: any) => {
          console.log('✅ JS MOCK: Intercepted Place.searchByText', request);
          return {
            places: mockData.map(item => new Place({
                id: item.id,
                // Ensure the properties match what the app expects
                displayName: item.displayName.text,
                formattedAddress: item.formattedAddress,
                location: {
                    lat: () => item.location.latitude,
                    lng: () => item.location.longitude
                },
                rating: item.rating
            }))
          };
        };
        console.log('🎭 JS Overrides Applied to google.maps.places.Place');
      }
    }, 100);
  }, mockPlaces);

  // 3. Mock Geocoding at network level (it's a simple REST call)
  await page.route(/.*geocode.*/, (route) => {
    route.fulfill({
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
  }
}
