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
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import WineryModal from "./winery-modal"
import { useToast } from "@/hooks/use-toast"

// Interfaces
interface Visit {
    id: string;
    visit_date: string;
    user_review: string;
    rating?: number;
    photos?: string[];
    winery_id: string;
}

interface Winery {
    id: string; // This is the Google Place ID
    name: string;
    address: string;
    lat: number;
    lng: number;
    phone?: string;
    website?: string;
    rating?: number;
    userVisited?: boolean;
    visits?: Visit[]; // Populated when a winery is selected
}

interface WineryMapProps {
    userId: string;
}

// Main map content component
function MapContent({ userId }: WineryMapProps) {
  const map = useMap();
  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const [searchResults, setSearchResults] = useState<Winery[]>([]);
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null);
  const [searchLocation, setSearchLocation] = useState("Finger Lakes, NY");
  const [autoSearch, setAutoSearch] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [allUserVisits, setAllUserVisits] = useState<Visit[]>([]);
  const initialLoadFired = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (places && geocoding) {
      setGeocoder(new geocoding.Geocoder());
    }
  }, [places, geocoding]);

  const fetchUserVisits = useCallback(async () => {
    try {
      const response = await fetch('/api/visits');
      if (response.ok) {
        const visits: Visit[] = await response.json();
        setAllUserVisits(visits);
      }
    } catch (error) {
      console.error("Failed to fetch user visits:", error);
    }
  }, []);

  useEffect(() => {
    fetchUserVisits();
  }, [fetchUserVisits]);

  const getVisitedWineryIds = () => {
    return new Set(allUserVisits.map(v => v.winery_id));
  };
  
  const searchWineries = useCallback(async (locationText?: string, bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral) => {
    if (!places || !geocoder) return;

    setIsSearching(true);
    setSearchResults([]); // Always clear results before a new search

    let searchBounds: google.maps.LatLngBounds;

    if (locationText) {
      const { results } = await geocoder.geocode({ address: locationText });
      if (results && results.length > 0 && results[0].geometry.viewport) {
        searchBounds = results[0].geometry.viewport;
        map?.fitBounds(searchBounds);
      } else {
        toast({ variant: "destructive", description: "Could not find that location." });
        setIsSearching(false);
        return;
      }
    } else if (bounds) {
      searchBounds = new google.maps.LatLngBounds(bounds);
    } else {
      setIsSearching(false);
      return;
    }

    // --- API LIMITATION ---
    // The searchByText method returns a MAXIMUM of 20 results per query.
    // When zoomed out on a dense area, you may see fewer than all available wineries.
    // A more advanced solution involves breaking the map viewport into a grid and
    // running a search query for each grid cell to get more comprehensive results.
    const request = {
      textQuery: "winery",
      fields: ["displayName", "location", "formattedAddress", "rating", "id", "websiteURI", "nationalPhoneNumber"],
      locationBias: searchBounds,
    };

    try {
      const { places: foundPlaces } = await google.maps.places.Place.searchByText(request);
      const visitedIds = getVisitedWineryIds();

      const wineries = foundPlaces.map(place => ({
        id: place.id!,
        name: place.displayName!,
        address: place.formattedAddress!,
        lat: place.location!.lat(),
        lng: place.location!.lng(),
        rating: place.rating,
        website: place.websiteURI,
        phone: place.nationalPhoneNumber,
        userVisited: visitedIds.has(place.id!),
      }));

      setSearchResults(wineries);
    } catch (error) {
      console.error("Google Places search error:", error);
    } finally {
      setIsSearching(false);
    }
  }, [map, places, geocoder, allUserVisits, toast]);
  
  // Effect for handling map idle event (user stops moving the map)
  useEffect(() => {
    if (!map || !autoSearch) return;

    const idleListener = map.addListener('idle', () => {
      if (!initialLoadFired.current) {
        // Fire initial search on first load
        searchWineries("Finger Lakes, NY");
        initialLoadFired.current = true;
      } else {
        // Subsequent searches when user moves map
        const bounds = map.getBounds();
        if (bounds) {
          searchWineries(undefined, bounds);
        }
      }
    });

    return () => google.maps.event.removeListener(idleListener);
  }, [map, autoSearch, searchWineries]);


  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLocation.trim()) {
      searchWineries(searchLocation.trim());
    }
  };

  const handleManualSearchArea = () => {
    const bounds = map?.getBounds();
    if (bounds) {
      searchWineries(undefined, bounds);
    }
  };

  const handleOpenModal = (winery: Winery) => {
    const wineryVisits = allUserVisits.filter(v => v.winery_id === winery.id);
    setSelectedWinery({ ...winery, visits: wineryVisits });
  };
  
  const handleSaveVisit = async (winery: Winery, visitData: Omit<Visit, 'id' | 'winery_id'>) => {
    const response = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wineryId: winery.id,
        visitDate: visitData.visit_date,
        userReview: visitData.user_review,
        rating: visitData.rating,
        photos: visitData.photos,
      }),
    });

    if (response.ok) {
      toast({ description: "Visit saved successfully." });
      await fetchUserVisits(); // Refresh all visits
      setSelectedWinery(null); // Close modal
    } else {
      toast({ variant: "destructive", description: "Failed to save visit." });
    }
  };

  const handleDeleteVisit = async (winery: Winery, visitId: string) => {
    const response = await fetch(`/api/visits/${visitId}`, { method: 'DELETE' });

    if (response.ok) {
      toast({ description: "Visit deleted successfully." });
      await fetchUserVisits(); // Refresh all visits
      // Optimistically update the modal view
      setSelectedWinery(w => w ? {...w, visits: w.visits?.filter(v => v.id !== visitId) } : null);
    } else {
      toast({ variant: "destructive", description: "Failed to delete visit." });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search /> Discover Wineries</CardTitle>
          <CardDescription>Search for wineries or explore dynamically as you move the map.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
              <Input placeholder="Enter city or region" value={searchLocation} onChange={e => setSearchLocation(e.target.value)} />
              <Button type="submit" disabled={isSearching}>
                {isSearching && <Loader2 className="animate-spin" />}
                {!isSearching && <Search />}
                <span className="ml-2">Search</span>
              </Button>
            </form>
            <Button variant="outline" onClick={handleManualSearchArea} disabled={isSearching}>
              <MapPin className="mr-2" /> Search This Area
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-50/50 rounded-lg border border-blue-200">
            <Label htmlFor="auto-search" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Switch id="auto-search" checked={autoSearch} onCheckedChange={setAutoSearch} />
              Auto-discover wineries as you explore
            </Label>
          </div>
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{isSearching ? 'Searching...' : `${searchResults.length} wineries in view`}</Badge>
            {searchResults.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSearchResults([])}><RotateCcw className="mr-2 w-4 h-4" /> Clear</Button>}
          </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-0 relative">
              <div className="h-96 w-full lg:h-[600px] bg-muted">
                <Map
                  defaultCenter={{ lat: 42.5, lng: -77.0 }}
                  defaultZoom={10}
                  gestureHandling={'greedy'}
                  disableDefaultUI={true}
                  mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
                >
                  {searchResults.map(winery => (
                    <AdvancedMarker key={winery.id} position={winery} onClick={() => handleOpenModal(winery)}>
                      <Pin background={winery.userVisited ? '#10B981' : '#3B82F6'} borderColor={winery.userVisited ? '#059669' : '#2563EB'} glyphColor="#fff" />
                    </AdvancedMarker>
                  ))}
                </Map>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Legend</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2"><Pin background="#10B981" borderColor="#059669" glyphColor="#fff" /><span className="text-sm">Visited</span></div>
              <div className="flex items-center gap-2"><Pin background="#3B82F6" borderColor="#2563EB" glyphColor="#fff" /><span className="text-sm">Discovered</span></div>
            </CardContent>
          </Card>
          {searchResults.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex justify-between items-center">Discovered List <Badge>{searchResults.length}</Badge></CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[450px] overflow-y-auto">
                  {searchResults.map(winery => (
                    <div key={winery.id} className="p-2 border rounded cursor-pointer hover:bg-muted" onClick={() => handleOpenModal(winery)}>
                      <p className="font-medium text-sm">{winery.name}</p>
                      <p className="text-xs text-muted-foreground">{winery.address}</p>
                      {winery.rating && <p className="text-xs text-muted-foreground">★ {winery.rating}/5.0</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      
      {selectedWinery && (
        <WineryModal
          winery={selectedWinery}
          onClose={() => setSelectedWinery(null)}
          onSaveVisit={handleSaveVisit}
          onDeleteVisit={handleDeleteVisit}
        />
      )}
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
                <AlertDescription>Google Maps API key is not configured in environment variables.</AlertDescription>
            </Alert>
        );
    }

    return (
        <APIProvider apiKey={apiKey} libraries={['places', 'geocoding']}>
            <MapContent userId={userId} />
        </APIProvider>
    );
}