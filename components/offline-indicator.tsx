"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(() => 
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className={cn(
        "fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-full bg-yellow-500/70 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-xs transition-all animate-in fade-in slide-in-from-top-4",
        "flex items-center gap-2"
      )}
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-4 w-4" />
      <span>You are offline. Showing cached data.</span>
    </div>
  );
}
