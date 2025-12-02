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
import MapControls from "./map/MapControls";
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
    searchLocation,
    setSearchLocation,
    autoSearch,
    setAutoSearch,
    filter,
    handleSearchSubmit,
    handleManualSearchArea,
    handleFilterChange,
    handleOpenModal,
    proposedWinery,
    setProposedWinery,
    selectedTrip,
    isSearching,
    hitApiLimit,
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
      {/* Map Controls Overlay */}
      <div className="absolute top-4 left-4 right-4 z-10 max-w-xl mx-auto md:mx-0">
        <MapControls
            isSearching={isSearching}
            hitApiLimit={hitApiLimit}
            searchLocation={searchLocation}
            setSearchLocation={setSearchLocation}
            autoSearch={autoSearch}
            setAutoSearch={setAutoSearch}
            handleSearchSubmit={handleSearchSubmit}
            handleManualSearchArea={handleManualSearchArea}
            filter={filter}
            onFilterChange={handleFilterChange}
        />
      </div>

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
