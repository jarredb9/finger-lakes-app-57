"use client"

import type React from "react"
import { useEffect, useState, useCallback, useRef } from "react"
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from "@vis.gl/react-google-maps"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertTriangle,
  Search,
  MapPin,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import WineryModal from "./winery-modal"

// Debounce hook to prevent excessive API calls
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Interfaces
interface Visit {
  id?: string;
  visitDate: string;
  userReview: string;
  createdAt?: string;
  rating?: number;
  photos?: string[];
}

interface Winery {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  rating?: number;
  userVisited?: boolean;
  visits?: Visit[];
  placeId?: string;
}

interface WineryMapProps {
  userId: string;
}

// Main map content component
function MapContent({ userId }: WineryMapProps) {
  const map = useMap();
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  
  const [searchResults, setSearchResults] = useState<Winery[]>([]);
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null);
  const [searchLocation, setSearchLocation] = useState("");
  const [currentBounds, setCurrentBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [autoSearch, setAutoSearch] = useState(true);

  const debouncedBounds = useDebounce(currentBounds, 1000);

  // Initialize PlacesService once the map is ready
  useEffect(() => {
    if (map) {
      placesServiceRef.current = new google.maps.places.PlacesService(map);
    }
  }, [map]);

  const searchWineries = useCallback(async (location?: string, bounds?: google.maps.LatLngBounds | null) => {
    if (!placesServiceRef.current) return;

    let searchBounds = bounds;
    if (location?.trim() && google?.maps) {
      const geocoder = new google.maps.Geocoder();
      try {
        const { results } = await geocoder.geocode({ address: location });
        if (results && results.length > 0) {
          searchBounds = results[0].geometry.viewport || results[0].geometry.bounds;
          if (searchBounds && map) map.fitBounds(searchBounds);
        }
      } catch (e) {
        console.error("Geocoding failed:", e);
        return;
      }
    }

    if (!searchBounds) return;

    const request = {
      query: "winery",
      locationBias: searchBounds,
    };

    placesServiceRef.current.textSearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        const strictlyVisibleWineries = results.filter(place => {
          if (searchBounds && place.geometry?.location) {
            return searchBounds.contains(place.geometry.location);
          }
          return false;
        }).map(place => ({
          id: place.place_id!,
          placeId: place.place_id!,
          name: place.name!,
          address: place.formatted_address!,
          lat: place.geometry!.location!.lat(),
          lng: place.geometry!.location!.lng(),
          rating: place.rating,
          userVisited: false, // This should be cross-referenced with your DB
        }));
        setSearchResults(strictlyVisibleWineries);
      }
    });
  }, [map]);

  useEffect(() => {
    if (autoSearch && debouncedBounds) {
      searchWineries(undefined, debouncedBounds);
    }
  }, [autoSearch, debouncedBounds, searchWineries]);

  const handleVisitUpdate = async (winery: Winery, visitData: { visitDate: string; userReview: string; rating: number; photos: string[] }) => {
    // DB update logic
  };

  const handleDeleteVisit = async (winery: Winery, visitId: string) => {
    // DB delete logic
  };
  
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLocation.trim()) searchWineries(searchLocation.trim(), null);
  };

  const handleSearchInCurrentArea = () => searchWineries(undefined, currentBounds);
  const clearSearchResults = () => setSearchResults([]);
  
  return (
    <div className="space-y-6">
      <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2"> <Search className="w-5 h-5" /> <span>Discover Wineries</span> </CardTitle>
            <CardDescription> Search for wineries or explore dynamically as you move the map </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                  <Input placeholder="Enter city, region, or address" value={searchLocation} onChange={(e) => setSearchLocation(e.target.value)} className="flex-1" />
                  <Button type="submit" disabled={!searchLocation.trim()}>Search</Button>
                </form>
                <Button variant="outline" onClick={handleSearchInCurrentArea} disabled={!currentBounds} className="flex items-center space-x-2 bg-transparent" > <MapPin className="w-4 h-4" /> <span>Search Current Area</span> </Button>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-2">
                  <Switch id="auto-search" checked={autoSearch} onCheckedChange={setAutoSearch} />
                  <Label htmlFor="auto-search" className="text-sm font-medium"> Auto-discover wineries as you explore </Label>
                </div>
              </div>
               <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {searchResults.length} {searchResults.length === 1 ? 'winery' : 'wineries'} in view
                  </Badge>
                </div>
                {searchResults.length > 0 && <Button variant="ghost" size="sm" onClick={clearSearchResults}> <RotateCcw className="w-4 h-4 mr-1" /> Clear Discovered </Button>}
            </div>
            </div>
          </CardContent>
        </Card>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-0">
              <div className="h-96 w-full lg:h-[600px]">
                <Map
                  defaultCenter={{ lat: 42.5, lng: -77.0 }}
                  defaultZoom={10}
                  gestureHandling={'greedy'}
                  disableDefaultUI={true}
                  mapId={'ac7e853c8d70efc0fdd4c089'}
                  onBoundsChanged={e => setCurrentBounds(e.detail.bounds)}
                >
                  {searchResults.map((winery) => (
                    <AdvancedMarker
                      key={winery.id}
                      position={{ lat: winery.lat, lng: winery.lng }}
                      onClick={() => setSelectedWinery(winery)}
                    >
                      <Pin 
                        background={winery.userVisited ? '#10B981' : '#3B82F6'}
                        borderColor={winery.userVisited ? '#059669' : '#2563EB'}
                        glyphColor={'#fff'}
                      />
                    </AdvancedMarker>
                  ))}
                </Map>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader> <CardTitle>Legend</CardTitle> </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 rounded-full bg-green-500 border border-green-700"></div>
                <span className="text-sm">Visited</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 rounded-full bg-blue-500 border border-blue-700"></div>
                <span className="text-sm">Discovered</span>
              </div>
            </CardContent>
          </Card>
          {searchResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between"> <span>Discovered List</span> <Badge variant="secondary">{searchResults.length}</Badge> </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[450px] overflow-y-auto">
                  {searchResults.map((winery) => (
                    <div key={winery.id} className="p-2 border rounded cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setSelectedWinery(winery)} >
                      <div className="font-medium text-sm">{winery.name}</div>
                      <div className="text-xs text-gray-600">{winery.address}</div>
                      {winery.rating && <div className="text-xs text-gray-500">★ {winery.rating}/5.0</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {selectedWinery && ( <WineryModal winery={selectedWinery} onClose={() => setSelectedWinery(null)} onSaveVisit={handleVisitUpdate} onDeleteVisit={handleDeleteVisit} /> )}
    </div>
  );
}

// Wrapper component to provide the API key
export default function WineryMapWrapper({ userId }: WineryMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
      return (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Google Maps API key is not configured.</AlertDescription>
        </Alert>
      )
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['places']}>
        <MapContent userId={userId} />
    </APIProvider>
  )
}