"use client";
import dynamic from "next/dynamic";
import { APIProvider } from "@vis.gl/react-google-maps";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { AlertTriangle } from "lucide-react";
import { useWineryMap } from "@/hooks/use-winery-map";
import MapView from "./map/MapView";
import MapControls from "./map/MapControls";
import WinerySearchResults from "./map/WinerySearchResults";

const WineryModal = dynamic(() => import("@/components/winery-modal"), {
  ssr: false,
});

interface WineryMapProps {
  userId: string;
}

function WineryMapContainer({ userId }: WineryMapProps) {
  const {
    error,
    mapWineries,
    listResultsInView,
    isSearching,
    hitApiLimit,
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
  } = useWineryMap(userId);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-0 relative">
              <MapView
                discoveredWineries={mapWineries.discovered}
                visitedWineries={mapWineries.visited}
                wishlistWineries={mapWineries.wishlist}
                favoriteWineries={mapWineries.favorites}
                filter={filter}
                onMarkerClick={handleOpenModal}
                selectedTrip={selectedTrip}
              />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#f17e3a] border-2 border-[#d26e32]" />
                <span className="text-sm">Trip Stop</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#FBBF24] border-2 border-[#F59E0B]" />
                <span className="text-sm">Favorite</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#9333ea] border-2 border-[#7e22ce]" />
                <span className="text-sm">Want to Go</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#10B981] border-2 border-[#059669]" />
                <span className="text-sm">Visited</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#3B82F6] border-2 border-[#2563EB]" />
                <span className="text-sm">Discovered</span>
              </div>
            </CardContent>
          </Card>
          <WinerySearchResults
            listResultsInView={listResultsInView}
            isSearching={isSearching}
            handleOpenModal={handleOpenModal}
          />
        </div>
      </div>
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
      <WineryModal />
    </div>
  );
}

export default function WineryMapWrapper({ userId }: WineryMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Google Maps API key is not configured.</AlertDescription>
      </Alert>
    );
  }
  return (
    <APIProvider apiKey={apiKey} libraries={["places", "geocoding", "marker"]}>
      <WineryMapContainer userId={userId} />
    </APIProvider>
  );
}
