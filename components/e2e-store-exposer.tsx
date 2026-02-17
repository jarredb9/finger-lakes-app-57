"use client";

import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUserStore } from "@/lib/stores/userStore";
import { useFriendStore } from "@/lib/stores/friendStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useEffect } from "react";

export function E2EStoreExposer() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).useWineryDataStore = useWineryDataStore;
      (window as any).useUIStore = useUIStore;
      (window as any).useVisitStore = useVisitStore;
      (window as any).useTripStore = useTripStore;
      (window as any).useUserStore = useUserStore;
      (window as any).useFriendStore = useFriendStore;
      (window as any).useMapStore = useMapStore;
    }
  }, []);

  return null;
}
