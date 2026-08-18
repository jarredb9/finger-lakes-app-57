import { Winery } from "@/lib/types";

export function useWineryPhoto(photoRef: string, winery: Winery) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const imgSrc = (winery?.cached_photos && winery.cached_photos[photoRef])
    ? winery.cached_photos[photoRef]
    : apiKey
      ? `https://places.googleapis.com/v1/${photoRef}/media?key=${apiKey}&maxWidthPx=800`
      : null;

  const cachePhoto = async () => {
    // Browser HTTP caching & Service Worker handle photo caching without mutative store re-renders
  };

  return { imgSrc, cachePhoto };
}
