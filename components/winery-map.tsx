"use client"

import React, { useEffect, useState, useCallback, useRef, memo, useReducer } from "react"
import dynamic from 'next/dynamic'
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from "@vis.gl/react-google-maps"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  AlertTriangle,
  Search,
  MapPin,
  RotateCcw,
  Loader2,
  Info,
  Wine,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Winery, Visit } from "@/lib/types"
import { Skeleton } from "@/components/ui/skeleton"

const WineryModal = dynamic(() => import('./winery-modal'), {
  loading: () => <div className="fixed inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="h-8 w-8 text-white animate-spin" /></div>,
});

interface WineryMapProps { userId: string; }

interface SearchState { isSearching: boolean; hitApiLimit: boolean; results: Winery[]; }
type SearchAction = | { type: 'SEARCH_START' } | { type: 'SEARCH_SUCCESS'; payload: Winery[] } | { type: 'SEARCH_ERROR' } | { type: 'CLEAR_RESULTS' } | { type: 'UPDATE_RESULTS'; payload: Winery[] };
const initialState: SearchState = { isSearching: false, hitApiLimit: false, results: [], };
function searchReducer(state: SearchState, action: SearchAction): SearchState {
    switch (action.type) {
        case 'SEARCH_START': return { ...state, isSearching: true, hitApiLimit: false };
        case 'SEARCH_SUCCESS': return { isSearching: false, hitApiLimit: action.payload.length === 20, results: action.payload };
        case 'SEARCH_ERROR': return { ...state, isSearching: false, results: [] };
        case 'CLEAR_RESULTS': return { ...state, results: [] };
        case 'UPDATE_RESULTS': return { ...state, results: action.payload };
        default: return state;
    }
}

const MapComponent = memo(({ searchResults, onMarkerClick }: { searchResults: Winery[], onMarkerClick: (winery: Winery) => void }) => (
    <div className="h-[50vh] w-full lg:h-[600px] bg-muted">
        <Map defaultCenter={{ lat: 42.5, lng: -77.0 }} defaultZoom={10} gestureHandling={'greedy'} disableDefaultUI={true} mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID} clickableIcons={true}>
            {searchResults.map(winery => (
                <AdvancedMarker key={winery.id} position={{lat: winery.lat, lng: winery.lng}} onClick={() => onMarkerClick(winery)}>
                    <Pin background={winery.userVisited ? '#10B981' : '#3B82F6'} borderColor={winery.userVisited ? '#059669' : '#2563EB'} glyphColor="#fff" />
                </AdvancedMarker>
            ))}
        </Map>
    </div>
));
MapComponent.displayName = 'MapComponent';

const SearchUI = memo(({ searchState, searchLocation, setSearchLocation, autoSearch, setAutoSearch, handleSearchSubmit, handleManualSearchArea, dispatch }) => (
    <Card>
        <CardHeader> <CardTitle className="flex items-center gap-2"><Search /> Discover Wineries</CardTitle> <CardDescription>Search for wineries, or click directly on the map to add a location.</CardDescription> </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
                <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                    <Input placeholder="Enter city or region" value={searchLocation} onChange={e => setSearchLocation(e.target.value)} aria-label="Search Location"/>
                    <Button type="submit" disabled={searchState.isSearching} aria-label="Search"> {searchState.isSearching ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />} <span className="ml-2">Search</span> </Button>
                </form>
                <Button variant="outline" onClick={handleManualSearchArea} disabled={searchState.isSearching} aria-label="Search This Area"> <MapPin className="mr-2 w-4 h-4" /> Search This Area </Button>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50/50 rounded-lg border border-blue-200">
                <Label htmlFor="auto-search" className="flex items-center gap-2 text-sm font-medium cursor-pointer"> <Switch id="auto-search" checked={autoSearch} onCheckedChange={setAutoSearch} aria-label="Auto-discover wineries as you explore" /> Auto-discover wineries as you explore </Label>
            </div>
            <div className="h-12">
              {searchState.hitApiLimit && (<Alert variant="default" className="bg-yellow-50 border-yellow-200"> <Info className="h-4 w-4 text-yellow-700" /> <AlertDescription className="text-yellow-800"> Map results are limited. Zoom in for more wineries. </AlertDescription> </Alert>)}
            </div>
            <div className="flex items-center justify-between">
                <Badge variant="secondary">{searchState.isSearching ? 'Searching...' : `${searchState.results.length} wineries in view`}</Badge>
                {searchState.results.length > 0 && <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'CLEAR_RESULTS' })} aria-label="Clear Search Results"><RotateCcw className="mr-2 w-4 h-4" /> Clear</Button>}
            </div>
        </CardContent>
    </Card>
));
SearchUI.displayName = 'SearchUI';

