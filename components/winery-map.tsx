"use client"

import React, { useEffect, useState, useCallback, useRef, memo, useReducer, useMemo } from "react"
import dynamic from 'next/dynamic'
import { APIProvider, Map as GoogleMap, useMap, useMapsLibrary } from "@vis.gl/react-google-maps"
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
  Loader2,
  Wine,
  Star
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useToast } from "@/hooks/use-toast"
import { Winery, Visit } from "@/lib/types"
import { useWineryData } from "@/hooks/use-winery-data"
import WineryClusterer from "./winery-clusterer"
import WishlistClusterer from './wishlist-clusterer';
import FavoriteClusterer from "./favorite-clusterer"
import DiscoveredClusterer from "./discovered-clusterer"

const WineryModal = dynamic(() => import('./winery-modal'), {
  loading: () => <div className="fixed inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="h-8 w-8 text-white animate-spin" /></div>,
});

interface WineryMapProps { userId: string; }

interface SearchState { isSearching: boolean; hitApiLimit: boolean; results: Winery[]; }
type SearchAction = | { type: 'SEARCH_START' } | { type: 'SEARCH_SUCCESS'; payload: { places: Winery[], hitLimit: boolean } } | { type: 'SEARCH_ERROR' } | { type: 'CLEAR_RESULTS' } | { type: 'UPDATE_RESULTS'; payload: Winery[] };
const initialState: SearchState = { isSearching: false, hitApiLimit: false, results: [], };

function searchReducer(state: SearchState, action: SearchAction): SearchState {
    switch (action.type) {
        case 'SEARCH_START': return { ...state, isSearching: true, hitApiLimit: false };
        case 'SEARCH_SUCCESS': return { isSearching: false, hitApiLimit: action.payload.hitLimit, results: action.payload.places };
        case 'SEARCH_ERROR': return { ...state, isSearching: false, results: [] };
        case 'CLEAR_RESULTS': return { ...state, results: [] };
        case 'UPDATE_RESULTS': return { ...state, results: action.payload };
        default: return state;
    }
}

const MapComponent = memo(({ trulyDiscoveredWineries, visitedWineries, wishlistWineries, favoriteWineries, filter, onMarkerClick }: { trulyDiscoveredWineries: Winery[], visitedWineries: Winery[], wishlistWineries: Winery[], favoriteWineries: Winery[], filter: string[], onMarkerClick: (winery: Winery) => void }) => {
    return (
        <div className="h-[50vh] w-full lg:h-[600px] bg-muted">
            <GoogleMap defaultCenter={{ lat: 40, lng: -98 }} defaultZoom={4} gestureHandling={'greedy'} disableDefaultUI={true} mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID} clickableIcons={true}>
                
                {(filter.includes('all') || filter.includes('notVisited')) && (
                  <DiscoveredClusterer wineries={trulyDiscoveredWineries} onClick={onMarkerClick} />
                )}

                {(filter.includes('all') || filter.includes('wantToGo')) && (
                  <WishlistClusterer wineries={wishlistWineries} onClick={onMarkerClick} />
                )}
                
                {(filter.includes('all') || filter.includes('visited')) && (
                  <WineryClusterer wineries={visitedWineries} onClick={onMarkerClick} />
                )}

                {(filter.includes('all') || filter.includes('favorites')) && (
                  <FavoriteClusterer wineries={favoriteWineries} onClick={onMarkerClick} />
                )}

            </GoogleMap>
        </div>
    );
});
MapComponent.displayName = 'MapComponent';

