"use client"

import React, { useEffect, useState, useCallback, useRef, memo, useReducer } from "react"
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from "@vis.gl/react-google-maps"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import WineryModal from "./winery-modal"
import { useToast } from "@/hooks/use-toast"

// --- Interfaces & Types ---
interface Visit { id: string; visit_date: string; user_review: string; rating?: number; photos?: string[]; winery_id: string; }
interface Winery { id: string; name: string; address: string; lat: number; lng: number; phone?: string; website?: string; rating?: number; userVisited?: boolean; visits?: Visit[]; }
interface WineryMapProps { userId: string; }

// --- State Management with useReducer for Performance ---
interface SearchState { isSearching: boolean; hitApiLimit: boolean; results: Winery[]; }
type SearchAction = | { type: 'SEARCH_START' } | { type: 'SEARCH_SUCCESS'; payload: Winery[] } | { type: 'SEARCH_ERROR' } | { type: 'CLEAR_RESULTS' };
const initialState: SearchState = { isSearching: false, hitApiLimit: false, results: [], };
function searchReducer(state: SearchState, action: SearchAction): SearchState {
    switch (action.type) {
        case 'SEARCH_START': return { ...state, isSearching: true, hitApiLimit: false };
        case 'SEARCH_SUCCESS': return { isSearching: false, hitApiLimit: action.payload.length === 20, results: action.payload };
        case 'SEARCH_ERROR': return { ...state, isSearching: false, results: [] };
        case 'CLEAR_RESULTS': return { ...state, results: [] };
        default: return state;
    }
}

// --- Memoized Child Components for Ultimate Performance ---
const MapComponent = memo(({ searchResults, onMarkerClick, onMapClick }: { searchResults: Winery[], onMarkerClick: (winery: Winery) => void, onMapClick: (e: google.maps.MapMouseEvent) => void }) => (
    <div className="h-[50vh] w-full lg:h-[600px] bg-muted">
        <Map defaultCenter={{ lat: 42.5, lng: -77.0 }} defaultZoom={10} gestureHandling={'greedy'} disableDefaultUI={true} mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID} onClick={onMapClick}>
            {searchResults.map(winery => (
                <AdvancedMarker key={winery.id} position={winery} onClick={() => onMarkerClick(winery)}>
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
                    <Input placeholder="Enter city or region" value={searchLocation} onChange={e => setSearchLocation(e.target.value)} />
                    <Button type="submit" disabled={searchState.isSearching}> {searchState.isSearching ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />} <span className="ml-2">Search</span> </Button>
                </form>
                <Button variant="outline" onClick={handleManualSearchArea} disabled={searchState.isSearching}> <MapPin className="mr-2 w-4 h-4" /> Search This Area </Button>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50/50 rounded-lg border border-blue-200">
                <Label htmlFor="auto-search" className="flex items-center gap-2 text-sm font-medium cursor-pointer"> <Switch id="auto-search" checked={autoSearch} onCheckedChange={setAutoSearch} /> Auto-discover wineries as you explore </Label>
            </div>
            <div className="h-12">
              {searchState.hitApiLimit && (<Alert variant="default" className="bg-yellow-50 border-yellow-200"> <Info className="h-4 w-4 text-yellow-700" /> <AlertDescription className="text-yellow-800"> Map results are limited. Zoom in for more wineries. </AlertDescription> </Alert>)}
            </div>
            <div className="flex items-center justify-between">
                <Badge variant="secondary">{searchState.isSearching ? 'Searching...' : `${searchState.results.length} wineries in view`}</Badge>
                {searchState.results.length > 0 && <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'CLEAR_RESULTS' })}><RotateCcw className="mr-2 w-4 h-4" /> Clear</Button>}
            </div>
        </CardContent>
    </Card>
));
SearchUI.displayName = 'SearchUI';

