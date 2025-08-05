"use client"

import type React from "react"
import { useEffect, useRef, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertTriangle,
  Key,
  CheckCircle,
  XCircle,
  ExternalLink,
  Search,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  priceLevel?: number
  photos?: string[]
}

interface WineryMapProps {
  userId: string
}

export default function WineryMap({ userId }: WineryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
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
  const [showFallback, setShowFallback] = useState(false)
  const [searchLocation, setSearchLocation] = useState("")
  const [currentBounds, setCurrentBounds] = useState<any>(null)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [autoSearch, setAutoSearch] = useState(false)
  const [searchCount, setSearchCount] = useState(0)

  // Sample Finger Lakes wineries data
  const fingerLakesWineries: Omit<Winery, "id" | "userVisited" | "visits">[] = [
    {
      name: "Dr. Konstantin Frank Winery",
      address: "9749 Middle Rd, Hammondsport, NY 14840",
      lat: 42.4089,
      lng: -77.2094,
      phone: "(607) 868-4884",
      website: "https://drfrankwines.com",
      rating: 4.6,
    },
    {
      name: "Chateau Lafayette Reneau",
      address: "5081 NY-414, Hector, NY 14841",
      lat: 42.4756,
      lng: -76.8739,
      phone: "(607) 546-2062",
      website: "https://clrwine.com",
      rating: 4.4,
    },
    {
      name: "Wagner Vineyards",
      address: "9322 NY-414, Lodi, NY 14860",
      lat: 42.6089,
      lng: -76.8267,
      phone: "(607) 582-6450",
      website: "https://wagnervineyards.com",
      rating: 4.3,
    },
    {
      name: "Ravines Wine Cellars",
      address: "1020 Keuka Lake Rd, Penn Yan, NY 14527",
      lat: 42.6394,
      lng: -77.0533,
      phone: "(315) 536-4265",
      website: "https://ravineswine.com",
      rating: 4.5,
    },
    {
      name: "Hermann J. Wiemer Vineyard",
      address: "3962 NY-14, Dundee, NY 14837",
      lat: 42.5267,
      lng: -76.9733,
      phone: "(607) 243-7971",
      website: "https://wiemer.com",
      rating: 4.7,
    },
    {
      name: "Fox Run Vineyards",
      address: "670 NY-14, Penn Yan, NY 14527",
      lat: 42.6178,
      lng: -77.0456,
      phone: "(315) 536-4616",
      website: "https://foxrunvineyards.com",
      rating: 4.4,
    },
  ]

  // Test API key by making a direct request
  const testApiKey = useCallback(async (apiKey: string) => {
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=New+York&key=${apiKey}`)
      const data = await response.json()
      if (data.status === "OK") {
        setApiKeyTestResult("✅ API key is valid and working")
        return true
      } else if (data.status === "REQUEST_DENIED") {
        setApiKeyTestResult(`❌ API key denied: ${data.error_message || "Unknown error"}`)
        return false
      } else if (data.status === "OVER_QUERY_LIMIT") {
        setApiKeyTestResult("⚠️ API quota exceeded - check your billing and quotas")
        return false
      } else {
        setApiKeyTestResult(`⚠️ API key test returned: ${data.status} - ${data.error_message || "Unknown error"}`)
        return false
      }
    } catch (error) {
      setApiKeyTestResult(`❌ API key test failed: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }, [])

  const fetchUserVisits = useCallback(async (userId: string) => {
    try {
      const response = await fetch("/api/visits")
      if (response.ok) {
        const visits = await response.json()
        const visitsByWinery = visits.reduce((acc: any, visit: any) => {
          if (!acc[visit.winery_name]) acc[visit.winery_name] = []
          acc[visit.winery_name].push({
            id: visit.id,
            visitDate: visit.visit_date,
            userReview: visit.user_review,
            createdAt: visit.created_at,
          })
          return acc
        }, {})
        return visitsByWinery
      }
    } catch {}
    return {}
  }, [])

  const boundsChanged = useCallback((newBounds: any, oldBounds: any) => {
    if (!oldBounds || !newBounds) return true
    const newNE = newBounds.getNorthEast()
    const newSW = newBounds.getSouthWest()
    const oldNE = oldBounds.getNorthEast()
    const oldSW = oldBounds.getSouthWest()
    const latDiff = Math.abs(newNE.lat() - oldNE.lat()) + Math.abs(newSW.lat() - oldSW.lat())
    const lngDiff = Math.abs(newNE.lng() - oldNE.lng()) + Math.abs(newSW.lng() - oldSW.lng())
    const threshold = 0.01
    return latDiff > threshold || lngDiff > threshold
  }, [])

  // --- MIGRATED AND CORRECTED searchWineries FUNCTION ---
  const searchWineries = useCallback(
    async (location?: string, bounds?: any, isAutoSearch = false) => {
      // Check if the Place class is available before searching
      if (!window.google?.maps?.places?.Place) {
        console.error("Places API's Place class is not available.");
        return;
      }
      
      if (!mapInstanceRef.current) return;

      if (isAutoSearch && (!autoSearch || !boundsChanged(bounds, lastSearchBoundsRef.current))) return;

      setSearching(true);
      try {
        let searchBounds = bounds || currentBounds;

        if (location && location.trim()) {
          const geocoder = new window.google.maps.Geocoder();
          const geocodeResult = await new Promise((resolve, reject) => {
            geocoder.geocode({ address: location }, (results: any, status: any) => {
              if (status === "OK" && results[0]) resolve(results[0]);
              else reject(new Error(`Geocoding failed: ${status}`));
            });
          });
          const result = geocodeResult as any;
          const center = result.geometry.location;
          const offset = 0.18;
          searchBounds = new window.google.maps.LatLngBounds(
            new window.google.maps.LatLng(center.lat() - offset, center.lng() - offset),
            new window.google.maps.LatLng(center.lat() + offset, center.lng() + offset)
          );
          mapInstanceRef.current.fitBounds(searchBounds);
          setCurrentBounds(searchBounds);
        }

        if (!searchBounds) {
          setSearching(false);
          return;
        }

        lastSearchBoundsRef.current = searchBounds;
        
        const request = {
          fields: ["id", "displayName", "formattedAddress", "location", "rating", "websiteUri", "nationalPhoneNumber"],
          locationRestriction: searchBounds,
          includedTypes: ["winery"],
          maxResultCount: 20, // Max for searchNearby is 20
        };

        const response = await window.google.maps.places.Place.searchNearby(request);
        
        const results = response.places || [];
        
        const wineryResults: Winery[] = results.map((place: any) => ({
          id: `search-${place.id}`,
          name: place.displayName,
          address: place.formattedAddress || "Address not available",
          lat: place.location.latitude,
          lng: place.location.longitude,
          rating: place.rating,
          phone: place.nationalPhoneNumber,
          website: place.websiteUri,
          placeId: place.id,
          isFromSearch: true,
          userVisited: false,
          visits: [],
        }));

        setSearchResults(wineryResults);
        setShowSearchResults(true);
        setSearchCount((prev) => prev + 1);
        setSearching(false);
      } catch (error) {
        console.error("Winery search failed:", error);
        if (!isAutoSearch) setSearchResults([]);
        setSearching(false);
      }
    },
    [currentBounds, autoSearch, boundsChanged]
  );

  const autoSearchRef = useRef(autoSearch)
  useEffect(() => {
    autoSearchRef.current = autoSearch
  }, [autoSearch])

  const searchWineriesRef = useRef(searchWineries)
  useEffect(() => {
    searchWineriesRef.current = searchWineries
  }, [searchWineries])

  const debouncedAutoSearch = useCallback(
    (bounds: any) => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = setTimeout(() => {
        if (autoSearchRef.current && bounds) searchWineriesRef.current(undefined, bounds, true)
      }, 1000)
    },
    [],
  )

  const addAllMarkers = useCallback((allWineries: Winery[]) => {
    if (!mapInstanceRef.current) return
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current.clear()
    allWineries.forEach((winery) => {
      const marker = new window.google.maps.Marker({
        position: { lat: winery.lat, lng: winery.lng },
        map: mapInstanceRef.current,
        title: winery.name,
        icon: winery.isFromSearch
          ? {
              url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDlDNSAxNC4yNSAxMiAyMiAxMiAyMkMxMiAyMiAxOSAxNC4yNSAxOSA5QzE5IDUuMTMgMTUuODcgMiAxMiAyWk0xMiAxMS41QzEwLjYyIDExLjUgOS41IDEwLjM4IDkuNSA5QzkuNSA3LjYyIDEwLjYyIDYuNSAxMiA2LjVDMTMuMzggNi41IDE0LjUgNy42MiAxNC41IDlDMTQuNSAxMC4zOCAxMy4zOCAxMS41IDEyIDExLjVaIiBmaWxsPSIjMzMzM0ZGIi8+Cjwvc3ZnPgo=", // Blue for search results
              scaledSize: new window.google.maps.Size(32, 32),
            }
          : winery.userVisited
          ? {
              url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDlDNSAxNC4yNSAxMiAyMiAxMiAyMkMxMiAyMiAxOSAxNC4yNSAxOSA5QzE5IDUuMTMgMTUuODcgMiAxMiAyWk0xMiAxMS41QzEwLjYyIDExLjUgOS41IDEwLjM4IDkuNSA5QzkuNSA3LjYyIDEwLjYyIDYuNSAxMiA2LjVDMTMuMzggNi41IDE0LjUgNy42MiAxNC41IDlDMTQuNSAxMC4zOCAxMy4zOCAxMS41IDEyIDExLjVaIiBmaWxsPSIjMTBCOTgxIi8+Cjwvc3ZnPgo=", // Green for visited
              scaledSize: new window.google.maps.Size(32, 32),
            }
          : {
              url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDlDNSAxNC4yNSAxMiAyMiAxMiAyMkMxMiAyMiAxOSAxNC4yNSAxOSA5QzE5IDUuMTMgMTUuODcgMiAxMiAyWk0xMiAxMS41QzEwLjYyIDExLjUgOS41IDEwLjM4IDkuNSA5QzkuNSA3LjYyIDEwLjYyIDYuNSAxMiA2LjVDMTMuMzggNi41IDE0LjUgNy42MiAxNC41IDlDMTQuNSAxMC4zOCAxMy4zOCAxMS41IDEyIDExLjVaIiBmaWxsPSIjRUY0NDQ0Ii8+Cjwvc3ZnPgo=", // Red for not visited
              scaledSize: new window.google.maps.Size(32, 32),
            },
      })
      marker.addListener("click", () => setSelectedWinery(winery))
      markersRef.current.set(winery.id, marker)
    })
  }, [])

  useEffect(() => {
    if (mapInstanceRef.current) {
      const allWineriesMap = new Map<string, Winery>()
      wineries.forEach(w => allWineriesMap.set(w.placeId || w.id, w))
      searchResults.forEach(w => allWineriesMap.set(w.placeId || w.id, w))
      addAllMarkers(Array.from(allWineriesMap.values()))
    }
  }, [wineries, searchResults, addAllMarkers])

  const loadWineryData = useCallback(async () => {
    const visitsByWinery = await fetchUserVisits(userId)
    const wineryData = fingerLakesWineries.map((winery, index) => {
      const visits = visitsByWinery[winery.name] || []
      return {
        ...winery,
        id: `winery-${index}`,
        userVisited: visits.length > 0,
        visits: visits,
      }
    })
    setWineries(wineryData)
    setLoading(false)
  }, [userId, fetchUserVisits])

  const createMapContainer = useCallback(() => {
    if (!containerRef.current) return null
    const existingContainer = containerRef.current.querySelector("#google-map-div")
    if (existingContainer) existingContainer.remove()
    const mapDiv = document.createElement("div")
    mapDiv.id = "google-map-div"
    mapDiv.style.width = "100%"
    mapDiv.style.height = "100%"
    mapDiv.style.minHeight = "384px"
    mapDiv.style.borderRadius = "0.5rem"
    containerRef.current.appendChild(mapDiv)
    mapContainerRef.current = mapDiv
    return mapDiv
  }, [])

  const initializeMap = useCallback(async () => {
    if (!googleMapsLoaded || apiKeyStatus !== "valid") return
    try {
      const mapContainer = createMapContainer()
      if (!mapContainer) {
        setError("Failed to create map container")
        setShowFallback(true)
        setLoading(false)
        return
      }
      
      if (!window.google || !window.google.maps) {
        setError("Google Maps API not available")
        setShowFallback(true)
        setLoading(false)
        return
      }

      const mapInstance = new window.google.maps.Map(mapContainer, {
        center: { lat: 42.5, lng: -77.0 },
        zoom: 10,
        mapId: "YOUR_MAP_ID", // Recommended for advanced markers and styling
        styles: [
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#4A90E2" }] },
        ],
      })
      mapInstanceRef.current = mapInstance

      if (!window.google.maps.places?.Place) {
        setError("The new Google Maps Places library is not available. Ensure you are loading the 'places' library in your script tag and using Maps JS v3.55+.")
        setShowFallback(true)
        setLoading(false)
        return
      }

      mapInstance.addListener("bounds_changed", () => {
        const bounds = mapInstance.getBounds()
        setCurrentBounds(bounds)
        if (autoSearchRef.current) debouncedAutoSearch(bounds)
      })

      mapInstance.addListener("idle", () => {
        const bounds = mapInstance.getBounds()
        if (autoSearchRef.current && bounds) debouncedAutoSearch(bounds)
      })
      
      const visitsByWinery = await fetchUserVisits(userId)
      const wineryData = fingerLakesWineries.map((winery, index) => {
          const visits = visitsByWinery[winery.name] || []
          return {
            ...winery,
            id: `winery-${index}`,
            userVisited: visits.length > 0,
            visits: visits,
          }
        })
      setWineries(wineryData)
      addAllMarkers(wineryData)
      setLoading(false)
    } catch (error) {
      setError(`Failed to initialize map: ${error instanceof Error ? error.message : String(error)}`)
      setShowFallback(true)
      await loadWineryData()
    }
  }, [
    googleMapsLoaded,
    apiKeyStatus,
    userId,
    fetchUserVisits,
    createMapContainer,
    loadWineryData,
    addAllMarkers,
    debouncedAutoSearch,
  ])

  useEffect(() => {
    const loadGoogleMaps = async () => {
      const apiKey = process.env.NEXT_PUBLIC_Maps_API_KEY
      if (!apiKey) {
        setApiKeyStatus("missing")
        setError("Google Maps API key is not configured. Please add NEXT_PUBLIC_Maps_API_KEY to your environment variables.")
        setShowFallback(true)
        await loadWineryData()
        return
      }
      
      setApiKeyStatus("checking")
      const isValidKey = await testApiKey(apiKey)
      if (!isValidKey) {
        setApiKeyStatus("invalid")
        setError("Google Maps API key is invalid or has insufficient permissions.")
        setShowFallback(true)
        await loadWineryData()
        return
      }

      setApiKeyStatus("valid")
      if (window.google && window.google.maps) {
        setGoogleMapsLoaded(true)
        return
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script")
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly&callback=initGoogleMaps`
          script.async = true
          window.initGoogleMaps = () => {
            if (window.google && window.google.maps) {
              setGoogleMapsLoaded(true)
              resolve()
            } else {
              reject(new Error("Google Maps API not available after load"))
            }
          }
          script.onerror = () => reject(new Error("Failed to load Google Maps script"))
          document.head.appendChild(script)
        })
      } catch (error) {
        setApiKeyStatus("invalid")
        setError(`Failed to load Google Maps API: ${error instanceof Error ? error.message : String(error)}`)
        setShowFallback(true)
        await loadWineryData()
      }
    }
    loadGoogleMaps()
  }, [testApiKey, loadWineryData])

  useEffect(() => {
    if (googleMapsLoaded && apiKeyStatus === "valid" && !mapInitializedRef.current) {
      mapInitializedRef.current = true;
      initializeMap();
    }
  }, [googleMapsLoaded, apiKeyStatus, initializeMap]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  const handleVisitUpdate = async (winery: Winery, visitData: { visitDate: string; userReview: string }) => {
    try {
      const response = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wineryName: winery.name,
          wineryAddress: winery.address,
          visitDate: visitData.visitDate,
          userReview: visitData.userReview,
        }),
      })
      const responseData = await response.json()
      if (response.ok) {
        const updateWinery = (w: Winery) =>
          w.id === winery.id
            ? { ...w, visits: [...(w.visits || []), responseData], userVisited: true }
            : w
        setWineries((prev) => prev.map(updateWinery))
        setSearchResults((prev) => prev.map(updateWinery))
        setSelectedWinery((prev) =>
          prev?.id === winery.id
            ? { ...prev, visits: [...(prev.visits || []), responseData], userVisited: true }
            : prev,
        )
      } else {
        alert(`Failed to save visit: ${responseData.error || "Unknown error"}`)
      }
    } catch (error) {
      alert(`Error saving visit: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleDeleteVisit = async (winery: Winery, visitId: string) => {
    try {
      const response = await fetch(`/api/visits/${visitId}`, { method: "DELETE" })
      if (response.ok) {
        const updateWinery = (w: Winery) => {
          if (w.id === winery.id) {
            const updatedVisits = w.visits?.filter((v) => v.id !== visitId) || []
            return { ...w, visits: updatedVisits, userVisited: updatedVisits.length > 0 }
          }
          return w
        }
        setWineries((prev) => prev.map(updateWinery))
        setSearchResults((prev) => prev.map(updateWinery))
        setSelectedWinery((prev) =>
          prev?.id === winery.id
            ? { ...prev, visits: prev.visits?.filter((v) => v.id !== visitId) || [], userVisited: (prev.visits?.filter((v) => v.id !== visitId) || []).length > 0 }
            : prev,
        )
      } else {
        const responseData = await response.json()
        alert(`Failed to delete visit: ${responseData.error || "Unknown error"}`)
      }
    } catch (error) {
      alert(`Error deleting visit: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchLocation.trim()) searchWineries(searchLocation.trim())
  }

  const handleSearchInCurrentArea = () => {
    searchWineries(undefined, currentBounds)
  }



  const clearSearchResults = () => {
    setSearchResults([])
    setShowSearchResults(false)
    setSearchCount(0)
    lastSearchBoundsRef.current = null
    // This logic is now handled by the main addAllMarkers useEffect
  }

  const handleAutoSearchToggle = (enabled: boolean) => {
    setAutoSearch(enabled)
    if (enabled && currentBounds) debouncedAutoSearch(currentBounds)
  }

  if (loading && !showFallback) {
    return <div>Loading Map...</div>
  }

  if (error || showFallback) {
    return (
      <div className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {/* Fallback UI content */}
            </AlertDescription>
          </Alert>
        )}
        {/* Fallback winery list */}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="w-5 h-5" />
            <span>Discover Wineries</span>
          </CardTitle>
          <CardDescription>
            Search for wineries by location or explore the map.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                <Input
                  placeholder="Enter city, region, or address"
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                />
                <Button type="submit" disabled={searching}>
                  {searching ? "Searching..." : "Search"}
                </Button>
              </form>
              <Button variant="outline" onClick={handleSearchInCurrentArea} disabled={searching || autoSearch}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Search This Area
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="auto-search" checked={autoSearch} onCheckedChange={handleAutoSearchToggle} />
              <Label htmlFor="auto-search">Automatically search when map moves</Label>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {showSearchResults && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results ({searchResults.length})</CardTitle>
            <Button variant="outline" size="sm" onClick={clearSearchResults}>Clear Results</Button>
          </CardHeader>
          <CardContent>
            {/* Render search results here */}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div ref={containerRef} className="relative w-full h-[600px] rounded-lg overflow-hidden">
            {/* Map container will be inserted here */}
          </div>
        </CardContent>
      </Card>

      {selectedWinery && (
        <WineryModal
          winery={selectedWinery}
          isOpen={!!selectedWinery}
          onClose={() => setSelectedWinery(null)}
          onVisitUpdate={handleVisitUpdate}
          onDeleteVisit={handleDeleteVisit}
        />
      )}
    </div>
  )
}