const SearchUI = memo(({ searchState, searchLocation, setSearchLocation, autoSearch, setAutoSearch, handleSearchSubmit, handleManualSearchArea, filter, onFilterChange }: any) => (
    <Card>
        <CardHeader> <CardTitle className="flex items-center gap-2"><Search /> Discover Wineries</CardTitle> <CardDescription>Search for wineries by location, filter your results, or click directly on the map.</CardDescription> </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
                <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                    <Input placeholder="Enter a city or wine region (e.g., Napa Valley)" value={searchLocation} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchLocation(e.target.value)} aria-label="Search Location"/>
                    <Button type="submit" disabled={searchState.isSearching} aria-label="Search"> {searchState.isSearching ? <Loader2 className="animate-spin w-4 h-4" /> : <Search className="w-4 h-4" />} <span className="ml-2 hidden sm:inline">Search</span> </Button>
                </form>
                <Button variant="outline" onClick={handleManualSearchArea} disabled={searchState.isSearching} aria-label="Search This Area"> <MapPin className="mr-2 w-4 h-4" /> Search This Area </Button>
            </div>
            {searchState.hitApiLimit && (
                <Alert variant="default" className="bg-yellow-50 border-yellow-200 text-yellow-800">
                    <AlertTriangle className="h-4 w-4 !text-yellow-600" />
                    <AlertDescription>
                        This is a popular area! Zoom in to discover more wineries.
                    </AlertDescription>
                </Alert>
            )}
            <div className="flex items-center justify-between">
                <ToggleGroup type="multiple" value={filter} onValueChange={onFilterChange} aria-label="Filter wineries" className="flex-wrap justify-start">
                    <ToggleGroupItem value="all" aria-label="All">All</ToggleGroupItem>
                    <ToggleGroupItem value="visited" aria-label="Visited">Visited</ToggleGroupItem>
                    <ToggleGroupItem value="favorites" aria-label="Favorites">Favorites</ToggleGroupItem>
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

function WineryMapLogic({ userId }: { userId: string }) {
  const [searchState, dispatch] = useReducer(searchReducer, initialState);
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null);
  const [searchLocation, setSearchLocation] = useState("");
  const [autoSearch, setAutoSearch] = useState(true);
  const [filter, setFilter] = useState<string[]>(['all']);
  const [mapBounds, setMapBounds] = useState<google.maps.LatLngBounds | null>(null);
  
  const { allVisitedWineries, allWishlistWineries, allFavoriteWineries, allPersistentWineries, refreshAllData } = useWineryData();
  
  const { toast } = useToast();
  
  const [proposedWinery, setProposedWinery] = useState<Winery | null>(null);
  const searchFnRef = useRef<((locationText?: string, bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral) => Promise<void>) | null>(null);
  
  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
  const map = useMap();
  
  useEffect(() => { if (geocoding) setGeocoder(new geocoding.Geocoder()); }, [geocoding]);

  const { favoriteIds, wishlistIds, visitedIds } = useMemo(() => {
    const favoriteIds = new Set(allFavoriteWineries.map(w => w.id));
    const wishlistIds = new Set(allWishlistWineries.map(w => w.id));
    const visitedIds = new Set(allVisitedWineries.map(w => w.id));
    return { favoriteIds, wishlistIds, visitedIds };
  }, [allFavoriteWineries, allWishlistWineries, allVisitedWineries]);

  const favoritesToRender = allFavoriteWineries;
  const wishlistToRender = allWishlistWineries.filter(w => !favoriteIds.has(w.id));
  const visitedToRender = allVisitedWineries.filter(w => !favoriteIds.has(w.id) && !wishlistIds.has(w.id));
  
  const trulyDiscoveredWineries = useMemo(() => {
      const persistentIds = new Set(allPersistentWineries.map(w => w.id));
      return searchState.results.filter(w => !persistentIds.has(w.id));
  }, [searchState.results, allPersistentWineries]);

  const listResultsInView = useMemo(() => {
    if (!mapBounds) return [];
    
    const wineriesInView = [...allPersistentWineries, ...trulyDiscoveredWineries].filter(w => mapBounds.contains({ lat: w.lat, lng: w.lng }));

    if (filter.includes('all')) return wineriesInView;
    
    return wineriesInView.filter(w => {
        if (filter.includes('visited') && visitedIds.has(w.id)) return true;
        if (filter.includes('favorites') && favoriteIds.has(w.id)) return true;
        if (filter.includes('wantToGo') && wishlistIds.has(w.id)) return true;
        if (filter.includes('notVisited') && !visitedIds.has(w.id) && !favoriteIds.has(w.id) && !wishlistIds.has(w.id)) return true;
        return false;
    });
  }, [filter, allPersistentWineries, trulyDiscoveredWineries, mapBounds, visitedIds, favoriteIds, wishlistIds]);
  
  const executeSearch = useCallback(async (locationText?: string, bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral) => {
    if (!places || !geocoder) return;
    dispatch({ type: 'SEARCH_START' });

    let searchBounds: google.maps.LatLngBounds;
    if (locationText) {
        try {
            const { results } = await geocoder.geocode({ address: locationText });
            if (results && results.length > 0 && results[0].geometry.viewport) {
                searchBounds = results[0].geometry.viewport;
                map?.fitBounds(searchBounds);
            } else {
                toast({ variant: "destructive", description: "Could not find that location." });
                dispatch({ type: 'SEARCH_ERROR' });
                return;
            }
        } catch (error) { console.error("Geocoding failed:", error); dispatch({ type: 'SEARCH_ERROR' }); return; }
    } else if (bounds) {
        searchBounds = new google.maps.LatLngBounds(bounds);
    } else {
        dispatch({ type: 'SEARCH_ERROR' });
        return;
    }

    const searchTerms = ["winery", "vineyard", "tasting room"];
    const allFoundPlaces = new Map<string, any>();
    let hitApiLimit = false;

    for (const term of searchTerms) {
        const request = {
            textQuery: term,
            fields: ["displayName", "location", "formattedAddress", "rating", "id", "websiteURI", "nationalPhoneNumber"],
            locationRestriction: searchBounds,
        };
        
        try {
            const { places: foundPlaces } = await google.maps.places.Place.searchByText(request);
            if (foundPlaces.length === 20) {
                hitApiLimit = true;
            }
            foundPlaces.forEach(place => {
                if (place.id) {
                    allFoundPlaces.set(place.id, place);
                }
            });
        } catch (error) {
            console.error(`Google Places search error for term "${term}":`, error);
        }
    }

    const wineries = Array.from(allFoundPlaces.values()).map(place => ({
        id: place.id!, name: place.displayName!, address: place.formattedAddress!, lat: place.location!.lat(), lng: place.location!.lng(),
        rating: place.rating, website: place.websiteURI, phone: place.nationalPhoneNumber,
    }));
    
    dispatch({ type: 'SEARCH_SUCCESS', payload: { places: wineries, hitLimit: hitApiLimit } });
  }, [map, places, geocoder, toast]);

  useEffect(() => { searchFnRef.current = executeSearch; });
    
  useEffect(() => {
    if (!map) return;
    const idleListener = map.addListener('idle', () => {
        const bounds = map.getBounds();
        if (bounds) {
            setMapBounds(bounds);
            if (autoSearch) {
                searchFnRef.current?.(undefined, bounds);
            }
        }
    });
    return () => { google.maps.event.removeListener(idleListener); };
  }, [map, autoSearch]);

  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (!places || !geocoder || !e.latLng || !e.placeId) return;
    e.stop();
    const isKnown = allPersistentWineries.some(w => w.id === e.placeId);
    if (isKnown) return;

    try {
        const placeDetails = new places.Place({ id: e.placeId });
        await placeDetails.fetchFields({ fields: ["displayName", "formattedAddress", "websiteURI", "nationalPhoneNumber", "location"]});
        if (!placeDetails.location) {
            toast({ variant: "destructive", description: "Could not get details for this location." }); return;
        }
        const newWinery: Winery = {
            id: e.placeId, 
            name: placeDetails.displayName || "Unnamed Location", 
            address: placeDetails.formattedAddress || 'N/A',
            lat: placeDetails.location.lat(), 
            lng: placeDetails.location.lng(), 
            website: placeDetails.websiteURI, 
            phone: placeDetails.nationalPhoneNumber,
        };
        setProposedWinery(newWinery);
    } catch (error) {
        toast({ variant: "destructive", description: "An error occurred while fetching location details." });
    }
  }, [places, geocoder, toast, allPersistentWineries]);

  useEffect(() => {
    if (!map) return;
    const clickListener = map.addListener('click', handleMapClick);
    return () => { clickListener.remove(); };
  }, [map, handleMapClick]);
  
  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); if (searchLocation.trim()) { executeSearch(searchLocation.trim()); } };
  const handleManualSearchArea = () => { const bounds = map?.getBounds(); if (bounds) { executeSearch(undefined, bounds); } };

  const handleOpenModal = useCallback((winery: Winery) => {
    const fullData = allPersistentWineries.find(p => p.id === winery.id);
    setSelectedWinery({ ...winery, ...fullData });
  }, [allPersistentWineries]);
  
  const handleSaveVisit = async (winery: Winery, visitData: { visit_date: string; user_review: string; rating: number; photos: string[] }) => {
    const payload = { wineryData: winery, ...visitData };
    const response = await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (response.ok) { 
        toast({ description: "Visit saved successfully." }); 
        await refreshAllData();
        setSelectedWinery(null); 
    } else { 
        const errorData = await response.json();
        toast({ variant: "destructive", description: `Failed to save visit: ${errorData.details || errorData.error}` }); 
    }
  };

  const handleUpdateVisit = async (visitId: string, visitData: { visit_date: string; user_review: string; rating: number; }) => {
    const response = await fetch(`/api/visits/${visitId}`, { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(visitData) 
    });
    if (response.ok) { 
        toast({ description: "Visit updated successfully." }); 
        await refreshAllData();
        setSelectedWinery(null); 
    } else { 
        toast({ variant: "destructive", description: "Failed to update visit." }); 
    }
  };
  
  const handleDeleteVisit = async (winery: Winery, visitId: string) => {
    const response = await fetch(`/api/visits/${visitId}`, { method: 'DELETE' });
    if (response.ok) { 
      toast({ description: "Visit deleted successfully." }); 
      await refreshAllData();
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
        await refreshAllData();
        setSelectedWinery(prev => prev ? { ...prev, onWishlist: !isOnWishlist } : null);
      } else throw new Error();
    } catch (error) { toast({ variant: 'destructive', description: "Could not update wishlist." }); }
  };
  
  const handleToggleFavorite = async (winery: Winery, isFavorite: boolean) => {
      const method = isFavorite ? 'DELETE' : 'POST';
      const body = isFavorite ? JSON.stringify({ dbId: winery.dbId }) : JSON.stringify({ wineryData: winery });
      try {
        const response = await fetch('/api/favorites', { method, headers: { 'Content-Type': 'application/json' }, body });
        if (response.ok) {
          toast({ description: isFavorite ? "Removed from favorites." : "Added to favorites." });
          await refreshAllData();
          setSelectedWinery(prev => prev ? { ...prev, isFavorite: !isFavorite } : null);
        } else throw new Error();
      } catch (error) { toast({ variant: 'destructive', description: "Could not update favorites." }); }
    };
    
  const handleFilterChange = (newFilter: string[]) => {
      if (newFilter.length === 0) {
        setFilter(['all']);
        return;
      }
      if (newFilter.length > 1 && newFilter.includes('all')) {
        if(filter.includes('all')) {
            setFilter(newFilter.filter(f => f !== 'all'));
            return;
        }
        else {
            setFilter(['all']);
            return;
        }
      }
      setFilter(newFilter);
  };

  return (
    <div className="space-y-6">
      <SearchUI searchState={searchState} searchLocation={searchLocation} setSearchLocation={setSearchLocation} autoSearch={autoSearch} setAutoSearch={setAutoSearch} handleSearchSubmit={handleSearchSubmit} handleManualSearchArea={handleManualSearchArea} filter={filter} onFilterChange={handleFilterChange} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
              <Card>
                  <CardContent className="p-0 relative"> 
                      <MapComponent 
                          trulyDiscoveredWineries={trulyDiscoveredWineries}
                          visitedWineries={visitedToRender}
                          wishlistWineries={wishlistToRender}
                          favoriteWineries={favoritesToRender}
                          filter={filter} 
                          onMarkerClick={handleOpenModal}
                      /> 
                  </CardContent>
              </Card>
          </div>
          <div className="space-y-4">
              <Card>
                  <CardHeader><CardTitle>Legend</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                      <div className="flex items-center gap-2"> <div className="w-4 h-4 rounded-full bg-[#FBBF24] border-2 border-[#F59E0B]" /> <span className="text-sm">Favorite</span> </div>
                      <div className="flex items-center gap-2"> <div className="w-4 h-4 rounded-full bg-[#9333ea] border-2 border-[#7e22ce]" /> <span className="text-sm">Want to Go</span> </div>
                      <div className="flex items-center gap-2"> <div className="w-4 h-4 rounded-full bg-[#10B981] border-2 border-[#059669]" /> <span className="text-sm">Visited</span> </div>
                      <div className="flex items-center gap-2"> <div className="w-4 h-4 rounded-full bg-[#3B82F6] border-2 border-[#2563EB]" /> <span className="text-sm">Discovered</span> </div>
                  </CardContent>
              </Card>
              <Card>
                  <CardHeader><CardTitle className="flex justify-between items-center">Results In View <Badge>{listResultsInView.length}</Badge></CardTitle></CardHeader>
                  <CardContent className="relative">
                      {searchState.isSearching && (<div className="absolute inset-0 bg-white/70 dark:bg-zinc-900/70 flex items-center justify-center rounded-b-lg z-10"><Loader2 className="animate-spin text-muted-foreground h-8 w-8" /></div>)}
                      <div className="space-y-2 max-h-[450px] min-h-[400px] overflow-y-auto data-[loaded=true]:animate-in data-[loaded=true]:fade-in-50" data-loaded={!searchState.isSearching}>
                          {listResultsInView.length === 0 && !searchState.isSearching && (
                            <div className="text-center pt-10 text-muted-foreground">
                              <Wine className="mx-auto h-12 w-12" />
                              <p className="mt-4 text-sm">No wineries found.</p>
                              <p className="text-xs">Try searching or adjusting your filter.</p>
                            </div>
                          )}
                          {!searchState.isSearching && listResultsInView.map(winery => (
                              <div key={winery.id} className="p-3 border rounded-lg cursor-pointer hover:bg-muted hover:shadow-md hover:scale-[1.02] transition-all duration-200" onClick={() => handleOpenModal(winery)}>
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
      {selectedWinery && (<WineryModal 
        winery={selectedWinery} 
        onClose={() => setSelectedWinery(null)} 
        onSaveVisit={handleSaveVisit}
        onUpdateVisit={handleUpdateVisit}
        onDeleteVisit={handleDeleteVisit}
        onToggleWishlist={handleToggleWishlist}
        onToggleFavorite={handleToggleFavorite}
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

export default function WineryMapWrapper({ userId }: { userId: string }) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        return (<Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Google Maps API key is not configured.</AlertDescription></Alert>);
    }
    return (<APIProvider apiKey={apiKey} libraries={['places', 'geocoding', 'marker']}><WineryMapLogic userId={userId} /></APIProvider>);
}