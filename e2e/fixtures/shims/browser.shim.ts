/* eslint-disable no-console */
import { Page } from '@playwright/test';
import { MapMarkerRpc } from '@/lib/types';
import { MOCK_MARKERS } from '../utils/mock-wineries';

export interface BrowserShimOptions {
  swEnabled?: boolean;
  workerIndex?: number;
  mockMarkers?: MapMarkerRpc[];
}

export class BrowserShim {
  constructor(private page: Page) {}

  /**
   * Sets up WebGL mocks, Mapbox support, service worker gating, and store bounds in headless browser context.
   */
  async setupWebGLAndMapMocks(options: BrowserShimOptions = {}) {
    const swEnabled = options.swEnabled ?? false;
    const workerIndex = options.workerIndex ?? 0;
    const markers = options.mockMarkers ?? MOCK_MARKERS;

    interface ShimInitScriptArgs {
      swEnabled: boolean;
      workerIndex: number;
      mockMarkers: unknown[];
    }

    await (this.page.addInitScript as unknown as (script: (args: ShimInitScriptArgs) => void, arg: ShimInitScriptArgs) => Promise<unknown>)(({ swEnabled, workerIndex, mockMarkers }) => {
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
        (navigator.serviceWorker as unknown as { register: (url: string | URL, options?: RegistrationOptions) => Promise<ServiceWorkerRegistration> }).register = (url: string | URL, options?: RegistrationOptions) => {
          if (!swEnabled) {
            return Promise.reject(new Error('SW blocked for test stability'));
          }
          const swUrl = new URL(url.toString(), window.location.href);
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

        window.WebGLRenderingContext = window.WebGLRenderingContext || mockCtor;
        window.WebGL2RenderingContext = window.WebGL2RenderingContext || mockCtor;

        if (window.HTMLCanvasElement) {
          const originalGetContext = window.HTMLCanvasElement.prototype.getContext;
          window.HTMLCanvasElement.prototype.getContext = (function (this: HTMLCanvasElement, type: string, attributes?: unknown) {
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
                get: (target: Record<string, unknown>, prop: string) => {
                  if (prop in target) return target[prop];
                  return () => {};
                }
              }) as unknown as RenderingContext;
            }
            return originalGetContext.call(this, type as '2d', attributes as CanvasRenderingContext2DSettings);
          }) as unknown as typeof window.HTMLCanvasElement.prototype.getContext;
        }

        window.mapboxgl = window.mapboxgl || {};
        window.mapboxgl.supported = () => true;

        // Set E2E mocks flag for loader guards
        (window as any)._E2E_MOCKS_ACTIVE = true;

        // Pre-populate window.google.maps mocks synchronously on document creation
        window.google = window.google || {};
        const gmaps = (((window.google as any).maps = (window.google as any).maps || {}) as any);

        if (!gmaps.Map) {
          gmaps.Map = function (this: any, _container?: any, options?: any) {
            const center = options?.center || { lat: 42.7, lng: -76.9 };
            const latVal = typeof center.lat === "function" ? center.lat() : center.lat ?? 42.7;
            const lngVal = typeof center.lng === "function" ? center.lng() : center.lng ?? -76.9;
            this._center = { lat: latVal, lng: lngVal };
            this._zoom = options?.zoom ?? 9;
            this._mapTypeId = "roadmap";
            this._listeners = {} as Record<string, Function[]>;
            return this;
          };
          gmaps.Map.prototype.setMapTypeId = function (id: string) { this._mapTypeId = id; };
          gmaps.Map.prototype.getStreetView = function () { return null; };
          gmaps.Map.prototype.getZoom = function () { return this._zoom; };
          gmaps.Map.prototype.setZoom = function (z: number) { this._zoom = z; };
          gmaps.Map.prototype.setCenter = function (c: any) {
            if (!c) return;
            const lat = typeof c.lat === "function" ? c.lat() : c.lat ?? 42.7;
            const lng = typeof c.lng === "function" ? c.lng() : c.lng ?? -76.9;
            this._center = { lat, lng };
          };
          gmaps.Map.prototype.getCenter = function () {
            const lat = this._center.lat;
            const lng = this._center.lng;
            return {
              lat: () => lat,
              lng: () => lng,
            };
          };
          gmaps.Map.prototype.getBounds = function () {
            return {
              getNorthEast: () => ({ lat: () => 43.0, lng: () => -76.0 }),
              getSouthWest: () => ({ lat: () => 42.0, lng: () => -77.0 }),
              contains: () => true,
            };
          };
          gmaps.Map.prototype.fitBounds = function () {};
          gmaps.Map.prototype.addListener = function (event: string, handler: Function) {
            this._listeners = this._listeners || {};
            this._listeners[event] = this._listeners[event] || [];
            this._listeners[event].push(handler);
            return {
              remove: () => {
                if (this._listeners[event]) {
                  this._listeners[event] = this._listeners[event].filter((h: Function) => h !== handler);
                }
              },
            };
          };
        }

        if (!gmaps.LatLngBounds) {
          gmaps.LatLngBounds = function (this: any, sw?: any, ne?: any) {
            this.sw = sw;
            this.ne = ne;
            return this;
          };
          gmaps.LatLngBounds.prototype.getNorthEast = function () {
            const lat = typeof this.ne?.lat === "function" ? this.ne.lat() : this.ne?.lat ?? 43.0;
            const lng = typeof this.ne?.lng === "function" ? this.ne.lng() : this.ne?.lng ?? -76.0;
            return { lat: () => lat, lng: () => lng };
          };
          gmaps.LatLngBounds.prototype.getSouthWest = function () {
            const lat = typeof this.sw?.lat === "function" ? this.sw.lat() : this.sw?.lat ?? 42.0;
            const lng = typeof this.sw?.lng === "function" ? this.sw.lng() : this.sw?.lng ?? -77.0;
            return { lat: () => lat, lng: () => lng };
          };
          gmaps.LatLngBounds.prototype.contains = function () { return true; };
          gmaps.LatLngBounds.prototype.extend = function () { return this; };
        }

        if (!gmaps.LatLng) {
          gmaps.LatLng = function (this: any, lat: number, lng: number) {
            this._lat = lat;
            this._lng = lng;
            return this;
          };
          gmaps.LatLng.prototype.lat = function () { return this._lat; };
          gmaps.LatLng.prototype.lng = function () { return this._lng; };
        }

        if (!gmaps.Marker) {
          gmaps.Marker = function (this: any, options?: any) {
            this.map = options?.map;
            this.position = options?.position;
            this.title = options?.title || "";
            this._listeners = {} as Record<string, Function[]>;
            return this;
          };
          gmaps.Marker.prototype.setMap = function (m: any) { this.map = m; };
          gmaps.Marker.prototype.getMap = function () { return this.map; };
          gmaps.Marker.prototype.addListener = function (event: string, handler: Function) {
            this._listeners = this._listeners || {};
            this._listeners[event] = this._listeners[event] || [];
            this._listeners[event].push(handler);
            return {
              remove: () => {
                if (this._listeners[event]) {
                  this._listeners[event] = this._listeners[event].filter((h: Function) => h !== handler);
                }
              },
            };
          };
        }

        gmaps.marker = gmaps.marker || {};
        if (!gmaps.marker.PinElement) {
          gmaps.marker.PinElement = function (this: any, options?: any) {
            this.options = options;
            this.element = typeof document !== "undefined" ? document.createElement("div") : {};
            return this;
          };
        }
        if (!gmaps.marker.AdvancedMarkerElement) {
          gmaps.marker.AdvancedMarkerElement = function (this: any, options?: any) {
            this.map = options?.map;
            this.position = options?.position;
            this.title = options?.title || "";
            this.content = options?.content;
            this.gmpClickable = options?.gmpClickable ?? true;
            this.element = typeof document !== "undefined" ? document.createElement("div") : {};
            this._listeners = {} as Record<string, Function[]>;
            return this;
          };
          gmaps.marker.AdvancedMarkerElement.prototype.addEventListener = function (event: string, handler: Function) {
            this._listeners = this._listeners || {};
            this._listeners[event] = this._listeners[event] || [];
            this._listeners[event].push(handler);
          };
          gmaps.marker.AdvancedMarkerElement.prototype.removeEventListener = function (event: string, handler: Function) {
            if (this._listeners[event]) {
              this._listeners[event] = this._listeners[event].filter((h: Function) => h !== handler);
            }
          };
          gmaps.marker.AdvancedMarkerElement.prototype.setMap = function (m: any) { this.map = m; };
        }

        if (!gmaps.Geocoder) {
          gmaps.Geocoder = function (this: any) { return this; };
          gmaps.Geocoder.prototype.geocode = function (_req: any, cb?: Function) {
            if (cb) cb([], "OK");
            return Promise.resolve({ results: [] });
          };
        }

        gmaps.places = gmaps.places || {};
        if (!gmaps.places.AutocompleteSessionToken) {
          gmaps.places.AutocompleteSessionToken = function (this: any) {
            this.id = 'mock-session-token-' + Math.random().toString(36).substring(2, 9);
            return this;
          };
        }
        if (!gmaps.places.Place || typeof gmaps.places.Place.searchByText !== 'function') {
          const defaultItems: Record<string, any> = {
            'ch-12345-mock-winery-1': { id: 'ch-12345-mock-winery-1', name: 'Mock Winery One', address: '123 Vineyard Way, NY', lat: 42.5, lng: -76.8 },
            'ch-67890-mock-winery-2': { id: 'ch-67890-mock-winery-2', name: 'Vineyard of Illusion', address: '456 Mirage Ln, NY', lat: 42.6, lng: -76.9 },
            'ch-abcde-mock-winery-3': { id: 'ch-abcde-mock-winery-3', name: 'The Phantom Cellar', address: '789 Ethereal Rd, NY', lat: 42.7, lng: -77.0 },
          };
          gmaps.places.Place = function (this: any, options?: any) {
            const item = (options && options.id && defaultItems[options.id]) || {
              id: (options && options.id) || defaultItems['ch-12345-mock-winery-1'].id,
              name: (options && options.name) || defaultItems['ch-12345-mock-winery-1'].name,
              address: (options && options.address) || defaultItems['ch-12345-mock-winery-1'].address,
              lat: defaultItems['ch-12345-mock-winery-1'].lat,
              lng: defaultItems['ch-12345-mock-winery-1'].lng,
            };
            this.id = item.id;
            this.name = item.name;
            this.displayName = item.name;
            this.formattedAddress = item.address;
            this.address = item.address;
            this.location = {
              lat: () => item.lat,
              lng: () => item.lng,
              latitude: item.lat,
              longitude: item.lng,
            };
            this.rating = 4.8;
            this.userRatingCount = 120;
            return this;
          };
          gmaps.places.Place.prototype.fetchFields = async function (_req?: any) { return this; };
          gmaps.places.Place.searchByText = () => Promise.resolve({ places: [] });
          gmaps.places.Place.searchNearby = () => Promise.resolve({ places: [] });
        }
        if (!gmaps.places.AutocompleteSuggestion || typeof gmaps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions !== 'function') {
          gmaps.places.AutocompleteSuggestion = {
            fetchAutocompleteSuggestions: async function (req?: any) {
              const input = (req && req.input ? req.input : '').toLowerCase();
              const allItems = [
                { id: 'ch-12345-mock-winery-1', name: 'Mock Winery One', address: '123 Vineyard Way, NY' },
                { id: 'ch-67890-mock-winery-2', name: 'Vineyard of Illusion', address: '456 Mirage Ln, NY' },
                { id: 'ch-abcde-mock-winery-3', name: 'The Phantom Cellar', address: '789 Ethereal Rd, NY' },
              ];
              const filtered = allItems.filter(function (item) {
                return item.name.toLowerCase().includes(input) || item.address.toLowerCase().includes(input);
              });
              const matches = filtered.length > 0 ? filtered : allItems;
              return {
                suggestions: matches.map(function (item) {
                  return {
                    placePrediction: {
                      text: { text: item.name + ', ' + item.address },
                      mainText: { text: item.name },
                      secondaryText: { text: item.address },
                      toPlace: function () { return new gmaps.places.Place({ id: item.id }); },
                    },
                  };
                }),
              };
            },
          };
        }

        if (!gmaps.importLibrary) {
          gmaps.importLibrary = async function (libraryName: string) {
            if (libraryName === "maps") return gmaps;
            if (libraryName === "marker") return gmaps.marker;
            if (libraryName === "places") return gmaps.places;
            if (libraryName === "geocoding") return { Geocoder: gmaps.Geocoder };
            if (libraryName === "core") return { LatLng: gmaps.LatLng, LatLngBounds: gmaps.LatLngBounds };
            return gmaps;
          };
        }

        const inject = () => {
          // @ts-ignore
          if (window._E2E_SKIP_WINERY_INJECTION) return false;

          // @ts-ignore
          const wineryStore = window.useWineryDataStore;
          // @ts-ignore
          const mapStore = window.useMapStore;

          if (wineryStore && wineryStore.getState) {
            const state = wineryStore.getState();
            // @ts-ignore
            if (state.persistentWineries && state.persistentWineries.length === 0 && mockMarkers.length > 0) {
              // @ts-ignore
              const standardizer = window.standardizeWineryData || ((m: MapMarkerRpc) => ({
                id: m.google_place_id,
                dbId: Number(m.id),
                name: m.name,
                address: m.address || 'Mock Address',
                latitude: Number(m.latitude || (m as { lat?: number }).lat || 0),
                longitude: Number(m.longitude || (m as { lng?: number }).lng || 0),
                rating: Number(m.google_rating) || 4.5,
                userVisited: false,
                onWishlist: false,
                isFavorite: false,
                visits: [],
                openingHours: null,
                reviews: []
              }));

              const standardized = (mockMarkers as MapMarkerRpc[]).map(m => standardizer(m)).filter(w => w !== null);
              (wineryStore as unknown as { setState: (s: unknown) => void }).setState({ persistentWineries: standardized });
              // @ts-ignore
              window._E2E_INJECTED = true;
            }
          }

          if (mapStore && mapStore.getState) {
            const state = mapStore.getState();
            if (!state.bounds) {
              mapStore.setState({ 
                bounds: { 
                  north: 43,
                  south: 42,
                  east: -76,
                  west: -77,
                } 
              });
            }
          }
          
          // @ts-ignore
          if (window.google && window.google.maps) {
            const maps = window.google.maps;
            if (maps.LatLngBounds) maps.LatLngBounds.prototype.contains = () => true;
            return true;
          }
          return false;
        };
        inject();
        const intervalId = setInterval(inject, 200);
        setTimeout(() => clearInterval(intervalId), 5000);
      }
    }, { swEnabled, workerIndex, mockMarkers: markers });
  }

  /**
   * Simulates marker RPC failure by injecting error states and 500 route responses.
   */
  async failMarkers() {
    await this.page.addInitScript(() => {
      console.log('[DIAGNOSTIC] failMarkers init script running');
      window._E2E_ENABLE_REAL_SYNC = true;
      window._E2E_SKIP_WINERY_INJECTION = true;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
        localStorage.removeItem('winery-data-storage-e2e');
      }
    });

    await this.page.evaluate(() => {
      window._E2E_ENABLE_REAL_SYNC = true;
      window._E2E_SKIP_WINERY_INJECTION = true;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('_E2E_ENABLE_REAL_SYNC', 'true');
      }
      if (window.useWineryDataStore) {
        window.useWineryDataStore.setState({ persistentWineries: [], error: null });
      }
    }).catch(() => {});

    await this.page.context().route(/.*rpc\/get_map_markers/, async (route) => {
      console.log('[DIAGNOSTIC] Intercepting get_map_markers with 500 error');
      await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Internal Server Error' }) });
    });
  }

  /**
   * Configures iOS WebClip and standard standalone mode emulation on the page.
   */
  async enableStandaloneMode(): Promise<void> {
    await enableStandaloneMode(this.page);
  }
}

