"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertTriangle,
  Key,
  Search,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import WineryModal from "./winery-modal"

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
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSearchBoundsRef = useRef<any>(null)
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
  const [searchLocation, setSearchLocation] = useState("")
  const [currentBounds, setCurrentBounds] = useState<any>(null)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [autoSearch, setAutoSearch] = useState(false)

  const fingerLakesWineries: Omit<Winery, "id" | "userVisited" | "visits">[] = [
    { name: "Dr. Konstantin Frank Winery", address: "9749 Middle Rd, Hammondsport, NY 14840", lat: 42.4089, lng: -77.2094, phone: "(607) 868-4884", website: "https://drfrankwines.com", rating: 4.6, },
    { name: "Chateau Lafayette Reneau", address: "5081 NY-414, Hector, NY 14841", lat: 42.4756, lng: -76.8739, phone: "(607) 546-2062", website: "https://clrwine.com", rating: 4.4, },
    { name: "Wagner Vineyards", address: "9322 NY-414, Lodi, NY 14860", lat: 42.6089, lng: -76.8267, phone: "(607) 582-6450", website: "https://wagnervineyards.com", rating: 4.3, },
    { name: "Ravines Wine Cellars", address: "1020 Keuka Lake Rd, Penn Yan, NY 14527", lat: 42.6394, lng: -77.0533, phone: "(315) 536-4265", website: "https://ravineswine.com", rating: 4.5, },
    { name: "Hermann J. Wiemer Vineyard", address: "3962 NY-14, Dundee, NY 14837", lat: 42.5267, lng: -76.9733, phone: "(607) 243-7971", website: "https://wiemer.com", rating: 4.7, },
    { name: "Fox Run Vineyards", address: "670 NY-14, Penn Yan, NY 14527", lat: 42.6178, lng: -77.0456, phone: "(315) 536-4616", website: "https://foxrunvineyards.com", rating: 4.4, },
  ];

  const testApiKey = useCallback(async (apiKey: string) => {
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=New+York&key=${apiKey}`);
      const data = await response.json();
      if (data.status === "OK") {
        setApiKeyTestResult("✅ API key is valid and working");
        return true;
      }
      setApiKeyTestResult(`❌ API key error: ${data.error_message || data.status}`);
      return false;
    } catch (error) {
      setApiKeyTestResult(`❌ API key test failed: ${error instanceof Error ? error.message : String(error)}`);
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
    } catch {}
    return {};
  }, []);

  const boundsChanged = useCallback((newBounds: any, oldBounds: any) => {
    if (!oldBounds || !newBounds) return true;
    const newNE = newBounds.getNorthEast(); const newSW = newBounds.getSouthWest();
    const oldNE = oldBounds.getNorthEast(); const oldSW = oldBounds.getSouthWest();
    const latDiff = Math.abs(newNE.lat() - oldNE.lat()) + Math.abs(newSW.lat() - oldSW.lat());
    const lngDiff = Math.abs(newNE.lng() - oldNE.lng()) + Math.abs(newSW.lng() - oldSW.lng());
    return latDiff > 0.01 || lngDiff > 0.01;
  }, []);

  const searchWineries = useCallback(async (location?: string, bounds?: any, isAutoSearch = false) => {
    if (!window.google?.maps?.places?.Place || !mapInstanceRef.current) return;
    if (isAutoSearch && (!autoSearch || !boundsChanged(bounds, lastSearchBoundsRef.current))) return;

    setSearching(true);
    try {
      let searchBounds = bounds || currentBounds;
      if (location?.trim()) {
        const geocoder = new window.google.maps.Geocoder();
        const { results } = await geocoder.geocode({ address: location });
        if (results && results[0]) {
          const center = results[0].geometry.location;
          const offset = 0.18;
          searchBounds = new window.google.maps.LatLngBounds(
            new window.google.maps.LatLng(center.lat() - offset, center.lng() - offset),
            new window.google.maps.LatLng(center.lat() + offset, center.lng() + offset)
          );
          mapInstanceRef.current.fitBounds(searchBounds);
          setCurrentBounds(searchBounds);
        }
      }
      if (!searchBounds) { setSearching(false); return; }
      lastSearchBoundsRef.current = searchBounds;
      const request = {
        fields: ["id", "displayName", "formattedAddress", "location", "rating", "nationalPhoneNumber"],
        locationRestriction: searchBounds,
        includedTypes: ["winery"],
        maxResultCount: 20,
      };
      const { places } = await window.google.maps.places.Place.searchNearby(request);
      const wineryResults: Winery[] = places.map((place: any) => ({
        id: `search-${place.id}`, name: place.displayName, address: place.formattedAddress || "N/A",
        lat: place.location.latitude, lng: place.location.longitude, rating: place.rating,
        phone: place.nationalPhoneNumber, website: undefined, placeId: place.id,
        isFromSearch: true, userVisited: false, visits: [],
      }));
      setSearchResults(wineryResults);
      setShowSearchResults(true);
    } catch (error) {
      setError(`Search failed. ${error instanceof Error ? error.message : ''}`);
    } finally {
      setSearching(false);
    }
  }, [currentBounds, autoSearch, boundsChanged]);

  const autoSearchRef = useRef(autoSearch);
  useEffect(() => { autoSearchRef.current = autoSearch }, [autoSearch]);

  const searchWineriesRef = useRef(searchWineries);
  useEffect(() => { searchWineriesRef.current = searchWineries }, [searchWineries]);

  const debouncedAutoSearch = useCallback((bounds: any) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      if (autoSearchRef.current && bounds) searchWineriesRef.current(undefined, bounds, true);
    }, 1000);
  }, []);

  const addAllMarkers = useCallback((allWineries: Winery[]) => {
    if (!mapInstanceRef.current || !window.google) return;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();
    allWineries.forEach((winery) => {
      const marker = new window.google.maps.Marker({ position: { lat: winery.lat, lng: winery.lng }, map: mapInstanceRef.current, title: winery.name });
      marker.addListener("click", () => setSelectedWinery(winery));
      markersRef.current.set(winery.id, marker);
    });
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current) {
      const allWineriesMap = new Map<string, Winery>();
      wineries.forEach(w => allWineriesMap.set(w.placeId || w.id, w));
      searchResults.forEach(w => allWineriesMap.set(w.placeId || w.id, w));
      addAllMarkers(Array.from(allWineriesMap.values()));
    }
  }, [wineries, searchResults, addAllMarkers]);

  const initializeMap = useCallback(async () => {
    if (!googleMapsLoaded || apiKeyStatus !== "valid" || !containerRef.current || mapInitializedRef.current) return;
    mapInitializedRef.current = true;
    
    try {
      const existingMap = containerRef.current.querySelector("#google-map-div");
      if (existingMap) existingMap.remove();
      
      const mapDiv = document.createElement("div");
      mapDiv.id = "google-map-div";
      mapDiv.style.cssText = "width: 100%; height: 100%;";
      containerRef.current.appendChild(mapDiv);

      await new Promise((resolve) => setTimeout(resolve, 100));
      
      if (!window.google?.maps?.Map) throw new Error("Google Maps script is not fully available yet.");
      
      const map = new window.google.maps.Map(mapDiv, { center: { lat: 42.5, lng: -77.0 }, zoom: 10 });
      mapInstanceRef.current = map;

      const visitsByWinery = await fetchUserVisits(userId);
      const wineryData = fingerLakesWineries.map((winery, index) => {
        const visits = visitsByWinery[winery.name] || [];
        return { ...winery, id: `winery-${index}`, userVisited: visits.length > 0, visits };
      });
      setWineries(wineryData);

      map.addListener("bounds_changed", () => debouncedAutoSearch(map.getBounds()));

    } catch (error) {
      setError(`Failed to initialize map: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [googleMapsLoaded, apiKeyStatus, userId, debouncedAutoSearch, fetchUserVisits]);

  useEffect(() => {
    const loadScript = async () => {
      if (window.google?.maps) {
        setGoogleMapsLoaded(true);
        setApiKeyStatus("valid");
        return;
      }
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        setError("API key is not configured.");
        setApiKeyStatus("missing");
        setLoading(false);
        return;
      }
      if (!(await testApiKey(apiKey))) {
        setError("API key is invalid or project is misconfigured.");
        setApiKeyStatus("invalid");
        setLoading(false);
        return;
      }
      setApiKeyStatus("valid");
      
      window.initGoogleMaps = () => setGoogleMapsLoaded(true);
      
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly&callback=initGoogleMaps`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      script.onerror = () => {
        setError("The Google Maps script failed to load. Check ad blockers or network issues.");
        setLoading(false);
      };
    };
    loadScript();
  }, [testApiKey]);

  useEffect(() => {
    if (googleMapsLoaded && apiKeyStatus === 'valid') {
      initializeMap();
    }
  }, [googleMapsLoaded, apiKeyStatus, initializeMap]);

  useEffect(() => { () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) } }, []);
  
  const handleVisitUpdate = useCallback(async (winery: Winery, visitData: { visitDate: string; userReview: string }) => {
    try {
      const response = await fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wineryName: winery.name, wineryAddress: winery.address, visitDate: visitData.visitDate, userReview: visitData.userReview, }) });
      const responseData = await response.json();
      if (response.ok) {
        const updateWinery = (w: Winery) => w.id === winery.id ? { ...w, visits: [...(w.visits || []), responseData], userVisited: true } : w;
        setWineries((prev) => prev.map(updateWinery));
        setSearchResults((prev) => prev.map(updateWinery));
        setSelectedWinery((prev) => prev?.id === winery.id ? { ...prev, visits: [...(prev.visits || []), responseData], userVisited: true } : prev);
      } else { alert(`Failed to save visit: ${responseData.error || "Unknown error"}`); }
    } catch (error) { alert(`Error saving visit: ${error instanceof Error ? error.message : String(error)}`); }
  }, []);

  const handleDeleteVisit = useCallback(async (winery: Winery, visitId: string) => {
    try {
      const response = await fetch(`/api/visits/${visitId}`, { method: "DELETE" });
      if (response.ok) {
        const updateWinery = (w: Winery) => {
          if (w.id === winery.id) {
            const updatedVisits = w.visits?.filter((v) => v.id !== visitId) || [];
            return { ...w, visits: updatedVisits, userVisited: updatedVisits.length > 0 };
          } return w;
        };
        setWineries((prev) => prev.map(updateWinery));
        setSearchResults((prev) => prev.map(updateWinery));
        setSelectedWinery((prev) => prev?.id === winery.id ? { ...prev, visits: prev.visits?.filter((v) => v.id !== visitId) || [], userVisited: (prev.visits?.filter((v) => v.id !== visitId) || []).length > 0 } : prev );
      } else { const responseData = await response.json(); alert(`Failed to delete visit: ${responseData.error || "Unknown error"}`); }
    } catch (error) { alert(`Error deleting visit: ${error instanceof Error ? error.message : String(error)}`); }
  }, []);
  
  const handleSearchSubmit = useCallback((e: React.FormEvent) => { e.preventDefault(); if (searchLocation.trim()) searchWineries(searchLocation.trim()); }, [searchLocation, searchWineries]);
  const handleSearchInCurrentArea = useCallback(() => { searchWineries(undefined, currentBounds); }, [currentBounds, searchWineries]);
  const clearSearchResults = useCallback(() => { setSearchResults([]); setShowSearchResults(false); }, []);
  const handleAutoSearchToggle = useCallback((enabled: boolean) => { setAutoSearch(enabled); if (enabled && currentBounds) debouncedAutoSearch(currentBounds); }, [currentBounds, debouncedAutoSearch]);

  if (error) {
    return (
      <div className="space-y-6 m-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" /><AlertDescription><p><strong>Map Error:</strong> {error}</p>{apiKeyTestResult && <p className="text-sm">Details: {apiKeyTestResult}</p>}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center space-x-2"><Search className="w-5 h-5" /><span>Discover Wineries</span></CardTitle><CardDescription>Search for wineries by location or explore the map.</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-4">
            <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
              <Input placeholder="Enter city, region, or address" value={searchLocation} onChange={(e) => setSearchLocation(e.target.value)} />
              <Button type="submit" disabled={searching}>{searching ? "Searching..." : "Search"}</Button>
              <Button variant="outline" onClick={handleSearchInCurrentArea} disabled={searching || autoSearch}><RotateCcw className="w-4 h-4 mr-2" />Search This Area</Button>
            </form>
            <div className="flex items-center space-x-2"><Switch id="auto-search" checked={autoSearch} onCheckedChange={handleAutoSearchToggle} /><Label htmlFor="auto-search">Automatically search when map moves</Label></div>
          </div>
        </CardContent>
      </Card>
      
      {showSearchResults && (
        <Card>
          <CardHeader><CardTitle>Search Results ({searchResults.length})</CardTitle><Button variant="outline" size="sm" onClick={clearSearchResults}>Clear Results</Button></CardHeader>
          <CardContent>{/* Render search results here */}</CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div ref={containerRef} className="relative w-full h-[600px] rounded-lg overflow-hidden">
            {loading && (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(255, 255, 255, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10, }}>
                <p>Loading Map...</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedWinery && <WineryModal winery={selectedWinery} isOpen={!!selectedWinery} onClose={() => setSelectedWinery(null)} onVisitUpdate={handleVisitUpdate} onDeleteVisit={handleDeleteVisit} />}
    </div>
  );
}