import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly, CacheFirst, NetworkFirst } from "serwist";
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
    // Cache static assets (fonts, images) with CacheFirst
    {
      matcher: ({ request }) =>
        request.destination === "font" || request.destination === "image",
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
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
