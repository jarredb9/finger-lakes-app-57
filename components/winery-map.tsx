"use client"

import React, { useEffect, useState, useCallback, useRef, memo, useReducer, useMemo } from "react"
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
  ListPlus,
  Check
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useToast } from "@/hooks/use-toast"
import { Winery, Visit } from "@/lib/types"
import { Skeleton } from "@/components/ui/skeleton"
import WineryClusterer from "./winery-clusterer"

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

const MapComponent = memo(({ wineries, allVisited, filter, onMarkerClick }: { wineries: Winery[], allVisited: Winery[], filter: string, onMarkerClick: (winery: Winery) => void }) => {
    return (
        <div className="h-[50vh] w-full lg:h-[600px] bg-muted">
            <Map defaultCenter={{ lat: 40, lng: -98 }} defaultZoom={4} gestureHandling={'greedy'} disableDefaultUI={true} mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID} clickableIcons={true}>
                {(filter === 'all' || filter === 'notVisited' || filter === 'wantToGo') && wineries.map(winery => {
                    if (winery.userVisited) return null; // Handled by clusterer
                    const pinProps = {
                        background: winery.onWishlist ? '#9333ea' : '#3B82F6', // Purple for wishlist
                        borderColor: winery.onWishlist ? '#7e22ce' : '#2563EB',
                        glyph: winery.onWishlist ? <ListPlus size={14} /> : undefined,
                        glyphColor: "#fff",
                    };
                    return (
                        <AdvancedMarker key={winery.id} position={{lat: winery.lat, lng: winery.lng}} onClick={() => onMarkerClick(winery)}>
                            <div className="animate-pop-in">
                                <Pin {...pinProps} />
                            </div>
                        </AdvancedMarker>
                    )
                })}
                
                {(filter === 'all' || filter === 'visited') && (
                  <WineryClusterer wineries={allVisited} onClick={onMarkerClick} />
                )}
            </Map>
        </div>
    );
});
MapComponent.displayName = 'MapComponent';

const SearchUI = memo(({ searchState, searchLocation, setSearchLocation, autoSearch, setAutoSearch, handleSearchSubmit, handleManualSearchArea, dispatch, filter, setFilter }) => (
    <Card>
        <CardHeader> <CardTitle className="flex items-center gap-2"><Search /> Discover Wineries</CardTitle> <CardDescription>Search for wineries by location, filter your results, or click directly on the map.</CardDescription> </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
                <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                    <Input placeholder="Enter a city or wine region (e.g., Napa Valley)" value={searchLocation} onChange={e => setSearchLocation(e.target.value)} aria-label="Search Location"/>
                    <Button type="submit" disabled={searchState.isSearching} aria-label="Search"> {searchState.isSearching ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />} <span className="ml-2">Search</span> </Button>
                </form>
                <Button variant="outline" onClick={handleManualSearchArea} disabled={searchState.isSearching} aria-label="Search This Area"> <MapPin className="mr-2 w-4 h-4" /> Search This Area </Button>
            </div>
            <div className="flex items-center justify-between">
                <ToggleGroup type="single" value={filter} onValueChange={(value) => value && setFilter(value)} aria-label="Filter wineries">
                    <ToggleGroupItem value="all" aria-label="All">All</ToggleGroupItem>
                    <ToggleGroupItem value="visited" aria-label="Visited">Visited</ToggleGroupItem>
                    <ToggleGroupItem value="wantToGo" aria-label="Want to Go">Want to Go</ToggleGroupItem>
                    <ToggleGroupItem value="notVisited" aria-label="Discovered">Discovered</ToggleGroupItem>
                </ToggleGroup>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50/50 rounded-lg border border-blue-200">
                <Label htmlFor="auto-search" className="flex items-center gap-2 text-sm font-medium cursor-pointer"> <Switch id="auto-search" checked={autoSearch} onCheckedChange={setAutoSearch} aria-label="Auto-discover wineries as you explore" /> Auto-discover as you explore the map </Label>
            </div>
        </CardContent>
    </Card>
));
SearchUI.displayName = 'SearchUI';

