"use client";

import { Button } from "@/components/ui/button";
import { useWineryDataStore } from "@/lib/stores/wineryDataStore";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export function DebugClientTools() {
  const [status, setStatus] = useState<string>("");

  const handleHardReset = () => {
    try {
      // 1. Clear Zustand Persist Storage
      localStorage.removeItem('winery-data-storage');
      localStorage.removeItem('trip-storage');
      localStorage.removeItem('visit-storage');
      
      // 2. Clear Internal State
      useWineryDataStore.getState().reset();
      
      setStatus("Cache cleared. Reloading...");
      
      // 3. Reload Page
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm space-y-4">
      <h2 className="text-xl font-semibold">Client-Side Debug Tools</h2>
      
      <div className="flex flex-col gap-4">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <p className="font-bold">⚠️ Hard Reset Cache</p>
          <p>This will wipe all local data (Wineries, Trips, Visits) from your device and force a fresh download from the server. Use this if you see &quot;Ghost&quot; data that won&apos;t go away.</p>
        </div>
        
        <Button onClick={handleHardReset} variant="destructive" className="w-full sm:w-auto">
          <Trash2 className="w-4 h-4 mr-2" />
          Clear Local Cache & Reload
        </Button>

        {status && <p className="text-sm font-medium text-blue-600">{status}</p>}
      </div>
    </div>
  );
}