const ResultsUI = memo(({ searchState, onOpenModal }: { searchState: SearchState, onOpenModal: (winery: Winery) => void }) => (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
            <Card> <CardContent className="p-0 relative"> <MapComponent searchResults={searchState.results} onMarkerClick={onOpenModal} /> </CardContent> </Card>
        </div>
        <div className="space-y-4">
            <Card>
                <CardHeader><CardTitle>Legend</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex items-center gap-2"> <div style={{ backgroundColor: '#10B981', border: '2px solid #059669' }} className="w-4 h-4 rounded-full" /> <span className="text-sm">Visited</span> </div>
                    <div className="flex items-center gap-2"> <div style={{ backgroundColor: '#3B82F6', border: '2px solid #2563EB' }} className="w-4 h-4 rounded-full" /> <span className="text-sm">Discovered</span> </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="flex justify-between items-center">Discovered List <Badge>{searchState.results.length}</Badge></CardTitle></CardHeader>
                <CardContent className="relative">
                    {searchState.isSearching && (<div className="absolute inset-0 bg-white/70 dark:bg-zinc-900/70 flex items-center justify-center rounded-b-lg z-10"><Loader2 className="animate-spin text-muted-foreground h-8 w-8" /></div>)}
                    <div className="space-y-2 max-h-[450px] min-h-[400px] overflow-y-auto">
                        {searchState.results.length === 0 && !searchState.isSearching && (
                          <div className="text-center pt-10 text-muted-foreground">
                            <Wine className="mx-auto h-12 w-12" />
                            <p className="mt-4 text-sm">No wineries found in this area.</p>
                            <p className="text-xs">Try searching for a different location or zooming out.</p>
                          </div>
                        )}
                        {searchState.isSearching && Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="p-2 border rounded">
                            <Skeleton className="h-4 w-3/4 mb-2" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        ))}
                        {!searchState.isSearching && searchState.results.map(winery => (
                            <div key={winery.id} className="p-2 border rounded cursor-pointer hover:bg-muted" onClick={() => onOpenModal(winery)}>
                                <p className="font-medium text-sm">{winery.name}</p>
                                <p className="text-xs text-muted-foreground">{winery.address}</p>
                                {winery.rating && <p className="text-xs text-muted-foreground">★ {winery.rating}/5.0</p>}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
));
ResultsUI.displayName = 'ResultsUI';

function useWineries() {
  const [allUserVisits, setAllUserVisits] = useState<Visit[]>([]);
  const { toast } = useToast();

  const fetchUserVisits = useCallback(async () => {
    try {
      const response = await fetch('/api/visits');
      if (response.ok) {
        const visits = await response.json();
        setAllUserVisits(visits);
      }
    } catch (error) {
      console.error("Failed to fetch user visits:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not fetch your visits.",
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchUserVisits();
  }, [fetchUserVisits]);

  return { allUserVisits, fetchUserVisits };
}


function WineryMapLogic({ userId }: WineryMapProps) {
  const [searchState, dispatch] = useReducer(searchReducer, initialState);
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null);
  const [searchLocation, setSearchLocation] = useState("Finger Lakes, NY");
  const [autoSearch, setAutoSearch] = useState(true);
  const { allUserVisits, fetchUserVisits } = useWineries();
  const { toast } = useToast();
  
  const [proposedWinery, setProposedWinery] = useState<Winery | null>(null);
  
  const searchFnRef = useRef<((locationText?: string, bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral) => Promise<void>) | null>(null);
  const initialSearchFired = useRef(false);

  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const map = useMap();

  useEffect(() => {
    if (geocoding) {
      setGeocoder(new geocoding.Geocoder());
    }
  }, [geocoding]);

  // THIS IS THE FIX: A new useEffect to synchronize search results with visit status
  useEffect(() => {
    // If there are no results, there's nothing to update
    if (searchState.results.length === 0) return;

    const visitedPlaceIds = new Set(allUserVisits.map((v: Visit) => v.wineries.google_place_id));

    const updatedResults = searchState.results.map(winery => ({
        ...winery,
        userVisited: visitedPlaceIds.has(winery.id)
    }));

    // Dispatch an update to the search results state to trigger a re-render of the map pins
    dispatch({ type: 'UPDATE_RESULTS', payload: updatedResults });
  }, [allUserVisits]); // This effect runs whenever the `allUserVisits` state changes
  
  const getVisitedWineryIds = useCallback(() => new Set(allUserVisits.map(v => v.wineries.google_place_id)), [allUserVisits]);
  
  const executeSearch = useCallback(async (locationText?: string, bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral) => {
    if (!places || !geocoder) return;
    dispatch({ type: 'SEARCH_START' });

    let searchBounds: google.maps.LatLngBounds;
    if (locationText) {
        try {
            const { results } = await geocoder.geocode({ address: locationText });
            if (results && results.length > 0 && results[0].geometry.viewport) { searchBounds = results[0].geometry.viewport; map?.fitBounds(searchBounds); } 
            else { toast({ variant: "destructive", description: "Could not find that location." }); dispatch({ type: 'SEARCH_ERROR' }); return; }
        } catch (error) { console.error("Geocoding failed:", error); dispatch({ type: 'SEARCH_ERROR' }); return; }
    } else if (bounds) { searchBounds = new google.maps.LatLngBounds(bounds); } 
    else { dispatch({ type: 'SEARCH_ERROR' }); return; }

    const request = { textQuery: "winery OR vineyard OR tasting room OR cellars", fields: ["displayName", "location", "formattedAddress", "rating", "id", "websiteURI", "nationalPhoneNumber"], locationRestriction: searchBounds };
    try {
        const { places: foundPlaces } = await google.maps.places.Place.searchByText(request);
        const visitedIds = getVisitedWineryIds();
        const wineries = foundPlaces.map(place => ({
            id: place.id!, name: place.displayName!, address: place.formattedAddress!, lat: place.location!.lat(), lng: place.location!.lng(),
            rating: place.rating, website: place.websiteURI, phone: place.nationalPhoneNumber, userVisited: visitedIds.has(place.id!),
        }));
        dispatch({ type: 'SEARCH_SUCCESS', payload: wineries });
    } catch (error) { console.error("Google Places search error:", error); dispatch({ type: 'SEARCH_ERROR' }); }
  }, [map, places, geocoder, getVisitedWineryIds, toast]);

    useEffect(() => { searchFnRef.current = executeSearch; });
    
    useEffect(() => {
        if (!map || !geocoder) return;

        if (!initialSearchFired.current) { 
            initialSearchFired.current = true; 
            searchFnRef.current?.("Finger Lakes, NY"); 
        }
        
        const idleListener = map.addListener('idle', () => {
            if (autoSearch && initialSearchFired.current) { 
                const bounds = map.getBounds(); 
                if (bounds) { 
                    searchFnRef.current?.(undefined, bounds); 
                } 
            }
        });
        return () => { google.maps.event.removeListener(idleListener); };
    }, [map, geocoder, autoSearch]);

  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (!places || !geocoder || !e.latLng) {
      toast({ variant: "destructive", description: "Map services not yet ready. Please wait a moment and try again." });
      return;
    }

    let placeId: string | undefined | null = e.placeId;

    if (placeId) {
      e.stop();
    } else {
      const { results } = await geocoder.geocode({ location: e.latLng });
      if (results && results[0]) {
        placeId = results[0].place_id;
      }
    }

    if (!placeId) {
      toast({ variant: "destructive", description: "Could not identify a location at that point. Please click closer to a point of interest." });
      return;
    }

    try {
        const placeDetails = new places.Place({ id: placeId });
        await placeDetails.fetchFields({ fields: ["displayName", "formattedAddress", "websiteURI", "nationalPhoneNumber", "location"]});

        if (!placeDetails.location) {
            toast({ variant: "destructive", description: "Could not get details for this location." });
            return;
        }

        const newWinery: Winery = {
            id: placeId,
            name: placeDetails.displayName || placeDetails.formattedAddress?.split(',')[0] || "Unnamed Location",
            address: placeDetails.formattedAddress || 'Address not available',
            lat: placeDetails.location.lat(),
            lng: placeDetails.location.lng(),
            website: placeDetails.websiteURI,
            phone: placeDetails.nationalPhoneNumber,
            userVisited: getVisitedWineryIds().has(placeId)
        };
        setProposedWinery(newWinery);
    } catch (error) {
        console.error("Error fetching place details:", error);
        toast({ variant: "destructive", description: "An error occurred while fetching details for the location." });
    }
  }, [places, geocoder, getVisitedWineryIds, toast]);

  useEffect(() => {
    if (!map) return;
    const clickListener = map.addListener('click', handleMapClick);
    return () => {
        clickListener.remove();
    };
  }, [map, handleMapClick]);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); if (searchLocation.trim()) { executeSearch(searchLocation.trim()); } };
  const handleManualSearchArea = () => { const bounds = map?.getBounds(); if (bounds) { executeSearch(undefined, bounds); } };
  
  const handleOpenModal = (winery: Winery) => { 
    const wineryVisits = allUserVisits.filter(v => v.wineries.google_place_id === winery.id); 
    setSelectedWinery({ ...winery, visits: wineryVisits }); 
  };
  
  const handleSaveVisit = async (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: string[] }) => {
    const payload = { 
        wineryData: winery,
        visit_date: visitData.visit_date, 
        user_review: visitData.user_review, 
        rating: visitData.rating, 
        photos: visitData.photos 
    };

    const response = await fetch('/api/visits', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload), 
    });

    if (response.ok) { 
        toast({ description: "Visit saved successfully." }); 
        await fetchUserVisits();
        setSelectedWinery(null); 
    } else { 
        const errorData = await response.json();
        toast({ variant: "destructive", description: `Failed to save visit: ${errorData.details || errorData.error}` }); 
    }
  };

  const handleDeleteVisit = async (winery: Winery, visitId: string) => {
    const response = await fetch(`/api/visits/${visitId}`, { method: 'DELETE' });
    if (response.ok) { 
      toast({ description: "Visit deleted successfully." }); 
      await fetchUserVisits();
      setSelectedWinery(w => w ? {...w, visits: w.visits?.filter(v => v.id !== visitId) } : null); 
    } else { 
      toast({ variant: "destructive", description: "Failed to delete visit." }); 
    }
  };

  if (!places || !geocoder) {
    return (
        <div className="flex justify-center items-center h-[600px] w-full">
            <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading map services...</span>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <SearchUI 
        searchState={searchState}
        searchLocation={searchLocation}
        setSearchLocation={setSearchLocation}
        autoSearch={autoSearch}
        setAutoSearch={setAutoSearch}
        handleSearchSubmit={handleSearchSubmit}
        handleManualSearchArea={handleManualSearchArea}
        dispatch={dispatch}
      />
      <ResultsUI searchState={searchState} onOpenModal={handleOpenModal} />
      {selectedWinery && (<WineryModal winery={selectedWinery} onClose={() => setSelectedWinery(null)} onSaveVisit={handleSaveVisit} onDeleteVisit={handleDeleteVisit} />)}

      {proposedWinery && (
        <AlertDialog open={!!proposedWinery} onOpenChange={() => setProposedWinery(null)}>
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
                    <AlertDialogCancel onClick={() => setProposedWinery(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                        handleOpenModal(proposedWinery);
                        setProposedWinery(null);
                    }}>Add Visit</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export default function WineryMapWrapper({ userId }: WineryMapProps) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        return (<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Google Maps API key is not configured.</AlertDescription></Alert>);
    }
    return (<APIProvider apiKey={apiKey} libraries={['places', 'geocoding']}><WineryMapLogic userId={userId} /></APIProvider>);
}