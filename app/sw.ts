import { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly, CacheFirst, StaleWhileRevalidate, NetworkFirst } from "serwist";
import { ExpirationPlugin } from "serwist";


declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const SW_VERSION = "2.8.2-stable-" + Date.now();
console.log(`[SW] Initializing Version: ${SW_VERSION}`);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_DOMAIN = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : "supabase.co";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST || [],
  skipWaiting: true, // Force activation
  clientsClaim: true,
  navigationPreload: true,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
  runtimeCaching: [
    // Supabase Storage (Images) - Cache First/SWR
    {
      matcher: ({ url }) => 
        url.hostname.includes(SUPABASE_DOMAIN) && 
        url.pathname.includes("/storage/v1/object/public"),
      handler: new StaleWhileRevalidate({
        cacheName: "supabase-storage",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // Supabase API - Network Only (Let App Handle Persistence)
    // CRITICAL: In E2E mode, we bypass the SW for API calls to ensure Playwright interception works.
    {
      matcher: ({ url, request }) => {
        const isE2EParam = self.location.search.includes('pwa=true');
        const isE2EEnv = process.env.NEXT_PUBLIC_IS_E2E === 'true';
        const skipHeader = request?.headers.get('x-skip-sw-interception') === 'true';
        const isE2E = isE2EParam || isE2EEnv || skipHeader;
        
        const isSupabaseApi = url.hostname.includes(SUPABASE_DOMAIN) && !url.pathname.includes("/storage/v1/object/public");
        
        if (isSupabaseApi && isE2E) {
            console.log(`[SW] E2E Bypass active for: ${url.pathname} (Env: ${isE2EEnv}, Param: ${isE2EParam}, Header: ${skipHeader})`);
            return false; // Bypass SW
        }
        
        if (isSupabaseApi) {
            console.log(`[SW] Handling Supabase API: ${url.pathname}`);
        }
        
        return isSupabaseApi;
      },
      handler: new NetworkOnly(),
    },
    // Cache Google Maps Tiles with Fallback
    {
      matcher: ({ url, request }) => 
        (url.hostname.includes("google") || url.hostname.includes("gstatic")) && 
        request.destination === "image",
      handler: async ({ request, event, params }) => {
        const strategy = new StaleWhileRevalidate({
          cacheName: "google-maps-tiles",
          plugins: [
            new ExpirationPlugin({
              maxEntries: 200,
              maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
              purgeOnQuotaError: true,
            }),
          ],
        });

        try {
          const response = await strategy.handle({ request, event, params: params as any });
          if (response) return response;
          throw new Error("No response from strategy");
        } catch (error) {
          // Return transparent 1x1 pixel to prevent "No Imagery" errors
          return new Response(
            new Blob([
              new Uint8Array([
                137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 96, 0, 0, 0, 2, 0, 1, 244, 113, 100, 166, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
              ])
            ], { type: 'image/png' })
          );
        }
      },
    },
    // Cache static assets (fonts, images) with CacheFirst
    {
      matcher: ({ request }) =>
        request.destination === "font" || request.destination === "image",
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // Cache documents (pages) with NetworkFirst for authenticated state stability
    // We use a 3s timeout to mitigate "Lie-Fi" issues while ensuring fresh hydration
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
  ],
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

serwist.addEventListeners();