const ResultsUI = memo(({ searchState, onOpenModal, onMapClick }: { searchState: SearchState, onOpenModal: (winery: Winery) => void, onMapClick: (e: google.maps.MapMouseEvent) => void }) => (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
            <Card> <CardContent className="p-0 relative"> <MapComponent searchResults={searchState.results} onMarkerClick={onOpenModal} onMapClick={onMapClick} /> </CardContent> </Card>
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
                        {searchState.results.length === 0 && !searchState.isSearching && (<p className="text-sm text-muted-foreground text-center pt-10">No wineries found in this area.</p>)}
                        {searchState.results.map(winery => (
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

// --- Main Logic Component ---
function WineryMapLogic({ userId }: WineryMapProps) {
  const [searchState, dispatch] = useReducer(searchReducer, initialState);
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null);
  const [searchLocation, setSearchLocation] = useState("Finger Lakes, NY");
  const [autoSearch, setAutoSearch] = useState(true);
  const [allUserVisits, setAllUserVisits] = useState<Visit[]>([]);
  const { toast } = useToast();
  
  const [proposedWinery, setProposedWinery] = useState<Winery | null>(null);
  
  const searchFnRef = useRef<((locationText?: string, bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral) => Promise<void>) | null>(null);
  const initialSearchFired = useRef(false);

  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  const map = useMap();

  useEffect(() => { if (places && geocoding) { setGeocoder(new geocoding.Geocoder()); } }, [places, geocoding]);

  const fetchUserVisits = useCallback(async () => {
    try {
      const response = await fetch('/api/visits');
      if (response.ok) { setAllUserVisits(await response.json()); }
    } catch (error) { console.error("Failed to fetch user visits:", error); }
  }, []);
  useEffect(() => { fetchUserVisits(); }, [fetchUserVisits]);

  const getVisitedWineryIds = useCallback(() => new Set(allUserVisits.map(v => v.winery_id)), [allUserVisits]);
  
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

    const request = { textQuery: "winery OR vineyard OR tasting room", fields: ["displayName", "location", "formattedAddress", "rating", "id", "websiteURI", "nationalPhoneNumber"], locationRestriction: searchBounds };
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
        if (!map) return;
        if (!initialSearchFired.current) { initialSearchFired.current = true; searchFnRef.current?.("Finger Lakes, NY"); }
        const idleListener = map.addListener('idle', () => {
            if (autoSearch && initialSearchFired.current) { const bounds = map.getBounds(); if (bounds) { searchFnRef.current?.(undefined, bounds); } }
        });
        return () => { google.maps.event.removeListener(idleListener); };
    }, [map, autoSearch]);

  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (!e.latLng || !geocoder || !places) return;

    // Find the nearest place to the click
    const { results } = await geocoder.geocode({ location: e.latLng });
    if (results && results[0] && results[0].place_id) {
        const placeDetails = new places.Place({ id: results[0].place_id });
        await placeDetails.fetchFields({ fields: ["displayName", "location", "formattedAddress", "rating", "id", "websiteURI", "nationalPhoneNumber"]});
        
        if (placeDetails.location) {
            const newWinery: Winery = {
                id: placeDetails.id!, name: placeDetails.displayName!, address: placeDetails.formattedAddress!, 
                lat: placeDetails.location.lat(), lng: placeDetails.location.lng(), rating: placeDetails.rating,
                website: placeDetails.websiteURI, phone: placeDetails.nationalPhoneNumber,
                userVisited: getVisitedWineryIds().has(placeDetails.id!)
            };
            setProposedWinery(newWinery);
        }
    } else {
        toast({ variant: "destructive", description: "Could not find a location at that point." });
    }
  }, [geocoder, places, getVisitedWineryIds, toast]);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); if (searchLocation.trim()) { executeSearch(searchLocation.trim()); } };
  const handleManualSearchArea = () => { const bounds = map?.getBounds(); if (bounds) { executeSearch(undefined, bounds); } };
  const handleOpenModal = (winery: Winery) => { const wineryVisits = allUserVisits.filter(v => v.winery_id === winery.id); setSelectedWinery({ ...winery, visits: wineryVisits }); };
  const handleSaveVisit = async (winery: Winery, visitData: Omit<Visit, 'id' | 'winery_id'>) => {
    const response = await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wineryId: winery.id, visitDate: visitData.visit_date, userReview: visitData.user_review, rating: visitData.rating, photos: visitData.photos, }), });
    if (response.ok) { toast({ description: "Visit saved successfully." }); await fetchUserVisits(); setSelectedWinery(null); } else { toast({ variant: "destructive", description: "Failed to save visit." }); }
  };
  const handleDeleteVisit = async (winery: Winery, visitId: string) => {
    const response = await fetch(`/api/visits/${visitId}`, { method: 'DELETE' });
    if (response.ok) { toast({ description: "Visit deleted successfully." }); await fetchUserVisits(); setSelectedWinery(w => w ? {...w, visits: w.visits?.filter(v => v.id !== visitId) } : null); } else { toast({ variant: "destructive", description: "Failed to delete visit." }); }
  };

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
      <ResultsUI searchState={searchState} onOpenModal={handleOpenModal} onMapClick={handleMapClick} />
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

// --- Wrapper Component ---
export default function WineryMapWrapper({ userId }: WineryMapProps) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        return (<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Google Maps API key is not configured.</AlertDescription></Alert>);
    }
    return (<APIProvider apiKey={apiKey} libraries={['places', 'geocoding']}><WineryMapLogic userId={userId} /></APIProvider>);
}