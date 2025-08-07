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

declare global {
  interface Window {
    google: typeof google
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
  priceLevel?: number
  photos?: string[]
}

interface WineryMapProps {
  userId: string
}

type RenderingType = "VECTOR" | "RASTER" | "UNINITIALIZED"

export default function WineryMap({ userId }: WineryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement | google.maps.Marker>>(new Map())
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSearchBoundsRef = useRef<google.maps.LatLngBounds | null>(null)
  const mapInitializedRef = useRef(false)

  const [wineries, setWineries] = useState<Winery[]>([])
  const [searchResults, setSearchResults] = useState<Winery[]>([])
  const [displayedWineries, setDisplayedWineries] = useState<Winery[]>([])
  const [selectedWinery, setSelectedWinery] = useState<Winery | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [isNewSearch, setIsNewSearch] = useState(false)
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
  const [renderingType, setRenderingType] = useState<RenderingType>("UNINITIALIZED")
  const [visiblePinCount, setVisiblePinCount] = useState(0);

  const fingerLakesWineries: Omit<Winery, "id" | "userVisited" | "visits">[] = [
    { name: "Dr. Konstantin Frank Winery", address: "9749 Middle Rd, Hammondsport, NY 14840", lat: 42.4089, lng: -77.2094, phone: "(607) 868-4884", website: "https://drfrankwines.com", rating: 4.6 },
    { name: "Chateau Lafayette Reneau", address: "5081 NY-414, Hector, NY 14841", lat: 42.4756, lng: -76.8739, phone: "(607) 546-2062", website: "https://clrwine.com", rating: 4.4 },
    { name: "Wagner Vineyards", address: "9322 NY-414, Lodi, NY 14860", lat: 42.6089, lng: -76.8267, phone: "(607) 582-6450", website: "https://wagnervineyards.com", rating: 4.3 },
    { name: "Ravines Wine Cellars", address: "1020 Keuka Lake Rd, Penn Yan, NY 14527", lat: 42.6394, lng: -77.0533, phone: "(315) 536-4265", website: "https://ravineswine.com", rating: 4.5 },
    { name: "Hermann J. Wiemer Vineyard", address: "3962 NY-14, Dundee, NY 14837", lat: 42.5267, lng: -76.9733, phone: "(607) 243-7971", website: "https://wiemer.com", rating: 4.7 },
    { name: "Fox Run Vineyards", address: "670 NY-14, Penn Yan, NY 14527", lat: 42.6178, lng: -77.0456, phone: "(315) 536-4616", website: "https://foxrunvineyards.com", rating: 4.4 },
  ]

  useEffect(() => {
    if (showSearchResults) {
      setDisplayedWineries(searchResults)
    } else {
      setDisplayedWineries(wineries)
    }
  }, [wineries, searchResults, showSearchResults])

  const testApiKey = useCallback(async (apiKey: string) => {
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=New+York&key=${apiKey}`)
      const data = await response.json()
      if (data.status === "OK") {
        setApiKeyTestResult("✅ API key is valid and working")
        return true
      } else {
        setApiKeyTestResult(`⚠️ API key test returned: ${data.status} - ${data.error_message || "Unknown error"}`)
        return false
      }
    } catch (error) {
      setApiKeyTestResult(`❌ API key test failed: ${error}`)
      return false
    }
  }, [])

  const fetchUserVisits = useCallback(async (userId: string) => {
    try {
      const response = await fetch("/api/visits")
      if (response.ok) {
        const visits = await response.json()
        return visits.reduce((acc: any, visit: any) => {
          if (!acc[visit.winery_name]) acc[visit.winery_name] = []
          acc[visit.winery_name].push({ id: visit.id, visitDate: visit.visit_date, userReview: visit.user_review, createdAt: visit.created_at })
          return acc
        }, {})
      }
    } catch (error) { console.error("Error fetching user visits:", error) }
    return {}
  }, [])

  const boundsChanged = useCallback((newBounds: google.maps.LatLngBounds, oldBounds: google.maps.LatLngBounds | null) => {
    if (!oldBounds || !newBounds) return true
    const newNE = newBounds.getNorthEast(), newSW = newBounds.getSouthWest()
    const oldNE = oldBounds.getNorthEast(), oldSW = oldBounds.getSouthWest()
    const latDiff = Math.abs(newNE.lat() - oldNE.lat()) + Math.abs(newSW.lat() - oldSW.lat())
    const lngDiff = Math.abs(newNE.lng() - oldNE.lng()) + Math.abs(newSW.lng() - oldSW.lng())
    return latDiff > 0.01 || lngDiff > 0.01
  }, [])

  const searchWineries = useCallback(async (location?: string, bounds?: google.maps.LatLngBounds, isAutoSearch = false) => {
    if (!mapInstanceRef.current || (isAutoSearch && (!autoSearch || !boundsChanged(bounds!, lastSearchBoundsRef.current)))) return

    setSearching(true)
    if (!isAutoSearch) {
      setIsNewSearch(true)
    }

    try {
      let searchBounds = bounds || currentBounds
      if (location?.trim()) {
        const geocoder = new window.google.maps.Geocoder()
        const { results } = await geocoder.geocode({ address: location })
        if (results && results.length > 0) {
          searchBounds = results[0].geometry.viewport || results[0].geometry.bounds
          if (searchBounds) mapInstanceRef.current.fitBounds(searchBounds)
        } else throw new Error("Geocoding failed.")
      }
      if (!searchBounds) throw new Error("No search bounds available.")
      lastSearchBoundsRef.current = searchBounds
      const { places } = await window.google.maps.places.Place.searchByText({ textQuery: "winery", fields: ["id", "displayName"], locationBias: searchBounds, maxResultCount: 20 })

      const detailFields: (keyof google.maps.places.Place)[] = ["displayName", "formattedAddress", "location", "rating", "websiteURI", "internationalPhoneNumber", "priceLevel", "photos", "id"]
      const wineryPromises = (places || []).map(async (place) => {
        if (!place.id) return null
        try {
          const placeDetails = new window.google.maps.places.Place({ id: place.id })
          await placeDetails.fetchFields({ fields: detailFields })
          const photoUris = placeDetails.photos?.slice(0, 3).map((p) => p.getURI({ maxHeight: 300, maxWidth: 400 })) || []
          const detailResult = placeDetails.toJSON()
          if (!detailResult.location) return null
          return { id: `search-${detailResult.id}`, name: detailResult.displayName!, address: detailResult.formattedAddress || "Address not available", lat: detailResult.location.lat, lng: detailResult.location.lng, rating: detailResult.rating, phone: detailResult.internationalPhoneNumber, website: detailResult.websiteURI, placeId: detailResult.id, isFromSearch: true, priceLevel: detailResult.priceLevel, photos: photoUris, userVisited: false, visits: [] } as Winery
        } catch (error) { console.error(`Failed to fetch details for place ${place.id}:`, error); return null }
      })
      const wineryResults = (await Promise.all(wineryPromises)).filter((w): w is Winery => w !== null)

      setSearchResults(wineryResults)
      setShowSearchResults(true)
      if (!isAutoSearch) {
        setSearchCount((p) => p + 1)
      }
    } catch (error) {
      console.error("Error during winery search:", error)
      setSearchResults([])
      setShowSearchResults(true)
    } finally {
      setSearching(false)
      setIsNewSearch(false)
    }
  }, [currentBounds, autoSearch, boundsChanged])

  const autoSearchRef = useRef(autoSearch)
  useEffect(() => { autoSearchRef.current = autoSearch }, [autoSearch])

  const debouncedAutoSearch = useCallback((bounds: google.maps.LatLngBounds) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      if (autoSearchRef.current && bounds) {
        // We call the searchWineries function directly, not a ref.
        searchWineries(undefined, bounds, true)
      }
    }, 1000)
  }, [searchWineries]) // This now depends on the latest version of searchWineries.


  const addAllMarkers = useCallback((wineriesToDisplay: Winery[]) => {
    if (!mapInstanceRef.current || renderingType === "UNINITIALIZED") return

    markersRef.current.forEach((marker) => {
      if ("map" in marker && typeof marker.map !== "undefined") marker.map = null
      else if ("setMap" in marker) (marker as google.maps.Marker).setMap(null)
    });
    markersRef.current.clear()

    wineriesToDisplay.forEach((winery) => {
      try {
        if (!winery || typeof winery.lat !== 'number' || typeof winery.lng !== 'number' || !isFinite(winery.lat) || !isFinite(winery.lng)) {
          console.warn(`Skipping winery with invalid coordinates: ${winery?.name || 'Unknown'}`);
          return;
        }
        const iconUrl = winery.isFromSearch
          ? "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDlDNSAxNC4yNSAxMiAyMiAxMiAyMkMxMiAyMiAxOSAxNC4yNSAxOSA5QzE5IDUuMTMgMTUuODcgMiAxMiAyWk0xMiAxMS41QzEwLjYyIDExLjUgOS41IDEwLjM4IDkuNSA5QzkuNSA3LjYyIDEwLjYyIDYuNSAxMiA2LjVDMTMuMzggNi41IDE0LjUgNy42MiAxNC41IDlDMTQuNSAxMC4zOCAxMy4zOCAxMS41IDEyIDExLjVaIiBmaWxsPSIjMzMzM0ZGIi8+Cjwvc3ZnPgo="
          : winery.userVisited
          ? "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDlDNSAxNC4yNSAxMiAyMiAxMiAyMkMxMiAyMiAxOSAxNC4yNSAxOSA5QzE5IDUuMTMgMTUuODcgMiAxMiAyWk0xMiAxMS41QzEwLjYyIDExLjUgOS41IDEwLjM4IDkuNSA5QzkuNSA3LjYyIDEwLjYyIDYuNSAxMiA2LjVDMTMuMzggNi41IDE0LjUgNy42MiAxNC41IDlDMTQuNSAxMC4zOCAxMy4zOCAxMS41IDEyIDExLjVaIiBmaWxsPSIjMTBCOTgxIi8+Cjwvc3ZnPgo="
          : "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDlDNSAxNC4yNSAxMiAyMiAxMiAyMkMxMiAyMiAxOSAxNC4yNSAxOSA5QzE5IDUuMTMgMTUuODcgMiAxMiAyWk0xMiAxMS41QzEwLjYyIDExLjUgOS41IDEwLjM4IDkuNSA5QzkuNSA3LjYyIDEwLjYyIDYuNSAxMiA2LjVDMTMuMzggNi41IDE0LjUgNy42MiAxNC41IDlDMTQuNSAxMC4zOCAxMy4zOCAxMS41IDEyIDExLjVaIiBmaWxsPSIjRUY0NDQ0Ii8+Cjwvc3ZnPgo="

        let marker: google.maps.marker.AdvancedMarkerElement | google.maps.Marker
        if (renderingType === 'VECTOR' && window.google.maps.marker) {
          const pinElement = document.createElement("img")
          pinElement.src = iconUrl; pinElement.style.width = "32px"; pinElement.style.height = "32px"; pinElement.style.cursor = "pointer"
          marker = new window.google.maps.marker.AdvancedMarkerElement({ position: { lat: winery.lat, lng: winery.lng }, map: mapInstanceRef.current, title: winery.name, content: pinElement })
        } else {
          marker = new window.google.maps.Marker({ position: { lat: winery.lat, lng: winery.lng }, map: mapInstanceRef.current, title: winery.name, icon: { url: iconUrl, scaledSize: new window.google.maps.Size(32, 32) } })
        }
        marker.addListener("click", () => setSelectedWinery(winery))
        markersRef.current.set(winery.id, marker)
      } catch (e) {
        console.error(`Failed to create marker for winery "${winery.name}":`, e)
      }
    });
    setVisiblePinCount(markersRef.current.size);
  }, [renderingType, setVisiblePinCount, setSelectedWinery])

  useEffect(() => {
    if (mapInstanceRef.current && renderingType !== "UNINITIALIZED") {
      addAllMarkers(displayedWineries);
    }
  }, [displayedWineries, renderingType, addAllMarkers]);

  const loadWineryData = useCallback(async () => {
    const visitsByWinery = await fetchUserVisits(userId)
    const wineryData = fingerLakesWineries.map((winery, index) => ({ ...winery, id: `winery-${index}`, userVisited: (visitsByWinery[winery.name] || []).length > 0, visits: visitsByWinery[winery.name] || [] }))
    setWineries(wineryData); setLoading(false)
  }, [userId, fetchUserVisits])

  const createMapContainer = useCallback(() => {
    if (!containerRef.current) return null
    const existingContainer = containerRef.current.querySelector("#google-map-div")
    if (existingContainer) existingContainer.remove()
    const mapDiv = document.createElement("div")
    mapDiv.id = "google-map-div"; mapDiv.style.width = "100%"; mapDiv.style.height = "100%"; mapDiv.style.minHeight = "384px"; mapDiv.style.borderRadius = "0.5rem"
    containerRef.current.appendChild(mapDiv); mapContainerRef.current = mapDiv
    return mapDiv
  }, [])

  const initializeMap = useCallback(async () => {
    if (!googleMapsLoaded || apiKeyStatus !== "valid") return
    try {
      const mapContainer = createMapContainer()
      if (!mapContainer) { setError("Failed to create map container"); setShowFallback(true); setLoading(false); return }
      await new Promise((resolve) => setTimeout(resolve, 200))
      if (!window.google || !window.google.maps) { setError("Google Maps API not available"); setShowFallback(true); setLoading(false); return }
      const mapInstance = new window.google.maps.Map(mapContainer, { center: { lat: 42.5, lng: -77.0 }, zoom: 10, mapId: "ac7e853c8d70efc0fdd4c089" })
      mapInstanceRef.current = mapInstance
      mapInstance.addListener('renderingtype_changed', () => {
        const newType = mapInstance.getRenderingType()
        setRenderingType(newType)
      })
      setRenderingType(mapInstance.getRenderingType())
      mapInstance.addListener("bounds_changed", () => {
        const bounds = mapInstance.getBounds()
        if (bounds) { setCurrentBounds(bounds); if (autoSearchRef.current) debouncedAutoSearch(bounds) }
      })
      mapInstance.addListener("idle", () => {
        const bounds = mapInstance.getBounds()
        if (autoSearchRef.current && bounds) debouncedAutoSearch(bounds)
      })
      const visitsByWinery = await fetchUserVisits(userId)
      const wineryData = fingerLakesWineries.map((winery, index) => ({ ...winery, id: `winery-${index}`, userVisited: (visitsByWinery[winery.name] || []).length > 0, visits: visitsByWinery[winery.name] || [] }))
      setWineries(wineryData); setLoading(false)
    } catch (error) {
      console.error("Error initializing map:", error); setShowFallback(true); await loadWineryData()
    }
  }, [googleMapsLoaded, apiKeyStatus, userId, fetchUserVisits, createMapContainer, loadWineryData, debouncedAutoSearch])

  useEffect(() => {
    const loadGoogleMaps = async () => {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      if (!apiKey) { setError("Google Maps API key is not configured."); setShowFallback(true); await loadWineryData(); return }
      setApiKeyStatus("checking")
      if (!(await testApiKey(apiKey))) { setError("Google Maps API key is invalid or has insufficient permissions."); setShowFallback(true); await loadWineryData(); return }
      setApiKeyStatus("valid")
      if (window.google?.maps) { setGoogleMapsLoaded(true); return }
      try {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script")
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,maps,marker&callback=initGoogleMaps`
          script.async = true; script.setAttribute("loading", "async")
          window.initGoogleMaps = () => window.google?.maps ? (setGoogleMapsLoaded(true), resolve()) : reject(new Error("Google Maps API not available after load"))
          script.onerror = () => reject(new Error("Failed to load Google Maps script"))
          document.head.appendChild(script)
        })
      } catch (error) {
        console.error("Error loading Google Maps:", error); setError("Failed to load Google Maps API."); setShowFallback(true); await loadWineryData()
      }
    }
    loadGoogleMaps()
  }, [testApiKey, loadWineryData])

  useEffect(() => {
    if (googleMapsLoaded && apiKeyStatus === "valid" && !mapInitializedRef.current) {
      mapInitializedRef.current = true
      initializeMap()
    }
  }, [googleMapsLoaded, apiKeyStatus, initializeMap])

  useEffect(() => {
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [])

  // FIX: Restoring the full function bodies
  const handleVisitUpdate = async (winery: Winery, visitData: { visitDate: string; userReview: string }) => {
    try {
      const response = await fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wineryName: winery.name, wineryAddress: winery.address, visitDate: visitData.visitDate, userReview: visitData.userReview }) })
      const responseData = await response.json()
      if (response.ok) {
        const newVisit = { ...visitData, id: responseData.id, createdAt: responseData.created_at }
        const updateWinery = (w: Winery) => w.id === winery.id ? { ...w, visits: [...(w.visits || []), newVisit], userVisited: true } : w
        setWineries((prev) => prev.map(updateWinery)); setSearchResults((prev) => prev.map(updateWinery))
        setSelectedWinery((prev) => prev?.id === winery.id ? { ...prev, visits: [...(prev.visits || []), newVisit], userVisited: true } : prev)
      } else { alert(`Failed to save visit: ${responseData.error || "Unknown error"}`) }
    } catch (error) { alert(`Error saving visit: ${error}`) }
  }

  const handleDeleteVisit = async (winery: Winery, visitId: string) => {
    try {
      const response = await fetch(`/api/visits/${visitId}`, { method: "DELETE" })
      if (response.ok) {
        const updateWinery = (w: Winery) => {
          if (w.id !== winery.id) return w
          const updatedVisits = w.visits?.filter((v) => v.id !== visitId) || []
          return { ...w, visits: updatedVisits, userVisited: updatedVisits.length > 0 }
        }
        setWineries((prev) => prev.map(updateWinery)); setSearchResults((prev) => prev.map(updateWinery))
        setSelectedWinery((prev) => prev?.id === winery.id ? { ...prev, visits: prev.visits?.filter((v) => v.id !== visitId) || [], userVisited: (prev.visits?.filter((v) => v.id !== visitId) || []).length > 0 } : prev)
      } else {
        const responseData = await response.json()
        alert(`Failed to delete visit: ${responseData.error || "Unknown error"}`)
      }
    } catch (error) { alert(`Error deleting visit: ${error}`) }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchLocation.trim()) searchWineries(searchLocation.trim())
  }

  const handleSearchInCurrentArea = () => searchWineries(undefined, currentBounds!)

  const clearSearchResults = () => {
    setSearchResults([]);
    setShowSearchResults(false);
    setSearchCount(0);
    lastSearchBoundsRef.current = null
  }

  const handleAutoSearchToggle = (enabled: boolean) => { setAutoSearch(enabled); if (enabled && currentBounds) debouncedAutoSearch(currentBounds) }

  if (error || showFallback) {
    return (
      <div className="space-y-6">
        {/* Fallback UI */}
      </div>
    )
  }

  // FIX: Restoring the full JSX for the component's UI
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2"> <Search className="w-5 h-5" /> <span>Discover Wineries</span> </CardTitle>
          <CardDescription> Search for wineries in any location or explore dynamically as you move the map </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                <Input placeholder="Enter city, region, or address (e.g., 'Napa Valley, CA')" value={searchLocation} onChange={(e) => setSearchLocation(e.target.value)} className="flex-1" />
                <Button type="submit" disabled={searching || !searchLocation.trim()}> {searching ? "Searching..." : "Search"} </Button>
              </form>
              <Button variant="outline" onClick={handleSearchInCurrentArea} disabled={searching || !currentBounds} className="flex items-center space-x-2 bg-transparent" > <MapPin className="w-4 h-4" /> <span>Search Current Area</span> </Button>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <Switch id="auto-search" checked={autoSearch} onCheckedChange={handleAutoSearchToggle} />
                  <Label htmlFor="auto-search" className="text-sm font-medium"> Auto-discover wineries as you explore </Label>
                </div>
              </div>
              {searchCount > 0 && (<Badge variant="secondary" className="bg-blue-100 text-blue-800"> {searchCount} searches </Badge>)}
            </div>
            {showSearchResults && (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {(isNewSearch || (autoSearch && searching)) ? (
                    <span className="text-sm text-gray-600 animate-pulse">Discovering wineries...</span>
                  ) : (
                    <>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        {visiblePinCount} wineries found
                      </Badge>
                      <span className="text-sm text-gray-600">Blue markers on map</span>
                    </>
                  )}
                  {autoSearch && !isNewSearch && !searching && <span className="text-xs text-gray-500">(Auto-updating as you explore)</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={clearSearchResults}> <RotateCcw className="w-4 h-4 mr-1" /> Clear Results </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Finger Lakes Wineries Map</CardTitle>
              <CardDescription> {loading ? "Loading map and winery data..." : autoSearch ? "Pan and zoom to automatically discover wineries in new areas!" : "Click on any marker to view details and track your visits. Enable auto-discovery for dynamic exploration!"} </CardDescription>
            </CardHeader>
            <CardContent>
              <div ref={containerRef} className="h-96 w-full rounded-lg border bg-gray-100 relative" style={{ minHeight: "384px", minWidth: "100%", display: "block", }} >
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg z-10">
                    <div className="text-center space-y-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <div className="space-y-1">
                        <p className="text-gray-700 font-medium"> {apiKeyStatus === "checking" ? "Validating API key..." : !googleMapsLoaded ? "Loading Google Maps..." : "Initializing map..."} </p>
                        {apiKeyTestResult && <p className="text-xs text-gray-600">{apiKeyTestResult}</p>}
                        <div className="flex items-center justify-center space-x-4 text-xs text-gray-500">
                          <div className="flex items-center space-x-1"> <Key className="h-3 w-3" /> <span>API: {apiKeyStatus}</span> </div>
                          <div className="flex items-center space-x-1"> <Wifi className="h-3 w-3" /> <span>Maps: {googleMapsLoaded ? "loaded" : "loading"}</span> </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader> <CardTitle>Your Progress</CardTitle> </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{wineries.filter((w) => w.userVisited).length}</div>
                <div className="text-sm text-gray-600">of {wineries.length} default wineries visited</div>
                <div className="text-xs text-gray-500 mt-1"> Total visits: {wineries.reduce((sum, w) => sum + (w.visits?.length || 0), 0)} </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader> <CardTitle>Legend</CardTitle> </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center space-x-2"> <div className="w-4 h-4 bg-green-500 rounded-full"></div> <span className="text-sm">Visited (default wineries)</span> </div>
              <div className="flex items-center space-x-2"> <div className="w-4 h-4 bg-red-500 rounded-full"></div> <span className="text-sm">Not visited (default wineries)</span> </div>
              <div className="flex items-center space-x-2"> <div className="w-4 h-4 bg-blue-500 rounded-full"></div> <span className="text-sm">Discovered wineries</span> </div>
            </CardContent>
          </Card>
          {showSearchResults && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between"> <span>Discovered Wineries</span> <Badge variant="secondary">{visiblePinCount}</Badge> </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchResults.slice(0, 10).map((winery) => (
                    <div key={winery.id} className="p-2 border rounded cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setSelectedWinery(winery)} >
                      <div className="font-medium text-sm">{winery.name}</div>
                      <div className="text-xs text-gray-600">{winery.address}</div>
                      {winery.rating && <div className="text-xs text-gray-500">★ {winery.rating}/5.0</div>}
                    </div>
                  ))}
                  {searchResults.length > 10 && ( <div className="text-xs text-gray-500 text-center py-2"> And {searchResults.length - 10} more... (see map for all results) </div>)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {selectedWinery && ( <WineryModal winery={selectedWinery} onClose={() => setSelectedWinery(null)} onSaveVisit={handleVisitUpdate} onDeleteVisit={handleDeleteVisit} />)}
    </div>
  )
}