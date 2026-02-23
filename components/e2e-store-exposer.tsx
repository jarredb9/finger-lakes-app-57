"use client";

import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUserStore } from "@/lib/stores/userStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useEffect } from "react";

export function E2EStoreExposer() {
  useEffect(() => {
    // Only expose stores if explicitly enabled for E2E testing
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true') {
      (window as any).useWineryDataStore = useWineryDataStore;
      (window as any).useWineryStore = useWineryStore;
      (window as any).useUIStore = useUIStore;
      (window as any).useVisitStore = useVisitStore;
      (window as any).useTripStore = useTripStore;
      (window as any).useUserStore = useUserStore;
      (window as any).useFriendStore = useFriendStore;
      (window as any).useMapStore = useMapStore;
      // eslint-disable-next-line no-console
      console.log('[E2EStoreExposer] Stores exposed to window.');
    }
  }, []);

  return null;
}
