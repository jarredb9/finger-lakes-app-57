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

        window.google.maps.importLibrary = async function(libraryName) {
          return window.google.maps[libraryName] || {};
        };

        window.google.maps.places.AutocompleteSessionToken = function() {
          this.id = 'mock-session-token-' + Math.random().toString(36).substring(2, 9);
        };

        window.google.maps.places.Place = function(options) {
          const allItems = {
            'ch-12345-mock-winery-1': { id: 'ch-12345-mock-winery-1', name: 'Mock Winery One', address: '123 Vineyard Way, NY', lat: 42.5, lng: -76.8 },
            'ch-67890-mock-winery-2': { id: 'ch-67890-mock-winery-2', name: 'Vineyard of Illusion', address: '456 Mirage Ln, NY', lat: 42.6, lng: -76.9 },
            'ch-abcde-mock-winery-3': { id: 'ch-abcde-mock-winery-3', name: 'The Phantom Cellar', address: '789 Ethereal Rd, NY', lat: 42.7, lng: -77.0 }
          };
          const item = (options && options.id && allItems[options.id]) || allItems['ch-12345-mock-winery-1'];
          this.id = item.id;
          this.displayName = item.name;
          this.formattedAddress = item.address;
          this.location = {
            lat: () => item.lat,
            lng: () => item.lng,
            latitude: item.lat,
            longitude: item.lng
          };
          this.rating = 4.8;
          this.userRatingCount = 120;
          this.fetchFields = async function(req) { return this; };
        };

        window.google.maps.places.AutocompleteSuggestion = {
          fetchAutocompleteSuggestions: async function(req) {
            const input = (req && req.input ? req.input : '').toLowerCase();
            const allItems = [
              { id: 'ch-12345-mock-winery-1', name: 'Mock Winery One', address: '123 Vineyard Way, NY' },
              { id: 'ch-67890-mock-winery-2', name: 'Vineyard of Illusion', address: '456 Mirage Ln, NY' },
              { id: 'ch-abcde-mock-winery-3', name: 'The Phantom Cellar', address: '789 Ethereal Rd, NY' }
            ];
            const filtered = allItems.filter(function(item) {
              return item.name.toLowerCase().includes(input) || item.address.toLowerCase().includes(input);
            });
            return {
              suggestions: (filtered.length > 0 ? filtered : allItems).map(function(item) {
                return {
                  placePrediction: {
                    text: { text: item.name + ', ' + item.address },
                    mainText: { text: item.name },
                    secondaryText: { text: item.address },
                    toPlace: function() { return new window.google.maps.places.Place({ id: item.id }); }
                  }
                };
              })
            };
          }
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
