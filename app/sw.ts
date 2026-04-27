import { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly, CacheFirst, StaleWhileRevalidate, NetworkFirst } from "serwist";
import { ExpirationPlugin } from "serwist";
import { checkAndCleanupQuota } from "../lib/utils/quota";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const SW_VERSION = "2.8.2-stable-" + Date.now();
console.log(`[SW] Initializing Version: ${SW_VERSION}`);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
let SUPABASE_DOMAIN = "supabase.co";
try {
  if (SUPABASE_URL) {
    SUPABASE_DOMAIN = new URL(SUPABASE_URL).hostname;
  }
} catch (e) {
  console.error("[SW] Invalid SUPABASE_URL:", SUPABASE_URL);
}

const googleMapsStrategy = new CacheFirst({
  cacheName: "google-maps-tiles",
  plugins: [
    new ExpirationPlugin({
      maxEntries: 40,
      maxAgeSeconds: 30 * 24 * 60 * 60,
      purgeOnQuotaError: true,
    }),
  ],
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST || [],
  skipWaiting: false,
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
    {
      matcher: ({ url }) => 
        url.hostname.includes(SUPABASE_DOMAIN) && 
        url.pathname.includes("/storage/v1/object/public"),
      handler: new StaleWhileRevalidate({
        cacheName: "supabase-storage",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 40,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    {
      matcher: ({ url, request }) => {
        const isE2EEnv = process.env.NEXT_PUBLIC_IS_E2E === 'true';
        const skipHeader = request?.headers.get('x-skip-sw-interception') === 'true';
        const isE2E = isE2EEnv || skipHeader;
        
        const isSupabaseApi = url.hostname.includes(SUPABASE_DOMAIN) && !url.pathname.includes("/storage/v1/object/public");
        
        if (isSupabaseApi && isE2E) {
            return false;
        }
        
        return isSupabaseApi;
      },
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ url, request }) => 
        (url.hostname.includes("google") || url.hostname.includes("gstatic")) && 
        request.destination === "image",
      handler: async ({ request, event, params }) => {
        try {
          const response = await googleMapsStrategy.handle({ request, event, params: params as any });
          if (response) return response;
          throw new Error("No imagery response");
        } catch (error) {
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
    {
      matcher: ({ url, request }) =>
        (request.destination === "font" || request.destination === "image") &&
        !url.hostname.includes("google") && 
        !url.hostname.includes("gstatic") &&
        !url.hostname.includes(SUPABASE_DOMAIN),
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 30 * 24 * 60 * 60,
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

// Proactively check quota on navigation to prevent QuotaExceededError
// following "The Quota Resilience Rule" in GEMINI.md
self.addEventListener("fetch", (event: any) => {
  if (event.request.mode === "navigate") {
    event.waitUntil(checkAndCleanupQuota(0.8));
  }
});

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  const reason = event.reason;
  if (reason && (reason.name === "QuotaExceededError" || (reason.message && reason.message.includes("Quota")))) {
    console.error("[SW] Storage quota exceeded. Clearing caches.");
    event.preventDefault();
    
    const cachesToClear = ["google-maps-tiles", "pages", "supabase-storage"];
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => {
          return cachesToClear.some((c) => key.includes(c));
        }).map((key) => {
          console.log("[SW] Deleting cache: " + key);
          return caches.delete(key);
        })
      );
    }).catch((err) => {
      console.error("[SW] Quota recovery failed:", err);
    });
  }
}

self.addEventListener("unhandledrejection", handleUnhandledRejection);

serwist.addEventListeners();
