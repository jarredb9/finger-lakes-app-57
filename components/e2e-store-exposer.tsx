"use client";

import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUserStore } from "@/lib/stores/userStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useSyncStore } from "@/lib/stores/syncStore";
import { SyncService } from "@/lib/services/syncService";
import { useEffect } from "react";

export function E2EStoreExposer() {
  useEffect(() => {
    // Expose stores - we assume gating happens at the component rendering level in layout.tsx
    if (typeof window !== 'undefined') {
      // @ts-ignore
      if (window._STORES_EXPOSED) return;

      (window as any).useWineryDataStore = useWineryDataStore;
      (window as any).useWineryStore = useWineryStore;
      (window as any).useUIStore = useUIStore;
      (window as any).useVisitStore = useVisitStore;
      (window as any).useTripStore = useTripStore;
      (window as any).useUserStore = useUserStore;
      (window as any).useFriendStore = useFriendStore;
      (window as any).useMapStore = useMapStore;
      (window as any).useSyncStore = useSyncStore;
      (window as any).SyncService = SyncService;
      
      // @ts-ignore
      window._STORES_EXPOSED = true;

      // eslint-disable-next-line no-console
      console.log('[E2EStoreExposer] Stores and SyncService exposed to window.');
    }
  }, []);

  if (typeof window === 'undefined') return null;

  return null;
}
