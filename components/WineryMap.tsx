"use client";

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
import { AlertTriangle } from "lucide-react";
import MapView from "./map/MapView";
import { useWineryMap } from "@/hooks/use-winery-map";


// Define the type based on the return value of useWineryMap
type WineryMapData = ReturnType<typeof useWineryMap>;

interface WineryMapProps extends WineryMapData {
  className?: string;
}

export default function WineryMap(props: WineryMapProps) {
  const {
    error,
    mapWineries,
    filter,
    handleOpenModal,
    proposedWinery,
    setProposedWinery,
    selectedTrip,
  } = props;

  if (error) {
    return (
      <Alert variant="destructive" className="m-4 z-50 relative max-w-md">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="relative w-full h-full group">
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