export async function setupBrowserShims(page: Page, options?: BrowserShimOptions) {
  const shim = new BrowserShim(page);
  await shim.setupWebGLAndMapMocks(options);
  return shim;
}

/**
 * Enables standalone PWA mode by emulating both iOS WebClip (window.navigator.standalone = true)
 * and W3C standard (display-mode: standalone) matchMedia query results.
 */
export async function enableStandaloneMode(page: Page): Promise<void> {
  const initScript = () => {
    // 1. iOS WebClip standalone signal
    try {
      Object.defineProperty(window.navigator, 'standalone', {
        get: () => true,
        configurable: true,
        enumerable: true,
      });
    } catch {
      try {
        (window.navigator as unknown as { standalone: boolean }).standalone = true;
      } catch {
        // Ignore if read-only property cannot be overridden
      }
    }

    // Helper to generate a compliant fallback MediaQueryList
    const createFallbackMql = (mediaQuery: string, matchesValue: boolean): MediaQueryList => ({
      matches: matchesValue,
      media: mediaQuery,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList);

    // 2. W3C standard (display-mode: standalone) matchMedia signal
    const originalMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : undefined;

    window.matchMedia = (query: string): MediaQueryList => {
      if (typeof query === 'string' && query.includes('display-mode: standalone')) {
        let baseMql: MediaQueryList;
        if (originalMatchMedia) {
          try {
            baseMql = originalMatchMedia(query);
          } catch {
            baseMql = createFallbackMql(query, true);
          }
        } else {
          baseMql = createFallbackMql(query, true);
        }

        return new Proxy(baseMql, {
          get(target, prop, receiver) {
            if (prop === 'matches') {
              return true;
            }
            const val = Reflect.get(target, prop, receiver);
            if (typeof val === 'function') {
              return val.bind(target);
            }
            return val;
          },
        });
      }

      if (typeof query === 'string' && query.includes('display-mode: browser')) {
        let baseMql: MediaQueryList;
        if (originalMatchMedia) {
          try {
            baseMql = originalMatchMedia(query);
          } catch {
            baseMql = createFallbackMql(query, false);
          }
        } else {
          baseMql = createFallbackMql(query, false);
        }

        return new Proxy(baseMql, {
          get(target, prop, receiver) {
            if (prop === 'matches') {
              return false;
            }
            const val = Reflect.get(target, prop, receiver);
            if (typeof val === 'function') {
              return val.bind(target);
            }
            return val;
          },
        });
      }

      if (originalMatchMedia) {
        return originalMatchMedia(query);
      }

      return createFallbackMql(query, false);
    };
  };

  await page.addInitScript(initScript);
  await page.evaluate(initScript).catch(() => {});
}

