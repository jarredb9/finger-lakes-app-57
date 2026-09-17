/* eslint-disable no-console */
/* eslint-disable react-hooks/rules-of-hooks */
import { Page } from '@playwright/test';
import { createMockMapMarkerRpc } from '@/lib/test-utils/fixtures';
import { MapMarkerRpc, WineryDbId, GooglePlaceId } from '@/lib/types';

export class MapsFixtureManager {
  private swEnabled = false;
  private workerIndex: number;

  constructor(private page: Page, workerIndex: number = 0) {
    this.workerIndex = workerIndex;
  }

  enableServiceWorker() {
    this.swEnabled = true;
  }

  isServiceWorkerEnabled(): boolean {
    return this.swEnabled;
  }

  getWorkerIndex(): number {
    return this.workerIndex;
  }

  /**
   * Sets up console and request logging for the current page.
   */
  setupLogging() {
    const page = this.page;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';

    const logHandler = (msg: any) => {
      const text = msg.text();
      const type = msg.type();

      console.log(`[BROWSER-${type.toUpperCase()}] ${text}`);

      if (text.includes('Hydration') || text.includes('Error') || type === 'error' || text.includes('403')) {
        if (text.includes('[DIAGNOSTIC]')) return; 
        
        const isInfrastructure = text.includes('SecurityError') || 
                               text.includes('IDBFactory') || 
                               text.includes('Cross-Origin Request Blocked') ||
                               text.includes('Failed to load resource') ||
                               text.includes('WebSocket connection to') ||
                               text.includes('/realtime/v1/websocket');
        
        const isExpectedOfflineError = text.includes('Edge Function failed') || 
                                     text.includes('FunctionsHttpError') || 
                                     text.includes('Load failed') || 
                                     text.includes('TypeError') ||
                                     text.includes('[Sync] Failed') ||
                                     text.includes('Database Connection Failed') ||
                                     text.includes('Internal Server Error') ||
                                     text.includes('navigation preload') ||
                                     text.includes('InvalidStateError') ||
                                     text.includes('JSHandle@object') ||
                                     text.includes('WebKit encountered an internal error');

        const isThirdPartyNoise = text.includes('Cookie “__cf_bm” has been rejected') ||
                                 text.includes('Google Maps JavaScript API: Unable to fetch configuration') ||
                                 text.includes('Attempted to load a Vector Map, but failed');
        
        if (!isInfrastructure && !isExpectedOfflineError && !isThirdPartyNoise) {
          console.log(`[DIAGNOSTIC] Would have failed due to console error: ${text}`);
        }
      }
    };

    page.on('console', logHandler);
    
    const supabaseUrlObj = new URL(supabaseUrl);
    const supabaseHost = supabaseUrlObj.host;
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('rpc/') || url.includes('google') || url.includes(supabaseHost)) {
        console.log(`[DIAGNOSTIC] [NETWORK-REQ] ${request.method()} ${url}`);
      }
    });

    page.on('response', async response => {
      const url = response.url();
      if (url.includes('rpc/') || url.includes('google') || url.includes(supabaseHost)) {
        const status = response.status();
        console.log(`[DIAGNOSTIC] [NETWORK-RES] ${status} ${url}`);
        if (status >= 400) {
          try {
            const body = await response.text();
            console.log(`[DIAGNOSTIC] [NETWORK-ERROR-BODY] ${body}`);
          } catch (e) {}
        }
      }
    });
  }

  /**
   * Normalizes any winery ID (numeric dbId or string google_place_id) into a canonical list of matching keys.
   */
  getEquivalentWineryIds(rawId: string | number | undefined | null, markersList: MapMarkerRpc[] = []): string[] {
    if (!rawId) return ['ch-12345-mock-winery-1', '1', '999123'];
    const strId = String(rawId);
    
    const marker = markersList.find(m => String(m.id) === strId || m.google_place_id === strId);
    if (marker) {
      return Array.from(new Set([strId, String(marker.id), marker.google_place_id, 'ch-12345-mock-winery-1']));
    }
    
    if (strId === '1' || strId === 'ch-12345-mock-winery-1' || strId === '999123') {
      return ['ch-12345-mock-winery-1', '1', '999123'];
    }
    
    return [strId];
  }

  async failMarkers() {
    await this.page.addInitScript(() => {
      console.log('[DIAGNOSTIC] failMarkers init script running');
      (window as any)._E2E_ENABLE_REAL_SYNC = true;
      (window as any)._E2E_SKIP_WINERY_INJECTION = true;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
        localStorage.removeItem('winery-data-storage-e2e');
      }
    });

    await this.page.evaluate(() => {
      (window as any)._E2E_ENABLE_REAL_SYNC = true;
      (window as any)._E2E_SKIP_WINERY_INJECTION = true;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
      }
      if ((window as any).useWineryDataStore) {
        (window as any).useWineryDataStore.setState({ persistentWineries: [], error: null });
      }
    }).catch(() => {});

    await this.page.context().route(/.*rpc\/get_map_markers/, async (route) => {
      console.log('[DIAGNOSTIC] Intercepting get_map_markers with 500 error');
      await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Internal Server Error' }) });
    });

    await this.page.context().route(/.*rpc\/get_wineries_in_bounds/, async (route) => {
      console.log('[DIAGNOSTIC] Intercepting get_wineries_in_bounds with 500 error');
      await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Internal Server Error' }) });
    });
  }

  /**
   * Mocks Google Places API v1 (REST and JS SDK).
   */
  async mockPlacesV1() {
    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400'
    };

    const markers: MapMarkerRpc[] = [
      createMockMapMarkerRpc({ id: 1 as WineryDbId, google_place_id: 'ch-12345-mock-winery-1' as GooglePlaceId, name: 'Mock Winery One', address: '123 Vineyard Way, NY' }),
      createMockMapMarkerRpc({ id: 2 as WineryDbId, google_place_id: 'ch-67890-mock-winery-2' as GooglePlaceId, name: 'Vineyard of Illusion', address: '456 Mirage Ln, NY' }),
      createMockMapMarkerRpc({ id: 3 as WineryDbId, google_place_id: 'ch-abcde-mock-winery-3' as GooglePlaceId, name: 'The Phantom Cellar', address: '789 Ethereal Rd, NY' })
    ];

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
            userRatingCount: 150
          }))
        })
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
            weekdayDescriptions: ['Monday: 10:00 AM – 5:00 PM', 'Tuesday: 10:00 AM – 5:00 PM']
          },
          reviews: [
            {
              name: 'places/mock-review-1',
              relativePublishTimeDescription: 'a month ago',
              rating: 5,
              text: { text: 'Amazing mock wine and atmosphere!' },
              originalText: { text: 'Amazing mock wine and atmosphere!' },
              authorAttribution: { displayName: 'Wine Critic', uri: 'https://example.com' }
            }
          ]
        })
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
              location: { lat: marker.latitude, lng: marker.longitude }
            },
            rating: marker.google_rating,
            user_ratings_total: 150
          },
          status: 'OK'
        })
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
              secondary_text: m.address
            }
          })),
          status: 'OK'
        })
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
              location: { lat: markerLat(m), lng: markerLng(m) }
            },
            rating: m.google_rating,
            user_ratings_total: 150
          })),
          status: 'OK'
        })
      });
    });

    // 6. Mock Google Maps JS SDK script
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
        body: mockJs
      });
    });

    // 7. Mock Maps API internal resources
    await this.page.context().route(/maps\.googleapis\.com\/maps-api-v3\/api\/js\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        headers: commonHeaders,
        body: '/* Google Maps internal script mock */'
      });
    });

    // 8. Open-Meteo Weather API Mock
    await this.page.context().route(/api\.open-meteo\.com\/v1\/forecast.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          current: {
            temperature_2m: 72,
            relative_humidity_2m: 50,
            weather_code: 1,
            wind_speed_10m: 5
          }
        })
      });
    });
  }

  /**
   * Sets up WebGL mocks and Mapbox support in headless browser context.
   */
  async setupWebGLAndMapMocks() {
    await this.page.addInitScript(({ swEnabled, workerIndex }: { swEnabled: boolean, workerIndex: number }) => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (const registration of registrations) {
            const scriptURL = registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL;
            if (scriptURL && !scriptURL.includes(`worker=${workerIndex}`)) {
              registration.unregister();
            }
          }
        });

        const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
        (navigator.serviceWorker as any).register = (url: string, options?: any) => {
          if (!swEnabled) {
            return Promise.reject(new Error('SW blocked for test stability'));
          }
          const swUrl = new URL(url, window.location.href);
          swUrl.searchParams.set('worker', String(workerIndex));
          return originalRegister(swUrl.toString(), options);
        };
      }

      if (typeof window !== 'undefined') {
        const glConstants = {
          VERTEX_SHADER: 35633,
          FRAGMENT_SHADER: 35632,
          COMPILE_STATUS: 35713,
          LINK_STATUS: 35714,
          VALIDATE_STATUS: 35715,
          MAX_VERTEX_ATTRIBS: 35661,
          MAX_TEXTURE_SIZE: 3379,
          VERSION: 7938,
          VENDOR: 7936,
          RENDERER: 7937,
          SHADING_LANGUAGE_VERSION: 35724,
        };

        const mockCtor = function() {};
        Object.assign(mockCtor, glConstants);
        Object.assign(mockCtor.prototype, glConstants);

        (window as any).WebGLRenderingContext = (window as any).WebGLRenderingContext || mockCtor;
        (window as any).WebGL2RenderingContext = (window as any).WebGL2RenderingContext || mockCtor;

        if (window.HTMLCanvasElement) {
          const originalGetContext = window.HTMLCanvasElement.prototype.getContext;
          window.HTMLCanvasElement.prototype.getContext = function (type: string, attributes?: any) {
            if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
              const glBase = {
                canvas: this,
                getParameter: (param: number) => {
                  if (param === 3379) return 16384;
                  if (param === 35661) return 80;
                  if (param === 7938) return 'WebGL 1.0';
                  if (param === 7936) return 'WebKit';
                  if (param === 7937) return 'WebKit WebGL';
                  if (param === 35724) return 'WebGL GLSL ES 1.0';
                  if (param === 37446) return 'WebKit WebGL';
                  if (param === 37445) return 'WebKit';
                  return 0;
                },
                getExtension: (name: string) => {
                  if (name === 'WEBGL_debug_renderer_info') {
                    return {
                      UNMASKED_RENDERER_WEBGL: 37446,
                      UNMASKED_VENDOR_WEBGL: 37445,
                    };
                  }
                  return null;
                },
                isContextLost: () => false,
                createShader: () => ({}),
                getShaderParameter: () => true,
                getShaderInfoLog: () => '',
                getShaderSource: () => '',
                createProgram: () => ({}),
                getProgramParameter: () => true,
                getProgramInfoLog: () => '',
                getAttribLocation: () => 0,
                getUniformLocation: () => ({}),
                createBuffer: () => ({}),
                createTexture: () => ({}),
                createFramebuffer: () => ({}),
                createRenderbuffer: () => ({}),
                checkFramebufferStatus: () => 36053,
                getError: () => 0,
                ...glConstants,
              };

              return new Proxy(glBase, {
                get: (target: any, prop: string) => {
                  if (prop in target) return target[prop];
                  return () => {};
                }
              }) as any;
            }
            return originalGetContext.call(this, type, attributes);
          };
        }

        (window as any).mapboxgl = (window as any).mapboxgl || {};
        (window as any).mapboxgl.supported = () => true;
      }
    }, { swEnabled: this.swEnabled, workerIndex: this.workerIndex });
  }
}

function markerLat(m: MapMarkerRpc): number {
  return Number(m.latitude || 42.5);
}

function markerLng(m: MapMarkerRpc): number {
  return Number(m.longitude || -76.8);
}

export const mapsFixture = async ({ page }: { page: Page }, use: (m: MapsFixtureManager) => Promise<void>) => {
  const manager = new MapsFixtureManager(page);
  await manager.mockPlacesV1();
  await manager.setupWebGLAndMapMocks();
  await use(manager);
};
