import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly, StaleWhileRevalidate, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Supabase Caching Rule (unchanged)
    {
      matcher: ({ url }: { url: URL }) => url.hostname.includes("supabase.co"),
      handler: new NetworkOnly(),
    },
    // More specific caching for pages and static assets
    {
      matcher: ({ request }) =>
        request.destination === "document" ||
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "font" ||
        request.destination === "image",
      handler: new StaleWhileRevalidate({
        cacheName: "static-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 128, // Max number of items to cache
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
