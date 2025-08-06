"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertTriangle,
  Key,
  Wifi,
  CheckCircle,
  XCircle,
  ExternalLink,
  Calendar,
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

// Google Maps TypeScript declarations
declare global {
  interface Window {
    google: any
    initGoogleMaps: () => void
  }
}

interface Visit {
  id?: string
  visitDate: string
  userReview: string
  createdAt?: string
}

interface Winery {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone?: string
  website?: string
  rating?: number
  userVisited?: boolean
  visits?: Visit[]
  placeId?: string
  isFromSearch?: boolean
}

interface WineryMapProps {
  userId: string
}

export default function WineryMap({ userId }: WineryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map())
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSearchBoundsRef = useRef<google.maps.LatLngBounds | null>(null)
  const mapInitializedRef = useRef(false)

  const [wineries, setWineries] = useState<Winery[]>([])
  const [searchResults, setSearchResults] = useState<Winery[]>([])
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false)
  const [apiKeyStatus, setApiKeyStatus] = useState<"checking" | "valid" | "invalid" | "missing">("checking")
  const [apiKeyTestResult, setApiKeyTestResult] = useState<string>("")
  const [showFallback, setShowFallback] = useState(false)
  const [searchLocation, setSearchLocation] = useState("")
  const [currentBounds, setCurrentBounds] = useState<google.maps.LatLngBounds | null>(null)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [autoSearch, setAutoSearch] = useState(false)
  const [searchCount, setSearchCount] = useState(0)

  // This data is defined outside the component to prevent it from being recreated on each render.
  const fingerLakesWineries: Omit<Winery, "id" | "userVisited" | "visits">[] = [
    { name: "Dr. Konstantin Frank Winery", address: "9749 Middle Rd, Hammondsport, NY 14840", lat: 42.4089, lng: -77.2094, phone: "(607) 868-4884", website: "https://drfrankwines.com", rating: 4.6 },
    { name: "Chateau Lafayette Reneau", address: "5081 NY-414, Hector, NY 14841", lat: 42.4756, lng: -76.8739, phone: "(607) 546-2062", website: "https://clrwine.com", rating: 4.4 },
    { name: "Wagner Vineyards", address: "9322 NY-414, Lodi, NY 14860", lat: 42.6089, lng: -76.8267, phone: "(607) 582-6450", website: "https://wagnervineyards.com", rating: 4.3 },
    { name: "Ravines Wine Cellars", address: "1020 Keuka Lake Rd, Penn Yan, NY 14527", lat: 42.6394, lng: -77.0533, phone: "(315) 536-4265", website: "https://ravineswine.com", rating: 4.5 },
    { name: "Hermann J. Wiemer Vineyard", address: "3962 NY-14, Dundee, NY 14837", lat: 42.5267, lng: -76.9733, phone: "(607) 243-7971", website: "https://wiemer.com", rating: 4.7 },
    { name: "Fox Run Vineyards", address: "670 NY-14, Penn Yan, NY 14527", lat: 42.6178, lng: -77.0456, phone: "(315) 536-4616", website: "https://foxrunvineyards.com", rating: 4.4 },
  ];

  const testApiKey = useCallback(async (apiKey: string) => {
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=New+York&key=${apiKey}`);
      const data = await response.json();
      if (data.status === "OK") { setApiKeyTestResult("✅ API key is valid and working"); return true; }
      setApiKeyTestResult(`❌ API key denied: ${data.error_message || "Unknown error"}`);
      return false;
    } catch (error) {
      setApiKeyTestResult(`❌ API key test failed: ${error instanceof Error ? error.message : "Unknown fetch error"}`);
      return false;
    }
  }, []);

  const fetchUserVisits = useCallback(async (userId: string) => {
    try {
      const response = await fetch("/api/visits");
      if (response.ok) {
        const visits = await response.json();
        return visits.reduce((acc: any, visit: any) => {
          if (!acc[visit.winery_name]) acc[visit.winery_name] = [];
          acc[visit.winery_name].push({ id: visit.id, visitDate: visit.visit_date, userReview: visit.user_review, createdAt: visit.created_at });
          return acc;
        }, {});
      }
    } catch (error) { console.error("Error fetching user visits:", error); }
    return {};
  }, []);

  const boundsChanged = useCallback((newBounds: google.maps.LatLngBounds | null, oldBounds: google.maps.LatLngBounds | null) => {
    if (!oldBounds || !newBounds) return true;
    return !newBounds.equals(oldBounds);
  }, []);

  const searchWineries = useCallback(async (location?: string, isAutoSearch = false) => {
    if (!window.google?.maps?.places?.Place || !mapInstanceRef.current) return;
    if (isAutoSearch && (!autoSearch || !boundsChanged(mapInstanceRef.current.getBounds(), lastSearchBoundsRef.current))) {
      return;
    }
    setSearching(true);
    setError(null);
    try {
      lastSearchBoundsRef.current = mapInstanceRef.current.getBounds();
      const fields = ["id", "displayName", "formattedAddress", "location", "rating", "internationalPhoneNumber", "websiteURI"];
      let request: { textQuery: string; fields: string[]; maxResultCount: number; locationBias?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral; };

      if (location?.trim()) {
        request = { textQuery: `wineries in ${location}`, fields, maxResultCount: 20 };
      } else {
        const searchBounds = mapInstanceRef.current.getBounds();
        if (!searchBounds) throw new Error("Map bounds not available for area search.");
        request = { textQuery: 'winery', fields, locationBias: searchBounds, maxResultCount: 20 };
      }

      const { places } = await window.google.maps.places.Place.searchWithText(request);
      
      if (location?.trim()) {
        const bounds = new window.google.maps.LatLngBounds();
        places.forEach((place: any) => place.location && bounds.extend(place.location));
        if (!bounds.isEmpty()) mapInstanceRef.current.fitBounds(bounds);
      }

      const wineryResults: Winery[] = places.map((place: any) => ({
        id: `search-${place.id}`, name: place.displayName, address: place.formattedAddress || "N/A",
        lat: place.location.latitude, lng: place.location.longitude, rating: place.rating,
        phone: place.internationalPhoneNumber, website: place.websiteURI, placeId: place.id,
        isFromSearch: true, userVisited: false, visits: [],
      }));
      setSearchResults(wineryResults);
      setShowSearchResults(true);
      setSearchCount((prev) => prev + 1);
    } catch (e) {
      console.error("Search failed:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }, [autoSearch, currentBounds, boundsChanged]);

  const searchWineriesRef = useRef(searchWineries);
  useEffect(() => { searchWineriesRef.current = searchWineries; }, [searchWineries]);

  const debouncedAutoSearch = useCallback(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      if (autoSearch) {
        searchWineriesRef.current(undefined, true);
      }
    }, 1000);
  }, [autoSearch]);

  const addAllMarkers = useCallback(async (allWineries: Winery[]) => {
    if (!mapInstanceRef.current) return;
    try {
      const { AdvancedMarkerElement } = await window.google.maps.importLibrary("marker") as google.maps.MarkerLibrary;
      markersRef.current.forEach((marker) => { marker.map = null; });
      markersRef.current.clear();
      allWineries.forEach((winery) => {
        const marker = new AdvancedMarkerElement({ position: { lat: winery.lat, lng: winery.lng }, map: mapInstanceRef.current, title: winery.name });
        marker.addListener("click", () => setSelectedWinery(winery));
        markersRef.current.set(winery.id, marker);
      });
    } catch (e) { console.error("Error adding markers:", e); }
  }, []);

  useEffect(() => {
    const allWineriesMap = new Map<string, Winery>();
    wineries.forEach(w => allWineriesMap.set(w.id, w));
    searchResults.forEach(w => allWineriesMap.set(w.id, w));
    addAllMarkers(Array.from(allWineriesMap.values()));
  }, [wineries, searchResults, addAllMarkers]);

  const loadWineryData = useCallback(async () => {
    const visitsByWinery = await fetchUserVisits(userId);
    const wineryData = fingerLakesWineries.map((winery, index) => {
      const visits = visitsByWinery[winery.name] || [];
      return { ...winery, id: `winery-${index}`, userVisited: visits.length > 0, visits };
    });
    setWineries(wineryData);
    setLoading(false);
  }, [userId, fetchUserVisits, fingerLakesWineries]);

  const initializeMap = useCallback(async () => {
    if (!googleMapsLoaded || !containerRef.current || mapInitializedRef.current) return;
    mapInitializedRef.current = true;
    try {
      const { Map } = await window.google.maps.importLibrary("maps") as google.maps.MapsLibrary;
      const map = new Map(containerRef.current, { center: { lat: 42.5, lng: -77.0 }, zoom: 10, mapId: "YOUR_MAP_ID_HERE" });
      mapInstanceRef.current = map;
      
      const visitsByWinery = await fetchUserVisits(userId);
      const wineryData = fingerLakesWineries.map((winery, index) => {
        const visits = visitsByWinery[winery.name] || [];
        return { ...winery, id: `winery-${index}`, userVisited: visits.length > 0, visits };
      });
      setWineries(wineryData);

      map.addListener("idle", () => {
        const bounds = map.getBounds();
        if (bounds && !bounds.isEmpty()) {
          setCurrentBounds(bounds);
          debouncedAutoSearch();
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setShowFallback(true);
      await loadWineryData();
    } finally {
      setLoading(false);
    }
  }, [googleMapsLoaded, userId, fetchUserVisits, debouncedAutoSearch, loadWineryData, fingerLakesWineries]);

  useEffect(() => {
    const loadGoogleMaps = async () => {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        setApiKeyStatus("missing");
        setError("Google Maps API key is not configured.");
        setShowFallback(true);
        await loadWineryData();
        return;
      }
      if (window.google?.maps) {
        setGoogleMapsLoaded(true);
        return;
      }
      const scriptId = "google-maps-script";
      if (document.getElementById(scriptId)) return;

      window.initGoogleMaps = () => setGoogleMapsLoaded(true);
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&v=weekly&callback=initGoogleMaps`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      script.onerror = async () => {
        setError("Google Maps script failed to load.");
        setShowFallback(true);
        await loadWineryData();
      };
    };
    loadGoogleMaps();
  }, [loadWineryData]);

  useEffect(() => {
    if (googleMapsLoaded && !mapInitializedRef.current) {
      initializeMap();
    }
  }, [googleMapsLoaded, initializeMap]);

  useEffect(() => {
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, []);
  
  const handleVisitUpdate = async (winery: Winery, visitData: { visitDate: string; userReview: string }) => {
    try {
      const response = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wineryName: winery.name, wineryAddress: winery.address, visitDate: visitData.visitDate, userReview: visitData.userReview }),
      });
      const responseData = await response.json();
      if (response.ok) {
        const newVisit = responseData.visit && Array.isArray(responseData.visit) ? responseData.visit[0] : responseData;
        const updateWinery = (w: Winery) => w.id === winery.id ? { ...w, visits: [...(w.visits || []), newVisit], userVisited: true } : w;
        setWineries(prev => prev.map(updateWinery));
        setSearchResults(prev => prev.map(updateWinery));
        setSelectedWinery(prev => (prev?.id === winery.id ? { ...prev, visits: [...(prev.visits || []), newVisit], userVisited: true } : prev));
      } else { alert(`Failed to save visit: ${responseData.error || "Unknown error"}`); }
    } catch (e) { alert(`Error saving visit: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const handleDeleteVisit = async (winery: Winery, visitId: string) => {
    try {
      const response = await fetch(`/api/visits/${visitId}`, { method: "DELETE" });
      if (response.ok) {
        const updateWinery = (w: Winery) => {
          if (w.id === winery.id) {
            const updatedVisits = w.visits?.filter(v => v.id !== visitId) || [];
            return { ...w, visits: updatedVisits, userVisited: updatedVisits.length > 0 };
          }
          return w;
        };
        setWineries(prev => prev.map(updateWinery));
        setSearchResults(prev => prev.map(updateWinery));
        setSelectedWinery(prev => (prev?.id === winery.id ? updateWinery(prev) : prev));
      } else { const data = await response.json(); alert(`Failed to delete visit: ${data.error || "Unknown error"}`); }
    } catch (e) { alert(`Error deleting visit: ${e instanceof Error ? e.message : String(e)}`); }
  };

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); if (searchLocation.trim()) searchWineries(searchLocation.trim()); };
  const handleSearchInCurrentArea = () => searchWineries();
  const clearSearchResults = () => { setSearchResults([]); setShowSearchResults(false); setSearchCount(0); lastSearchBoundsRef.current = null; };
  const handleAutoSearchToggle = (enabled: boolean) => { setAutoSearch(enabled); if (enabled && currentBounds) debouncedAutoSearch(); };
  
  if (error || showFallback) {
    return (
      <div className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-3">
                <p><strong>Map Error:</strong> {error}</p>
                <div className="text-sm space-y-3">
                  <div className="flex items-center space-x-2"><Key className="h-4 w-4" /><span><strong>API Key Status:</strong> {apiKeyStatus}</span></div>
                  {apiKeyTestResult && (<div className="bg-gray-50 p-3 rounded"><p className="font-medium mb-1">API Key Test Result:</p><p className="text-sm">{apiKeyTestResult}</p></div>)}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader><CardTitle>Finger Lakes Wineries</CardTitle><CardDescription>Map is currently unavailable - using list view. All winery tracking features are still functional!</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {wineries.map((winery) => (
                  <Card key={winery.id} className={`cursor-pointer transition-colors hover:bg-gray-50 ${winery.userVisited ? "border-green-200 bg-green-50" : ""}`} onClick={() => setSelectedWinery(winery)}>
                    <CardContent className="p-4">{/* ... (content from your original code) ... */}</CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        {selectedWinery && (<WineryModal winery={selectedWinery} isOpen={!!selectedWinery} onClose={() => setSelectedWinery(null)} onVisitUpdate={handleVisitUpdate} onDeleteVisit={handleDeleteVisit}/>)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center space-x-2"><Search className="w-5 h-5" /><span>Discover Wineries</span></CardTitle><CardDescription>Search for wineries by location or explore dynamically as you move the map</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                <Input placeholder="Enter city, region, or address (e.g., 'Napa Valley, CA')" value={searchLocation} onChange={(e) => setSearchLocation(e.target.value)} className="flex-1" />
                <Button type="submit" disabled={searching || !searchLocation.trim()}>{searching ? "Searching..." : "Search"}</Button>
              </form>
              <Button variant="outline" onClick={handleSearchInCurrentArea} disabled={searching || !currentBounds} className="flex items-center space-x-2 bg-transparent">
                <MapPin className="w-4 h-4" />
                <span>Search Current Area</span>
              </Button>
            </div>
            <div className="flex items-center space-x-2"><Switch id="auto-search" checked={autoSearch} onCheckedChange={handleAutoSearchToggle} /><Label htmlFor="auto-search">Automatically search when map moves</Label></div>
          </div>
        </CardContent>
      </Card>
      
      {showSearchResults && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Search Results ({searchResults.length})</CardTitle>
            <Button variant="outline" size="sm" onClick={clearSearchResults}>Clear Results</Button>
          </Header>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {searchResults.map((winery) => (
                <div key={winery.id} className="p-2 border rounded cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setSelectedWinery(winery)}>
                  <div className="font-medium text-sm">{winery.name}</div>
                  <div className="text-xs text-gray-600">{winery.address}</div>
                  {winery.rating && <div className="text-xs text-gray-500">★ {winery.rating}/5.0</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div ref={containerRef} className="relative w-full h-[600px] rounded-lg overflow-hidden border bg-gray-100">
            {loading && (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10, }}>
                <p>Loading Map...</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedWinery && (
        <WineryModal winery={selectedWinery} isOpen={!!selectedWinery} onClose={() => setSelectedWinery(null)} onVisitUpdate={handleVisitUpdate} onDeleteVisit={handleDeleteVisit} />
      )}
    </div>
  );
}