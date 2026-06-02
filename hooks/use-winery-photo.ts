import { useWineryStore } from "@/lib/stores/wineryStore";
import { Winery } from "@/lib/types";

export function useWineryPhoto(photoRef: string, winery: Winery) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const updateWinery = useWineryStore((state) => state.updateWinery);

  const imgSrc = (winery.cached_photos && winery.cached_photos[photoRef])
    ? winery.cached_photos[photoRef]
    : apiKey
      ? `https://places.googleapis.com/v1/${photoRef}/media?key=${apiKey}&maxWidthPx=800`
      : null;

  const cachePhoto = async () => {
    if (winery.cached_photos && winery.cached_photos[photoRef]) {
      return;
    }
    if (!apiKey) return;
    try {
      const url = `https://places.googleapis.com/v1/${photoRef}/media?key=${apiKey}&maxWidthPx=800`;
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const currentCached = winery.cached_photos || {};
        updateWinery(winery.id, {
          cached_photos: {
            ...currentCached,
            [photoRef]: base64
          }
        });
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.warn("Error caching image:", e);
    }
  };

  return { imgSrc, cachePhoto };
}