const ResultsUI = memo(({ wineries, onOpenModal, isSearching, filter, allVisited, searchResults }: { wineries: Winery[], onOpenModal: (winery: Winery) => void, isSearching: boolean, filter: string, allVisited: Winery[], searchResults: Winery[] }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
                <Card> <CardContent className="p-0 relative"> 
                    <MapComponent wineries={searchResults} allVisited={allVisited} filter={filter} onMarkerClick={onOpenModal} /> 
                </CardContent> </Card>
            </div>
            <div className="space-y-4">
                <Card>
                    <CardHeader><CardTitle>Legend</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex items-center gap-2"> <div className="w-4 h-4 rounded-full bg-[#10B981] border-2 border-[#059669]" /> <span className="text-sm">Visited</span> </div>
                        <div className="flex items-center gap-2"> <div className="w-4 h-4 rounded-full bg-[#9333ea] border-2 border-[#7e22ce]" /> <span className="text-sm">Want to Go</span> </div>
                        <div className="flex items-center gap-2"> <div className="w-4 h-4 rounded-full bg-[#3B82F6] border-2 border-[#2563EB]" /> <span className="text-sm">Discovered</span> </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex justify-between items-center">Results In View <Badge>{wineries.length}</Badge></CardTitle></CardHeader>
                    <CardContent className="relative">
                        {isSearching && (<div className="absolute inset-0 bg-white/70 dark:bg-zinc-900/70 flex items-center justify-center rounded-b-lg z-10"><Loader2 className="animate-spin text-muted-foreground h-8 w-8" /></div>)}
                        <div className="space-y-2 max-h-[450px] min-h-[400px] overflow-y-auto data-[loaded=true]:animate-in data-[loaded=true]:fade-in-50" data-loaded={!isSearching}>
                            {wineries.length === 0 && !isSearching && (
                              <div className="text-center pt-10 text-muted-foreground">
                                <Wine className="mx-auto h-12 w-12" />
                                <p className="mt-4 text-sm">No wineries found.</p>
                                <p className="text-xs">Try searching or adjusting your filter.</p>
                              </div>
                            )}
                            {!isSearching && wineries.map(winery => (
                                <div key={winery.id} className="p-3 border rounded-lg cursor-pointer hover:bg-muted hover:shadow-md hover:scale-[1.02] transition-all duration-200" onClick={() => onOpenModal(winery)}>
                                    <p className="font-medium text-sm">{winery.name}</p>
                                    <p className="text-xs text-muted-foreground">{winery.address}</p>
                                    {winery.rating && <p className="text-xs text-muted-foreground mt-1">★ {winery.rating}/5.0</p>}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
});
ResultsUI.displayName = 'ResultsUI';

function useWineries() {
  const [allUserVisits, setAllUserVisits] = useState<any[]>([]);
  const [wishlistIds, setWishlistIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const fetchWishlist = useCallback(async () => {
    try {
        const response = await fetch('/api/wishlist');
        if (response.ok) {
            const items = await response.json();
            setWishlistIds(new Set(items.map((item: any) => item.winery_id)));
        }
    } catch (error) { console.error("Failed to fetch wishlist", error); }
  }, []);

  const fetchUserVisits = useCallback(async () => {
    try {
      const response = await fetch('/api/visits');
      if (response.ok) setAllUserVisits(await response.json());
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not fetch your visits." });
    }
  }, [toast]);

  useEffect(() => {
    fetchUserVisits();
    fetchWishlist();
  }, [fetchUserVisits, fetchWishlist]);
  
  const allVisitedWineries = useMemo(() => {
    if (!allUserVisits) return [];
    return allUserVisits.map(visit => {
      if (!visit.wineries) return null;
      return {
        id: visit.wineries.google_place_id,
        dbId: visit.wineries.id,
        name: visit.wineries.name,
        address: visit.wineries.address,
        lat: parseFloat(visit.wineries.latitude),
        lng: parseFloat(visit.wineries.longitude),
        userVisited: true,
        onWishlist: wishlistIds.has(visit.wineries.id),
        visits: [{...visit}]
      }
    }).filter(Boolean);
  }, [allUserVisits, wishlistIds])

  return { fetchUserVisits, allVisitedWineries, wishlistIds, fetchWishlist };
}

function WineryMapLogic({ userId }: WineryMapProps) {
  const [searchState, dispatch] = useReducer(searchReducer, initialState);
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null);
  const [searchLocation, setSearchLocation] = useState("");
  const [autoSearch, setAutoSearch] = useState(true);
  const [filter, setFilter] = useState('all');
  const { fetchUserVisits, allVisitedWineries, wishlistIds, fetchWishlist } = useWineries();
  const { toast } = useToast();
  
  const [proposedWinery, setProposedWinery] = useState<Winery | null>(null);
  
  const searchFnRef = useRef<((locationText?: string, bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral) => Promise<void>) | null>(null);
  
  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const map = useMap();

  useEffect(() => {
    if (geocoding) setGeocoder(new geocoding.Geocoder());
  }, [geocoding]);

  useEffect(() => {
    const visitedPlaceIds = new Set(allVisitedWineries.map((v: Winery) => v.id));
    const updatedResults = searchState.results.map(winery => {
        const visitedWinery = allVisitedWineries.find(v => v.id === winery.id);
        return {
            ...winery,
            userVisited: visitedPlaceIds.has(winery.id),
            onWishlist: wishlistIds.has(visitedWinery?.dbId!),
            dbId: visitedWinery?.dbId
        }
    });

    if (JSON.stringify(updatedResults) !== JSON.stringify(searchState.results)) {
        dispatch({ type: 'UPDATE_RESULTS', payload: updatedResults });
    }
  }, [allVisitedWineries, searchState.results, wishlistIds]);

  const filteredListWineries = useMemo(() => {
    const inViewWineries = searchState.results;
    switch (filter) {
        case 'visited': return inViewWineries.filter(w => w.userVisited);
        case 'wantToGo': return inViewWineries.filter(w => w.onWishlist);
        case 'notVisited': return inViewWineries.filter(w => !w.userVisited && !w.onWishlist);
        case 'all':
        default: return inViewWineries;
    }
  }, [filter, searchState.results]);
  
  const getVisitedWineryIds = useCallback(() => new Set(allVisitedWineries.map(v => v.id)), [allVisitedWineries]);
  
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
    const idleListener = map.addListener('idle', () => {
        if (autoSearch) { 
            const bounds = map.getBounds(); 
            if (bounds) searchFnRef.current?.(undefined, bounds); 
        }
    });
    return () => { google.maps.event.removeListener(idleListener); };
  }, [map, geocoder, autoSearch]);

  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (!places || !geocoder || !e.latLng) return;
    let placeId: string | undefined | null = e.placeId;
    if (placeId) e.stop();
    else {
      const { results } = await geocoder.geocode({ location: e.latLng });
      if (results && results[0]) placeId = results[0].place_id;
    }
    if (!placeId) {
      toast({ variant: "destructive", description: "Could not identify a location at that point." });
      return;
    }
    try {
        const placeDetails = new places.Place({ id: placeId });
        await placeDetails.fetchFields({ fields: ["displayName", "formattedAddress", "websiteURI", "nationalPhoneNumber", "location"]});
        if (!placeDetails.location) {
            toast({ variant: "destructive", description: "Could not get details for this location." }); return;
        }
        const newWinery: Winery = {
            id: placeId, name: placeDetails.displayName || "Unnamed Location", address: placeDetails.formattedAddress || 'N/A',
            lat: placeDetails.location.lat(), lng: placeDetails.location.lng(), website: placeDetails.websiteURI, phone: placeDetails.nationalPhoneNumber,
            userVisited: getVisitedWineryIds().has(placeId)
        };
        setProposedWinery(newWinery);
    } catch (error) {
        toast({ variant: "destructive", description: "An error occurred while fetching location details." });
    }
  }, [places, geocoder, getVisitedWineryIds, toast]);

  useEffect(() => {
    if (!map) return;
    const clickListener = map.addListener('click', handleMapClick);
    return () => { clickListener.remove(); };
  }, [map, handleMapClick]);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); if (searchLocation.trim()) { executeSearch(searchLocation.trim()); } };
  const handleManualSearchArea = () => { const bounds = map?.getBounds(); if (bounds) { executeSearch(undefined, bounds); } };
  
  const handleOpenModal = useCallback((winery: Winery) => {
    const fullWineryData = allVisitedWineries.find(v => v.id === winery.id);
    setSelectedWinery({ ...winery, ...fullWineryData, visits: fullWineryData?.visits || [] });
  }, [allVisitedWineries]);
  
  const handleSaveVisit = async (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: string[] }) => {
    const payload = { wineryData: winery, ...visitData };
    const response = await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
      setSelectedWinery(null);
    } else { 
      toast({ variant: "destructive", description: "Failed to delete visit." }); 
    }
  };

  const handleToggleWishlist = async (winery: Winery, isOnWishlist: boolean) => {
    const method = isOnWishlist ? 'DELETE' : 'POST';

    if (isOnWishlist && !winery.dbId) {
      toast({ variant: 'destructive', description: "Cannot remove from wishlist as it's not in the database." });
      return;
    }

    try {
      const body = isOnWishlist
        ? JSON.stringify({ dbId: winery.dbId })
        : JSON.stringify({ wineryData: winery });

      const response = await fetch('/api/wishlist', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body
      });

      if (response.ok) {
        toast({ description: isOnWishlist ? "Removed from wishlist." : "Added to wishlist." });
        await fetchWishlist();
        if (!isOnWishlist) {
          // If we added a winery, we need to get its new dbId
          await fetchUserVisits();
        }
        setSelectedWinery(prev => prev ? { ...prev, onWishlist: !isOnWishlist } : null);
      } else {
        throw new Error("Failed to update wishlist");
      }
    } catch (error) {
      toast({ variant: 'destructive', description: "Could not update wishlist." });
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
      <SearchUI searchState={searchState} searchLocation={searchLocation} setSearchLocation={setSearchLocation} autoSearch={autoSearch} setAutoSearch={setAutoSearch} handleSearchSubmit={handleSearchSubmit} handleManualSearchArea={handleManualSearchArea} dispatch={dispatch} filter={filter} setFilter={setFilter} />
      <ResultsUI wineries={filteredListWineries} onOpenModal={handleOpenModal} isSearching={searchState.isSearching} filter={filter} allVisited={allVisitedWineries} searchResults={searchState.results} />
      {selectedWinery && (<WineryModal 
        winery={selectedWinery} 
        onClose={() => setSelectedWinery(null)} 
        onSaveVisit={handleSaveVisit} 
        onDeleteVisit={handleDeleteVisit} 
        onToggleWishlist={handleToggleWishlist}
      />)}
      {proposedWinery && (
        <AlertDialog open={!!proposedWinery} onOpenChange={() => setProposedWinery(null)}>
            <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Add this location?</AlertDialogTitle>
                    <AlertDialogDescription> Do you want to add a visit for the following location?
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
                    <AlertDialogAction onClick={() => { handleOpenModal(proposedWinery); setProposedWinery(null); }}>Add Visit</AlertDialogAction>
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
    return (<APIProvider apiKey={apiKey} libraries={['places', 'geocoding', 'marker']}><WineryMapLogic userId={userId} /></APIProvider>);
}