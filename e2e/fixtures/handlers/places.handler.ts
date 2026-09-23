/* eslint-disable no-console */
import { Page } from '@playwright/test';
import { MapMarkerRpc } from '@/lib/types';
import { MOCK_MARKERS, markerLat, markerLng } from '../utils/mock-wineries';

export class PlacesHandler {
  constructor(private page: Page, private markers: MapMarkerRpc[] = MOCK_MARKERS) {}

  /**
   * Registers route interceptions for Google Places API (REST v1, legacy endpoints, and Supabase Edge Functions).
   */
  async registerRoutes() {
    const commonHeaders = {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400',
    };

    const markers = this.markers;

    // 1. Google Places Search (REST)
    await this.page.context().route(/(places\.googleapis\.com\/.*SearchText|places\.googleapis\.com\/v1\/places:searchText)/i, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      console.log(`[DIAGNOSTIC] Mocking Places API Search: ${req.url()}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({
          places: markers.map(m => ({
            id: m.google_place_id,
            displayName: { text: m.name, languageCode: 'en' },
            formattedAddress: m.address,
            location: { latitude: m.latitude, longitude: m.longitude },
            rating: m.google_rating,
            userRatingCount: 150,
          })),
        }),
      });
    });

    // 2. Google Places Details (REST v1)
    await this.page.context().route(/places\.googleapis\.com\/v1\/places\/([a-zA-Z0-9_-]+)/i, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      const url = req.url();
      const match = url.match(/places\/([a-zA-Z0-9_-]+)/);
      const placeId = match ? match[1] : 'ch-12345-mock-winery-1';

      console.log(`[DIAGNOSTIC] Mocking Places API Details: ${placeId}`);
      const marker = markers.find(m => m.google_place_id === placeId) || markers[0];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({
          id: marker.google_place_id,
          displayName: { text: marker.name, languageCode: 'en' },
          formattedAddress: marker.address,
          location: { latitude: marker.latitude, longitude: marker.longitude },
          rating: marker.google_rating,
          userRatingCount: 150,
          currentOpeningHours: {
            openNow: true,
            periods: [],
            weekdayDescriptions: ['Monday: 10:00 AM – 5:00 PM', 'Tuesday: 10:00 AM – 5:00 PM'],
          },
          reviews: [
            {
              name: 'places/mock-review-1',
              relativePublishTimeDescription: 'a month ago',
              rating: 5,
              text: { text: 'Amazing mock wine and atmosphere!' },
              originalText: { text: 'Amazing mock wine and atmosphere!' },
              authorAttribution: { displayName: 'Wine Critic', uri: 'https://example.com' },
            },
          ],
        }),
      });
    });

    // 3. Legacy Maps API Place Details Endpoint
    await this.page.context().route(/maps\.googleapis\.com\/maps\/api\/place\/details\/json.*/, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      const url = new URL(req.url());
      const placeId = url.searchParams.get('place_id') || 'ch-12345-mock-winery-1';
      const marker = markers.find(m => m.google_place_id === placeId) || markers[0];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({
          result: {
            place_id: marker.google_place_id,
            name: marker.name,
            formatted_address: marker.address,
            geometry: {
              location: { lat: marker.latitude, lng: marker.longitude },
            },
            rating: marker.google_rating,
            user_ratings_total: 150,
          },
          status: 'OK',
        }),
      });
    });

    // 4. Legacy Maps API Autocomplete Endpoint
    await this.page.context().route(/maps\.googleapis\.com\/maps\/api\/place\/autocomplete\/json.*/, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({
          predictions: markers.map(m => ({
            description: `${m.name}, ${m.address}`,
            place_id: m.google_place_id,
            structured_formatting: {
              main_text: m.name,
              secondary_text: m.address,
            },
          })),
          status: 'OK',
        }),
      });
    });

    // 5. Legacy Maps API Text Search Endpoint
    await this.page.context().route(/maps\.googleapis\.com\/maps\/api\/place\/textsearch\/json.*/, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({
          results: markers.map(m => ({
            place_id: m.google_place_id,
            name: m.name,
            formatted_address: m.address,
            geometry: {
              location: { lat: markerLat(m), lng: markerLng(m) },
            },
            rating: m.google_rating,
            user_ratings_total: 150,
          })),
          status: 'OK',
        }),
      });
    });

    // 6. Supabase Edge Functions Handler
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
    let supabaseHost = 'localhost:54321';
    try {
      const supabaseUrlObj = new URL(supabaseUrl);
      supabaseHost = supabaseUrlObj.host.replace(/\./g, '\\.');
    } catch (e) {
      // Fallback
    }

    await this.page.context().route(new RegExp(`${supabaseHost}/functions/v1/`), async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      if (url.includes('search-wineries')) {
        const mockWineries = markers.map(m => ({
          id: m.google_place_id,
          name: m.name,
          address: m.address,
          latitude: m.latitude,
          longitude: m.longitude,
          rating: 4.8,
          enrichment_tier: 'basic',
          last_enriched_at: null,
          generative_summary: null,
        }));
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(mockWineries) });
      }

      if (url.includes('get-winery-details')) {
        let placeId = 'ch-12345-mock-winery-1';
        try {
          const postData = JSON.parse(req.postData() || '{}');
          if (postData.placeId) placeId = postData.placeId;
        } catch (e) {}

        const marker = markers.find(m => m.google_place_id === placeId);
        const isWinery2 = placeId === 'ch-67890-mock-winery-2';
        const isWinery3 = placeId === 'ch-abcde-mock-winery-3';
        const isUnknownWinery = isWinery2 || isWinery3;

        const detailedWinery = {
          id: placeId,
          name: marker?.name || 'Mock Enriched Winery',
          address: marker?.address || '123 Enrichment Ave',
          latitude: marker?.latitude || 42.7,
          longitude: marker?.longitude || -76.9,
          rating: 4.9,
          enrichment_tier: 'enriched',
          last_enriched_at: new Date().toISOString(),
          generative_summary: 'This winery has been enriched with AI insights. It features award-winning Rieslings and a stunning lake view.',
          neighborhood_summary: 'The surrounding area is known for its rolling hills and proximity to Seneca Lake.',
          allows_dogs: isUnknownWinery ? null : true,
          has_ev_charging: isUnknownWinery ? null : true,
          serves_wine: true,
          good_for_children: isUnknownWinery ? null : true,
          outdoor_seating: isUnknownWinery ? null : true,
          parking_options: isUnknownWinery ? { freeParking: null } : { freeParking: true },
          accessibility_options: isUnknownWinery ? { wheelchairAccessibleEntrance: null } : { wheelchairAccessibleEntrance: true },
          reviews: isWinery2 ? [] : [
            {
              author_name: 'John Doe',
              text: 'Loved the outdoor seating patio and they have electric vehicle ev charging, but parking is a bit hard.',
              relative_time_description: 'a week ago',
              rating: 5,
            },
            {
              author_name: 'Jane Smith',
              text: 'Great Riesling, and we really enjoyed the outdoor atmosphere and outdoor area. Perfect for a sunny day.',
              relative_time_description: '2 weeks ago',
              rating: 4,
            },
          ],
        };
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(detailedWinery) });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true, data: {} }) });
    });
  }
}
