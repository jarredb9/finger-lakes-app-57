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

    await (this.page.addInitScript as any)(({ swEnabled, workerIndex, mockMarkers }: any) => {
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
              const standardizer = window.standardizeWineryData || ((m: any) => ({
                id: m.google_place_id,
                dbId: Number(m.id),
                name: m.name,
                address: m.address || 'Mock Address',
                latitude: Number(m.latitude || m.lat || 0),
                longitude: Number(m.longitude || m.lng || 0),
                rating: Number(m.google_rating) || 4.5,
                userVisited: false,
                onWishlist: false,
                isFavorite: false,
                visits: [],
                openingHours: null,
                reviews: []
              }));

              const standardized = mockMarkers.map((m: any) => standardizer(m)).filter((w: any) => w !== null);
              (wineryStore as any).setState({ persistentWineries: standardized });
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
    }, { swEnabled, workerIndex, mockMarkers: markers } as any);
  }

  /**
   * Simulates marker RPC failure by injecting error states and 500 route responses.
   */
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
}

export async function setupBrowserShims(page: Page, options?: BrowserShimOptions) {
  const shim = new BrowserShim(page);
  await shim.setupWebGLAndMapMocks(options);
  return shim;
}
