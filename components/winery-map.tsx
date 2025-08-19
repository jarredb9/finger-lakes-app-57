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
  ListPlus
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

// A new component to contain all logic that needs access to the map instance
const MapLogic = ({
  autoSearch,
  executeSearch,
  handleMapClick
}: {
  autoSearch: boolean,
  executeSearch: Function,
  handleMapClick: Function
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    console.log('[LOG] Map instance is available. Adding listeners.');
    const idleListener = map.addListener('idle', () => {
        if (autoSearch) {
            console.log('[LOG] Map idle, triggering auto-search.');
            const bounds = map.getBounds();
            if (bounds) executeSearch(undefined, bounds);
        }
    });
    const clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => handleMapClick(e));

    return () => {
      console.log('[LOG] Cleaning up map listeners.');
      idleListener.remove();
      clickListener.remove();
    };
  }, [map, autoSearch, executeSearch, handleMapClick]);

  return null; // This component does not render anything itself
}


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

const MapComponent = memo(({ wineries, allVisited, filter, onMarkerClick, autoSearch, executeSearch, handleMapClick }: { wineries: Winery[], allVisited: Winery[], filter: string, onMarkerClick: (winery: Winery) => void, autoSearch: boolean, executeSearch: Function, handleMapClick: Function }) => {
    console.log('[LOG] Rendering MapComponent');
    return (
        <div className="h-[50vh] w-full lg:h-[600px] bg-muted">
            <Map defaultCenter={{ lat: 40, lng: -98 }} defaultZoom={4} gestureHandling={'greedy'} disableDefaultUI={true} mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID} clickableIcons={true}>
                <MapLogic autoSearch={autoSearch} executeSearch={executeSearch} handleMapClick={handleMapClick} />
                {(filter === 'all' || filter === 'notVisited' || filter === 'wantToGo') && wineries.map(winery => {
                    if (winery.userVisited) return null;
                    const pinProps = {
                        background: winery.onWishlist ? '#9333ea' : '#3B82F6',
                        borderColor: winery.onWishlist ? '#7e22ce' : '#2563EB',
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

const ResultsUI = memo(({ wineries, onOpenModal, isSearching, filter, allVisited, searchResults, autoSearch, executeSearch, handleMapClick }: { wineries: Winery[], onOpenModal: (winery: Winery) => void, isSearching: boolean, filter: string, allVisited: Winery[], searchResults: Winery[], autoSearch: boolean, executeSearch: Function, handleMapClick: Function }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
                <Card> <CardContent className="p-0 relative">
                    <MapComponent wineries={searchResults} allVisited={allVisited} filter={filter} onMarkerClick={onOpenModal} autoSearch={autoSearch} executeSearch={executeSearch} handleMapClick={handleMapClick} />
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
  const [allUserVisits, setAllUserVisits] = useState<Visit[]>([]);
  const [wishlist, setWishlist] = useState<{winery_id: number, google_place_id: string}[]>([]);
  const { toast } = useToast();

  const fetchWishlist = useCallback(async () => {
    try {
        const response = await fetch('/api/wishlist');
        if (response.ok) setWishlist(await response.json());
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
    return allUserVisits
      .map(visit => {
        if (!visit.wineries) return null;
        return {
          id: visit.wineries.google_place_id,
          dbId: visit.wineries.id,
          name: visit.wineries.name,
          address: visit.wineries.address,
          lat: parseFloat(visit.wineries.latitude),
          lng: parseFloat(visit.wineries.longitude),
          userVisited: true,
          visits: allUserVisits.filter(v => v.wineries.id === visit.wineries.id)
        };
      })
      .filter((v, i, a) => v && a.findIndex(t => t?.dbId === v?.dbId) === i);
  }, [allUserVisits]);

  return { fetchUserVisits, allVisitedWineries, wishlist, fetchWishlist };
}

function WineryMapContainer({ userId }: WineryMapProps) {
  console.log('[LOG] WineryMapContainer component mounting.');
  const [searchState, dispatch] = useReducer(searchReducer, initialState);
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null);
  const [searchLocation, setSearchLocation] = useState("");
  const [autoSearch, setAutoSearch] = useState(true);
  const [filter, setFilter] = useState('all');
  const { fetchUserVisits, allVisitedWineries, wishlist, fetchWishlist } = useWineries();
  const { toast } = useToast();

  const [proposedWinery, setProposedWinery] = useState<Winery | null>(null);

  console.log('[LOG] Calling useMapsLibrary hooks...');
  const maps = useMapsLibrary('maps');
  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  const [librariesLoaded, setLibrariesLoaded] = useState(false);
  console.log('[LOG] useMapsLibrary hooks called.');

  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  
  useEffect(() => {
    const checkLibraries = () => {
      const allLoaded = !!(maps && places && geocoding);
      console.log(`[LOG] Checking library status: Maps=${!!maps}, Places=${!!places}, Geocoding=${!!geocoding}. All Loaded: ${allLoaded}`);
      if (allLoaded) {
        console.log('[LOG] All libraries are now available.');
        if (!geocoderRef.current) {
          console.log('[LOG] Creating Geocoder instance.');
          geocoderRef.current = new geocoding.Geocoder();
        }
        setLibrariesLoaded(true);
      }
    };
    checkLibraries();
  }, [maps, places, geocoding]);

  useEffect(() => {
    const visitedPlaceIds = new Set(allVisitedWineries.map((v: Winery) => v.id));
    const wishlistPlaceIds = new Set(wishlist.map(w => w.google_place_id));
    const wishlistDbIdMap = new Map(wishlist.map(w => [w.google_place_id, w.winery_id]));

    const updatedResults = searchState.results.map(winery => ({
      ...winery,
      userVisited: visitedPlaceIds.has(winery.id),
      onWishlist: wishlistPlaceIds.has(winery.id),
      dbId: winery.dbId || wishlistDbIdMap.get(winery.id)
    }));

    if (JSON.stringify(updatedResults) !== JSON.stringify(searchState.results)) {
        dispatch({ type: 'UPDATE_RESULTS', payload: updatedResults });
    }
  }, [allVisitedWineries, searchState.results, wishlist]);

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
    console.log('[LOG] executeSearch called.');
    if (!librariesLoaded || !places || !geocoderRef.current || !maps) {
      console.error('[ERROR] executeSearch aborted: Libraries not ready.', { librariesLoaded, places, geocoder: geocoderRef.current, maps });
      return;
    }
    dispatch({ type: 'SEARCH_START' });

    try {
        let searchBounds: google.maps.LatLngBounds;
        if (locationText) {
            console.log(`[LOG] Geocoding location: "${locationText}"`);
            const { results } = await geocoderRef.current.geocode({ address: locationText });
            if (results && results.length > 0 && results[0].geometry.viewport) { searchBounds = results[0].geometry.viewport; /* map?.fitBounds(searchBounds); */ } // Map instance not available here
            else { toast({ variant: "destructive", description: "Could not find that location." }); dispatch({ type: 'SEARCH_ERROR' }); return; }
        } else if (bounds) {
            console.log('[LOG] Creating LatLngBounds from provided bounds.');
            searchBounds = new maps.LatLngBounds(bounds);
            console.log('[LOG] LatLngBounds created successfully.');
        }
        else { dispatch({ type: 'SEARCH_ERROR' }); return; }

        const request = { textQuery: "winery OR vineyard OR tasting room OR cellars", fields: ["displayName", "location", "formattedAddress", "rating", "id", "websiteURI", "nationalPhoneNumber"], locationRestriction: searchBounds };
        console.log('[LOG] Performing Google Places search with request:', request);
        const { places: foundPlaces } = await places.Place.searchByText(request);
        const visitedIds = getVisitedWineryIds();
        const wishlistPlaceIds = new Set(wishlist.map(w => w.google_place_id));
        const wishlistDbIdMap = new Map(wishlist.map(w => [w.google_place_id, w.winery_id]));

        const wineries: Winery[] = foundPlaces.map(place => {
            const googlePlaceId = place.id!;
            return {
                id: googlePlaceId,
                dbId: wishlistDbIdMap.get(googlePlaceId),
                name: place.displayName!, address: place.formattedAddress!, lat: place.location!.lat(), lng: place.location!.lng(),
                rating: place.rating, website: place.websiteURI, phone: place.nationalPhoneNumber,
                userVisited: visitedIds.has(googlePlaceId),
                onWishlist: wishlistPlaceIds.has(googlePlaceId),
            }
        });
        dispatch({ type: 'SEARCH_SUCCESS', payload: wineries });
        console.log('[LOG] Search successful, found wineries:', wineries);
    } catch (error) {
        console.error("[CRITICAL] An error occurred inside executeSearch's try block:", error);
        dispatch({ type: 'SEARCH_ERROR' });
    }
  }, [librariesLoaded, places, getVisitedWineryIds, toast, wishlist, maps]);

  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (!librariesLoaded || !places || !geocoderRef.current || !e.latLng) return;
    let placeId: string | undefined | null = e.placeId;
    if (placeId) e.stop();
    else {
      const { results } = await geocoderRef.current.geocode({ location: e.latLng });
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
  }, [librariesLoaded, places, getVisitedWineryIds, toast]);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); if (searchLocation.trim()) { executeSearch(searchLocation.trim()); } };
  const handleManualSearchArea = () => { console.log("Manual search not implemented in this refactor yet"); };

  const handleOpenModal = useCallback((winery: Winery) => {
    const fullWineryData = allVisitedWineries.find(v => v.id === winery.id);
    const wineryOnWishlist = wishlist.some(w => w.google_place_id === winery.id);
    const dbId = fullWineryData?.dbId || wishlist.find(w => w.google_place_id === winery.id)?.winery_id;
    setSelectedWinery({ ...winery, visits: fullWineryData?.visits || [], onWishlist: wineryOnWishlist, dbId });
  }, [allVisitedWineries, wishlist]);

  const handleSaveVisit = async (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: string[] }) => {
    const payload = { wineryData: winery, ...visitData };
    const response = await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (response.ok) {
        toast({ description: "Visit saved successfully." });
        await Promise.all([fetchUserVisits(), fetchWishlist()]);
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
    const body = isOnWishlist ? JSON.stringify({ dbId: winery.dbId }) : JSON.stringify({ wineryData: winery });
    try {
      const response = await fetch('/api/wishlist', { method, headers: { 'Content-Type': 'application/json' }, body });
      if (response.ok) {
        toast({ description: isOnWishlist ? "Removed from wishlist." : "Added to wishlist." });
        await fetchWishlist();
        setSelectedWinery(prev => prev ? {...prev, onWishlist: !isOnWishlist} : null);
      } else { throw new Error("Failed to update wishlist"); }
    } catch (error) {
      toast({ variant: 'destructive', description: "Could not update wishlist." });
    }
  };


  if (!librariesLoaded) {
    console.log('[LOG] Displaying loading state because librariesLoaded is false.');
    return (
        <div className="flex justify-center items-center h-[600px] w-full">
            <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading map services...</span>
        </div>
    );
  }

  console.log('[LOG] All libraries loaded, rendering main component UI.');
  return (
    <div className="space-y-6">
      <SearchUI searchState={searchState} searchLocation={searchLocation} setSearchLocation={setSearchLocation} autoSearch={autoSearch} setAutoSearch={setAutoSearch} handleSearchSubmit={handleSearchSubmit} handleManualSearchArea={handleManualSearchArea} dispatch={dispatch} filter={filter} setFilter={setFilter} />
      <ResultsUI wineries={filteredListWineries} onOpenModal={handleOpenModal} isSearching={searchState.isSearching} filter={filter} allVisited={allVisitedWineries} searchResults={searchState.results} autoSearch={autoSearch} executeSearch={executeSearch} handleMapClick={handleMapClick}/>
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
    console.log('[LOG] WineryMapWrapper rendering.');
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.error('[CRITICAL] Google Maps API key is missing.');
        return (<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Google Maps API key is not configured.</AlertDescription></Alert>);
    }
    console.log('[LOG] API Key found, rendering APIProvider.');
    return (<APIProvider apiKey={apiKey} libraries={['places', 'geocoding', 'marker', 'maps']}><WineryMapContainer userId={userId} /></APIProvider>);
}