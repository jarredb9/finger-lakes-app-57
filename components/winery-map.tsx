"use client"

import type React from "react"
import { useEffect, useState, useCallback, useRef } from "react"
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from "@vis.gl/react-google-maps"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertTriangle,
  Search,
  MapPin,
  RotateCcw,
  Loader2, // Added for loading spinner
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import WineryModal from "./winery-modal"
import { useToast } from "@/hooks/use-toast"

// Interfaces
interface Visit { id?: string; visitDate: string; userReview: string; createdAt?: string; rating?: number; photos?: string[]; }
interface Winery { id: string; name:string; address: string; lat: number; lng: number; phone?: string; website?: string; rating?: number; userVisited?: boolean; visits?: Visit[]; placeId?: string; }
interface WineryMapProps { userId: string; }

// Main map content component
function MapContent({ userId }: WineryMapProps) {
  const map = useMap();
  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const [searchResults, setSearchResults] = useState<Winery[]>([]);
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null);
  const [searchLocation, setSearchLocation] = useState("");
  const [currentBounds, setCurrentBounds] = useState<google.maps.LatLngBoundsLiteral | null>(null);
  const [autoSearch, setAutoSearch] = useState(true);
  const [isSearching, setIsSearching] = useState(false); // New state for loading
  const [visitedWineryIds, setVisitedWineryIds] = useState<Set<string>>(new Set()); // New state for visited wineries
  const initialSearchDone = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!map || !places || !geocoding) return;
    setGeocoder(new geocoding.Geocoder());
  }, [map, places, geocoding]);

  // Fetch user's visits to mark wineries as visited
  const fetchUserVisits = useCallback(async () => {
    try {
      const response = await fetch('/api/visits');
      if (response.ok) {
        const visits = await response.json();
        const visitedIds = new Set(visits.map((v: any) => v.winery_id));
        setVisitedWineryIds(visitedIds);
      }
    } catch (error) {
      console.error("Failed to fetch user visits:", error);
    }
  }, []);

  useEffect(() => {
    fetchUserVisits();
  }, [fetchUserVisits]);

    const searchWineries = useCallback(async (location?: string, boundsForSearch?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral | null) => {
        setIsSearching(true);
        setSearchResults([]); // Clear previous results immediately

        if (!geocoder || !places) {
            setIsSearching(false);
            return;
        }

        let searchBounds: google.maps.LatLngBounds;

        if (location?.trim()) {
            try {
                const { results } = await geocoder.geocode({ address: location });
                if (results && results.length > 0 && results[0].geometry.viewport) {
                    searchBounds = results[0].geometry.viewport;
                    if (map) map.fitBounds(searchBounds);
                } else {
                    setIsSearching(false);
                    return;
                }
            } catch (e) {
                console.error("Geocoding failed:", e);
                setIsSearching(false);
                return;
            }
        } else if (boundsForSearch) {
            searchBounds = new google.maps.LatLngBounds(boundsForSearch);
        } else {
            setIsSearching(false);
            return;
        }

        // Note: The Places API searchByText method returns a maximum of 20 results.
        // For a more comprehensive search in a large area, you might need to implement
        // a grid-based search strategy, performing multiple searches for smaller areas
        // within the current map bounds. This is a more advanced implementation.
        const request = {
            textQuery: "winery",
            fields: ["displayName", "location", "formattedAddress", "rating", "id", "websiteURI", "nationalPhoneNumber"],
            locationBias: searchBounds,
        };

        try {
            const { places: foundPlaces } = await google.maps.places.Place.searchByText(request);

            if (foundPlaces.length) {
                const allWineries = foundPlaces.map(place => ({
                    id: place.id!,
                    placeId: place.id!,
                    name: place.displayName!,
                    address: place.formattedAddress!,
                    lat: place.location!.lat(),
                    lng: place.location!.lng(),
                    rating: place.rating,
                    website: place.websiteURI,
                    phone: place.nationalPhoneNumber,
                    userVisited: visitedWineryIds.has(place.id!),
                    visits: [], // This can be populated when a winery is selected
                }));
                setSearchResults(allWineries);
            } else {
                setSearchResults([]);
            }
        } catch (error) {
            console.error("Error searching for wineries:", error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [map, places, geocoder, visitedWineryIds]);

  // Debounced search for when the user stops panning the map
  useEffect(() => {
    if (!autoSearch || !currentBounds || !initialSearchDone.current) return;
    
    const handler = setTimeout(() => {
      searchWineries(undefined, currentBounds);
    }, 1500);
    
    return () => clearTimeout(handler);
  }, [autoSearch, currentBounds, searchWineries]);
  
  const handleMapLoad = useCallback(() => {
    if (map && !initialSearchDone.current) {
      const bounds = map.getBounds();
      if (bounds) {
        setCurrentBounds(bounds.toJSON());
        searchWineries(undefined, bounds);
        initialSearchDone.current = true;
      }
    }
  }, [map, searchWineries]);

  const handleSearchSubmit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (searchLocation.trim()) { 
      searchWineries(searchLocation.trim(), null); 
    }
  };

  const handleSearchInCurrentArea = () => {
    searchWineries(undefined, currentBounds);
  };
  
  const clearSearchResults = () => setSearchResults([]);
  
  const handleVisitUpdate = async (winery: Winery, visitData: { visitDate: string; userReview: string; rating: number; photos: string[] }) => {
    try {
      const response = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wineryId: winery.id,
          visitDate: visitData.visitDate,
          userReview: visitData.userReview,
          rating: visitData.rating,
          photos: visitData.photos,
        }),
      });

      if (!response.ok) throw new Error('Failed to save visit');
      
      await fetchUserVisits(); // Re-fetch visits to update the map
      toast({ title: "Success", description: "Your visit has been saved." });
    } catch (error) {
      console.error("Error saving visit:", error);
      toast({ title: "Error", description: "There was a problem saving your visit.", variant: "destructive" });
    }
  };

  const handleDeleteVisit = async (winery: Winery, visitId: string) => {
    try {
      const response = await fetch(`/api/visits/${visitId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete visit');

      await fetchUserVisits(); // Re-fetch visits to update the map
      toast({ title: "Success", description: "The visit has been deleted." });
    } catch (error) {
      console.error("Error deleting visit:", error);
      toast({ title: "Error", description: "There was a problem deleting your visit.", variant: "destructive" });
    }
  };


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
                  <Input placeholder="Enter city, region, or address" value={searchLocation} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchLocation(e.target.value)} className="flex-1" />
                  <Button type="submit" disabled={!searchLocation.trim() || isSearching}>
                    {isSearching && !autoSearch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Search
                  </Button>
                </form>
                <Button variant="outline" onClick={handleSearchInCurrentArea} disabled={!currentBounds || isSearching} className="flex items-center space-x-2 bg-transparent" > 
                  {isSearching && autoSearch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  <span>Search Current Area</span> 
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-2">
                  <Switch id="auto-search" checked={autoSearch} onCheckedChange={setAutoSearch} />
                  <Label htmlFor="auto-search" className="text-sm font-medium"> Auto-discover wineries as you explore </Label>
                </div>
              </div>
               <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge className="bg-blue-100 text-blue-800">
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
            <CardContent className="p-0 relative">
              {isSearching && (
                <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              )}
              <div className="h-96 w-full lg:h-[600px]">
                <Map
                  defaultCenter={{ lat: 42.5, lng: -77.0 }}
                  defaultZoom={10}
                  gestureHandling={'greedy'}
                  disableDefaultUI={true}
                  mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'ac7e853c8d70efc0fdd4c089'}
                  onBoundsChanged={(e) => setCurrentBounds(e.detail.bounds)}
                  onTilesLoaded={handleMapLoad}
                >
                  {searchResults.map((winery: Winery) => (
                    <AdvancedMarker key={winery.id} position={{ lat: winery.lat, lng: winery.lng }} onClick={() => setSelectedWinery(winery)}>
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
                <CardTitle className="flex items-center justify-between"> <span>Discovered List</span> <Badge>{searchResults.length}</Badge> </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[450px] overflow-y-auto">
                  {searchResults.map((winery: Winery) => (
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
  )
}

// Wrapper component to provide the API key
export default function WineryMapWrapper({ userId }: WineryMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!apiKey) {
      return (
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Google Maps API key is not configured.</AlertDescription>
        </Alert>
      )
  }
  
  if (!mounted) {
    return <div className="h-96 w-full lg:h-[600px] bg-gray-100 rounded-lg animate-pulse" />;
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['places', 'marker', 'geocoding']}>
        <MapContent userId={userId} />
    </APIProvider>
  )
}