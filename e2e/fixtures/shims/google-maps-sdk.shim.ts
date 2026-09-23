import { Page } from '@playwright/test';

export class GoogleMapsSdkShim {
  constructor(private page: Page) {}

  /**
   * Registers route interceptions for Google Maps JavaScript SDK and internal assets.
   */
  async registerRoutes() {
    const commonHeaders = {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400',
    };

    // 1. Mock Google Maps JS SDK script
    await this.page.context().route(/maps\.googleapis\.com\/maps\/api\/js.*/, async (route) => {
      const mockJs = `
        window.google = window.google || {};
        window.google.maps = window.google.maps || {};
        window.google.maps.places = window.google.maps.places || {};
        
        window.google.maps.Map = function(element, options) {
          this.element = element;
          this.options = options;
          this.listeners = {};
          this.addListener = (evt, cb) => {
            this.listeners[evt] = this.listeners[evt] || [];
            this.listeners[evt].push(cb);
            return { remove: () => {} };
          };
          this.setCenter = () => {};
          this.setZoom = () => {};
          this.fitBounds = () => {};
          this.getBounds = () => ({
            getNorthEast: () => ({ lat: () => 43, lng: () => -76 }),
            getSouthWest: () => ({ lat: () => 42, lng: () => -77 }),
            contains: () => true
          });
          setTimeout(() => {
            if (this.listeners['idle']) this.listeners['idle'].forEach(cb => cb());
          }, 50);
        };

        window.google.maps.Marker = function(options) {
          this.options = options;
          this.setMap = () => {};
          this.setPosition = () => {};
          this.addListener = () => ({ remove: () => {} });
        };

        window.google.maps.InfoWindow = function() {
          this.open = () => {};
          this.close = () => {};
          this.setContent = () => {};
        };

        window.google.maps.LatLngBounds = function() {
          this.extend = () => {};
          this.getNorthEast = () => ({ lat: () => 43, lng: () => -76 });
          this.getSouthWest = () => ({ lat: () => 42, lng: () => -77 });
          this.contains = () => true;
        };

        window.google.maps.places.AutocompleteService = function() {
          this.getPlacePredictions = (req, cb) => {
            cb([
              { description: 'Mock Winery One, 123 Vineyard Way, NY', place_id: 'ch-12345-mock-winery-1' },
              { description: 'Vineyard of Illusion, 456 Mirage Ln, NY', place_id: 'ch-67890-mock-winery-2' }
            ], 'OK');
          };
        };

        window.google.maps.places.PlacesService = function() {
          this.getDetails = (req, cb) => {
            cb({
              place_id: req.placeId,
              name: 'Mock Winery One',
              formatted_address: '123 Vineyard Way, NY',
              geometry: { location: { lat: () => 42.5, lng: () => -76.8 } },
              rating: 4.8,
              user_ratings_total: 120
            }, 'OK');
          };
        };

        // Call initialization callbacks if provided
        const urlParams = new URLSearchParams(window.location.search);
        const callbackName = urlParams.get('callback');
        if (callbackName && typeof window[callbackName] === 'function') {
          window[callbackName]();
        }
      `;
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        headers: commonHeaders,
        body: mockJs,
      });
    });

    // 2. Mock Maps API internal resources
    await this.page.context().route(/maps\.googleapis\.com\/maps-api-v3\/api\/js\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        headers: commonHeaders,
        body: '/* Google Maps internal script mock */',
      });
    });
  }
}

export async function registerGoogleMapsSdkRoutes(page: Page) {
  const shim = new GoogleMapsSdkShim(page);
  await shim.registerRoutes();
  return shim;
}

export const setupGoogleMapsSdkShim = registerGoogleMapsSdkRoutes;
