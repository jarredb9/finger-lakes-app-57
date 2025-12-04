"use client";

import { FormEvent } from "react";
import { Search, Loader2, MapPin, XCircle, Clock, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTripStore } from "@/lib/stores/tripStore";

interface MapControlsProps {
  searchLocation: string;
  setSearchLocation: (value: string) => void;
  isSearching: boolean;
  handleSearchSubmit: (e: FormEvent) => void;
  handleManualSearchArea: () => void;
  autoSearch: boolean;
  setAutoSearch: (value: boolean) => void;
  hitApiLimit: boolean;
  filter: string[];
  handleFilterChange: (value: string[]) => void;
}

export function MapControls({
  searchLocation,
  setSearchLocation,
  isSearching,
  handleSearchSubmit,
  handleManualSearchArea,
  autoSearch,
  setAutoSearch,
  hitApiLimit,
  filter,
  handleFilterChange,
}: MapControlsProps) {
  const { upcomingTrips, fetchTripById, selectedTrip, setSelectedTrip } = useTripStore();

  const handleTripSelect = async (tripId: string) => {
    if (tripId === "none") {
      setSelectedTrip(null);
      return;
    }
    await fetchTripById(tripId);
    const updatedTrip = useTripStore.getState().trips.find((t) => t.id.toString() === tripId);
    if (updatedTrip) setSelectedTrip(updatedTrip);
  };

  return (
    <div className="space-y-3">
      {/* Search Bar & Controls */}
      <div className="flex flex-col gap-2">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <Input
            placeholder="City or region..."
            value={searchLocation}
            onChange={(e) => setSearchLocation(e.target.value)}
            className="flex-1 h-9"
          />
          <Button type="submit" size="icon" className="h-9 w-9" disabled={isSearching}>
            {isSearching ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />}
          </Button>
        </form>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleManualSearchArea} 
            disabled={isSearching} 
            className="flex-1 h-8 text-xs"
          >
            <MapPin className="mr-2 w-3 h-3" /> Search This Area
          </Button>
          <div className="flex items-center gap-2 px-2 bg-muted/50 rounded-md border h-8">
            <Switch 
                id="auto-search" 
                checked={autoSearch} 
                onCheckedChange={setAutoSearch} 
                className="scale-75" 
            />
            <Label htmlFor="auto-search" className="text-[10px] font-medium cursor-pointer uppercase text-muted-foreground">
                Auto
            </Label>
          </div>
        </div>
      </div>

      {/* API Limit Warning */}
                                          {hitApiLimit && (
                                            <Alert variant="default" className="bg-yellow-50 border-yellow-200 text-yellow-800 py-2 [&>svg+div]:translate-y-0 [&>svg]:top-2">
                                                <AlertTriangle className="h-4 w-4 !text-yellow-600" />
                                                <AlertDescription className="text-xs">Zoom in to see more results.</AlertDescription>
                                            </Alert>
                                          )}      {/* Filters & Overlays */}
      <div className="space-y-2">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Filter Wineries</span>
          {selectedTrip ? (
            <div className="flex items-center">
              <Badge className="bg-[#f17e3a] hover:bg-[#f17e3a] cursor-pointer" onClick={() => setSelectedTrip(null)}>
                Viewing: {selectedTrip.name} <XCircle className="w-3 h-3 ml-1" />
              </Badge>
            </div>
          ) : (
            <ToggleGroup type="multiple" value={filter} onValueChange={handleFilterChange} className="justify-start flex-wrap gap-1" size="sm">
              <ToggleGroupItem value="all" className="text-xs h-6 px-2">All</ToggleGroupItem>
              <ToggleGroupItem value="visited" className="text-xs h-6 px-2">Visited</ToggleGroupItem>
              <ToggleGroupItem value="favorites" className="text-xs h-6 px-2">Favorites</ToggleGroupItem>
              <ToggleGroupItem value="wantToGo" className="text-xs h-6 px-2">Want</ToggleGroupItem>
              <ToggleGroupItem value="notVisited" className="text-xs h-6 px-2">New</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Trip Overlay</span>
          </div>
          <Select value={selectedTrip?.id?.toString() || "none"} onValueChange={handleTripSelect}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Show a trip..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {upcomingTrips.filter((trip) => !!trip.id).map((trip) => (
                <SelectItem key={trip.id} value={trip.id.toString()}>
                  {trip.name} ({new Date(trip.trip_date + "T00:00:00").toLocaleDateString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
