"use client";
import React, { memo } from "react";
import {
  Search,
  MapPin,
  Loader2,
  XCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useTripStore } from "@/lib/stores/tripStore";
import { useToast } from "@/hooks/use-toast";

interface MapControlsProps {
  isSearching: boolean;
  hitApiLimit: boolean;
  searchLocation: string;
  setSearchLocation: (location: string) => void;
  autoSearch: boolean;
  setAutoSearch: (auto: boolean) => void;
  handleSearchSubmit: (e: React.FormEvent) => void;
  handleManualSearchArea: () => void;
  filter: string[];
  onFilterChange: (filter: string[]) => void;
}

const MapControls = memo(
  ({
    isSearching,
    hitApiLimit,
    searchLocation,
    setSearchLocation,
    autoSearch,
    setAutoSearch,
    handleSearchSubmit,
    handleManualSearchArea,
    filter,
    onFilterChange,
  }: MapControlsProps) => {
    const { trips, fetchTripById, selectedTrip, setSelectedTrip } = useTripStore();
    const { toast } = useToast();

    const handleTripSelect = async (tripId: string) => {
      if (tripId === "none") {
        setSelectedTrip(null);
        return;
      }
      const existingTrip = trips.find((t) => t.id.toString() === tripId);
      if (existingTrip && existingTrip.wineries) {
        setSelectedTrip(existingTrip);
      } else {
        await fetchTripById(tripId);
        const updatedTrip =
          useTripStore.getState().trips.find((t) => t.id.toString() === tripId);
        if (updatedTrip) setSelectedTrip(updatedTrip);
      }
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search /> Discover Wineries
          </CardTitle>
          <CardDescription>
            Search for wineries by location, filter your results, or click
            directly on the map.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
              <Input
                placeholder="Enter a city or wine region (e.g., Napa Valley)"
                value={searchLocation}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchLocation(e.target.value)
                }
                aria-label="Search Location"
              />
              <Button type="submit" disabled={isSearching} aria-label="Search">
                {isSearching ? (
                  <Loader2 className="animate-spin w-4 h-4" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span className="ml-2 hidden sm:inline">Search</span>
              </Button>
            </form>
            <Button
              variant="outline"
              onClick={handleManualSearchArea}
              disabled={isSearching}
              aria-label="Search This Area"
            >
              <MapPin className="mr-2 w-4 h-4" /> Search This Area
            </Button>
          </div>
          {hitApiLimit && (
            <Alert
              variant="default"
              className="bg-yellow-50 border-yellow-200 text-yellow-800"
            >
              <AlertTriangle className="h-4 w-4 !text-yellow-600" />
              <AlertDescription>
                This is a popular area! Zoom in to discover more wineries.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center justify-between">
            {selectedTrip ? (
              <Badge
                className="bg-[#f17e3a] hover:bg-[#f17e3a] cursor-pointer"
                onClick={() => setSelectedTrip(null)}
              >
                Viewing: {selectedTrip.name} <XCircle className="w-3 h-3 ml-1" />
              </Badge>
            ) : (
              <div className="flex items-center space-x-2 w-full">
                <span className="text-sm font-medium">Filter:</span>
                <ToggleGroup
                  type="multiple"
                  value={filter}
                  onValueChange={onFilterChange}
                  aria-label="Filter wineries"
                  className="flex-wrap justify-start"
                >
                  <ToggleGroupItem value="all" aria-label="All">
                    All
                  </ToggleGroupItem>
                  <ToggleGroupItem value="visited" aria-label="Visited">
                    Visited
                  </ToggleGroupItem>
                  <ToggleGroupItem value="favorites" aria-label="Favorites">
                    Favorites
                  </ToggleGroupItem>
                  <ToggleGroupItem value="wantToGo" aria-label="Want to Go">
                    Want to Go
                  </ToggleGroupItem>
                  <ToggleGroupItem value="notVisited" aria-label="Discovered">
                    Discovered
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium">Active Trip:</span>
            <Select
              value={selectedTrip?.id?.toString() || "none"}
              onValueChange={handleTripSelect}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an upcoming trip" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {trips
                  .filter((trip) => !!trip.id)
                  .map((trip) => (
                    <SelectItem key={trip.id} value={trip.id.toString()}>
                      {trip.name} (
                      {new Date(
                        trip.trip_date + "T00:00:00"
                      ).toLocaleDateString()})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-50/50 rounded-lg border border-blue-200">
            <Label
              htmlFor="auto-search"
              className="flex items-center gap-2 text-sm font-medium cursor-pointer"
            >
              <Switch
                id="auto-search"
                checked={autoSearch}
                onCheckedChange={setAutoSearch}
                aria-label="Auto-discover wineries as you explore"
              />
              Auto-discover as you explore the map
            </Label>
          </div>
        </CardContent>
      </Card>
    );
  }
);

MapControls.displayName = "MapControls";

export default MapControls;