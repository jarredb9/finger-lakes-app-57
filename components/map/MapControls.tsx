"use client";
import React, { memo, useState } from "react";
import {
  Search,
  MapPin,
  Loader2,
  XCircle,
  Clock,
  ChevronUp,
  ChevronDown,
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
    const { upcomingTrips, fetchTripById, selectedTrip, setSelectedTrip } = useTripStore();
    const [isExpanded, setIsExpanded] = useState(false); // Default to collapsed to avoid obstruction

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
      <Card className="shadow-lg">
        <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="w-4 h-4" /> Discover & Filter
            </CardTitle>
             <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
          {isExpanded && (
             <CardDescription>
                Search, filter, and manage trip overlays.
             </CardDescription>
          )}
        </CardHeader>
        {isExpanded && (
            <CardContent className="space-y-4 px-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-2">
                <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                <Input
                    placeholder="City or region..."
                    value={searchLocation}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchLocation(e.target.value)
                    }
                    aria-label="Search Location"
                    className="h-9"
                />
                <Button type="submit" size="sm" disabled={isSearching} aria-label="Search">
                    {isSearching ? (
                    <Loader2 className="animate-spin w-4 h-4" />
                    ) : (
                    <Search className="w-4 h-4" />
                    )}
                </Button>
                </form>
                <Button
                variant="outline"
                size="sm"
                onClick={handleManualSearchArea}
                disabled={isSearching}
                aria-label="Search Here"
                >
                <MapPin className="mr-2 w-4 h-4" /> Area
                </Button>
            </div>
            {hitApiLimit && (
                <Alert
                variant="default"
                className="bg-yellow-50 border-yellow-200 text-yellow-800 py-2"
                >
                <AlertTriangle className="h-4 w-4 !text-yellow-600" />
                <AlertDescription className="text-xs">
                    Zoom in to see more results.
                </AlertDescription>
                </Alert>
            )}
            
            <div className="space-y-3">
                 <div className="space-y-2">
                    <span className="text-xs font-medium uppercase text-muted-foreground">Filter Wineries</span>
                    {selectedTrip ? (
                        <div className="flex items-center">
                            <Badge
                                className="bg-[#f17e3a] hover:bg-[#f17e3a] cursor-pointer"
                                onClick={() => setSelectedTrip(null)}
                            >
                                Viewing: {selectedTrip.name} <XCircle className="w-3 h-3 ml-1" />
                            </Badge>
                        </div>
                    ) : (
                        <ToggleGroup
                            type="multiple"
                            value={filter}
                            onValueChange={onFilterChange}
                            aria-label="Filter wineries"
                            className="justify-start flex-wrap gap-2"
                            size="sm"
                        >
                            <ToggleGroupItem value="all" aria-label="All" className="text-xs h-7 px-2">All</ToggleGroupItem>
                            <ToggleGroupItem value="visited" aria-label="Visited" className="text-xs h-7 px-2">Visited</ToggleGroupItem>
                            <ToggleGroupItem value="favorites" aria-label="Favorites" className="text-xs h-7 px-2">Favorites</ToggleGroupItem>
                            <ToggleGroupItem value="wantToGo" aria-label="Want to Go" className="text-xs h-7 px-2">Want to Go</ToggleGroupItem>
                            <ToggleGroupItem value="notVisited" aria-label="Discovered" className="text-xs h-7 px-2">Discovered</ToggleGroupItem>
                        </ToggleGroup>
                    )}
                </div>

                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-medium uppercase text-muted-foreground">Trip Overlay</span>
                    </div>
                    <Select
                        value={selectedTrip?.id?.toString() || "none"}
                        onValueChange={handleTripSelect}
                    >
                    <SelectTrigger className="w-full h-9 text-sm">
                        <SelectValue placeholder="Show a trip on the map..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {upcomingTrips
                        .filter((trip) => !!trip.id)
                        .map((trip) => (
                            <SelectItem key={trip.id} value={trip.id.toString()}>
                            {trip.name} ({new Date(trip.trip_date + "T00:00:00").toLocaleDateString()})
                            </SelectItem>
                        ))}
                    </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex items-center justify-between p-2 bg-blue-50/50 rounded-lg border border-blue-200">
                <Label
                htmlFor="auto-search"
                className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                >
                <Switch
                    id="auto-search"
                    checked={autoSearch}
                    onCheckedChange={setAutoSearch}
                    className="scale-75"
                    aria-label="Auto-discover"
                />
                Auto-search when moving map
                </Label>
            </div>
            </CardContent>
        )}
      </Card>
    );
  }
);

MapControls.displayName = "MapControls";

export default MapControls;