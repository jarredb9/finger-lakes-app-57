"use client";

import { useState, useEffect } from "react";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, WifiOff } from "lucide-react";
import MapView from "./map/MapView";
import { useWineryMapContext } from "@/components/winery-map-context";

interface WineryMapProps {
  className?: string;
}

export default function WineryMap({ className }: WineryMapProps) {
  const {
    error,
    mapWineries,
    filter,
    handleOpenModal,
    proposedWinery,
    setProposedWinery,
    selectedTrip,
  } = useWineryMapContext();

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

  if (error) {
    return (
      <Alert variant="destructive" className="m-4 z-50 relative max-w-md">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div data-testid="map-container" className={`relative w-full h-full group ${className || ''}`}>
      {/* Main Map View */}
      <div className="w-full h-full">
        <MapView
            discoveredWineries={mapWineries.discovered}
            visitedWineries={mapWineries.visited}
            wishlistWineries={mapWineries.wishlist}
            favoriteWineries={mapWineries.favorites}
            filter={filter}
            onMarkerClick={handleOpenModal}
            selectedTrip={selectedTrip}
        />
      </div>

      {/* Offline Map Warning */}
      {isOffline && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[5] pointer-events-none">
           <div className="bg-background/90 backdrop-blur-md border rounded-full px-4 py-1.5 shadow-sm text-xs font-medium flex items-center gap-2 text-muted-foreground">
              <WifiOff className="w-3 h-3" />
              <span>Offline: Map detail limited</span>
           </div>
        </div>
      )}

      {/* Proposed Winery Dialog */}
      {proposedWinery && (
        <AlertDialog
          open={!!proposedWinery}
          onOpenChange={() => setProposedWinery(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Add this location?</AlertDialogTitle>
              <AlertDialogDescription>
                Do you want to add a visit for the following location?
                <Card className="mt-4 text-left">
                  <CardHeader>
                    <CardTitle>{proposedWinery.name}</CardTitle>
                    <CardDescription>{proposedWinery.address}</CardDescription>
                  </CardHeader>
                </Card>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setProposedWinery(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  handleOpenModal(proposedWinery);
                  setProposedWinery(null);
                }}
              >
                Add Visit
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}