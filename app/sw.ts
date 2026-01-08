import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly, CacheFirst, NetworkFirst, StaleWhileRevalidate } from "serwist";
import { ExpirationPlugin } from "serwist";

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
    // Supabase Caching Rule
    {
      matcher: ({ url }) => url.hostname.includes("supabase.co"),
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
              maxEntries: 1000,
              maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
            }),
          ],
        });

        try {
          const response = await strategy.handle({ request, event, params: params as any });
          if (response) return response;
          throw new Error("No response from strategy");
        } catch (error) {
          // Return transparent 1x1 pixel to prevent "No Imagery" errors
          // allowing the map to show the underlying fuzzy lower-zoom tile if available
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
            maxEntries: 500,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
          }),
        ],
      }),
    },
    // Cache documents (pages) with NetworkFirst
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({
        cacheName: "pages",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
