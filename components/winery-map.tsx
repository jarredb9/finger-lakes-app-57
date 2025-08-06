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

export default function WineryMap({ userId }: WineryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  // MIGRATION: The ref now holds the modern AdvancedMarkerElement
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

  const testApiKey = useCallback(async (apiKey: string) => {
    try {
      console.log("Testing API key with direct request...")
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=New+York&key=${apiKey}`)
      const data = await response.json()

      console.log("API key test response:", data)

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
      console.error("API key test failed:", error)
      setApiKeyTestResult(`❌ API key test failed: ${error}`)
      return false
    }
  }, [])

  const fetchUserVisits = useCallback(async (userId: string) => {
    try {
      console.log("Fetching user visits for user:", userId)
      const response = await fetch("/api/visits")
      if (response.ok) {
        const visits = await response.json()
        console.log("Visits fetched successfully:", visits)

        const visitsByWinery = visits.reduce((acc: any, visit: any) => {
          if (!acc[visit.winery_name]) {
            acc[visit.winery_name] = []
          }
          acc[visit.winery_name].push({
            id: visit.id,
            visitDate: visit.visit_date,
            userReview: visit.user_review,
            createdAt: visit.created_at,
          })
          return acc
        }, {})

        console.log("Visits grouped by winery:", visitsByWinery)
        return visitsByWinery
      } else {
        console.error("Failed to fetch visits:", response.status, response.statusText)
      }
    } catch (error) {
      console.error("Error fetching user visits:", error)
    }
    return {}
  }, [])

  const boundsChanged = useCallback((newBounds: google.maps.LatLngBounds, oldBounds: google.maps.LatLngBounds | null) => {
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

  // ============================================================================================
  // MIGRATION: The `searchWineries` function is updated to request `location` instead of `geometry`.
  // ============================================================================================
  const searchWineries = useCallback(
    async (location?: string, bounds?: google.maps.LatLngBounds, isAutoSearch = false) => {
      if (!mapInstanceRef.current) {
        return
      }
      if (isAutoSearch && (!autoSearch || !boundsChanged(bounds!, lastSearchBoundsRef.current))) {
        return
      }

      setSearching(true)
      console.log("Searching for wineries with new Place API...")

      try {
        let searchBounds = bounds || currentBounds

        if (location && location.trim()) {
          const geocoder = new window.google.maps.Geocoder()
          const geocodeResult = await geocoder.geocode({ address: location })
          if (geocodeResult.results && geocodeResult.results.length > 0) {
            const result = geocodeResult.results[0]
            searchBounds = result.geometry.viewport || result.geometry.bounds
            if (searchBounds) {
              mapInstanceRef.current.fitBounds(searchBounds)
              setCurrentBounds(searchBounds)
            }
          } else {
            throw new Error("Geocoding failed.")
          }
        }

        if (!searchBounds) {
          throw new Error("No search bounds available.")
        }
        lastSearchBoundsRef.current = searchBounds

        const searchRequest = {
          textQuery: "winery",
          fields: ["id", "displayName"],
          locationBias: searchBounds,
          maxResultCount: 20,
        }
        const { places } = await window.google.maps.places.Place.searchByText(searchRequest)

        if (!places || places.length === 0) {
          if (!isAutoSearch) setSearchResults([])
          return
        }

        // CORRECTION: Replaced 'geometry' with 'location'
        const detailFields: (keyof google.maps.places.Place)[] = [
          "displayName",
          "formattedAddress",
          "location",
          "rating",
          "websiteURI",
          "internationalPhoneNumber",
          "priceLevel",
          "photos",
          "id",
        ]

        const wineryPromises = places.map(async (place) => {
          if (!place.id) return null

          try {
            const placeDetails = new window.google.maps.places.Place({ id: place.id })
            await placeDetails.fetchFields({ fields: detailFields })
            const detailResult = placeDetails.toJSON()

            if (!detailResult?.location) {
              console.warn("Skipping place with no location:", place.id)
              return null
            }

            // CORRECTION: Using `detailResult.location` for coordinates
            return {
              id: `search-${detailResult.id}`,
              name: detailResult.displayName!,
              address: detailResult.formattedAddress || "Address not available",
              lat: detailResult.location.lat,
              lng: detailResult.location.lng,
              rating: detailResult.rating,
              phone: detailResult.internationalPhoneNumber,
              website: detailResult.websiteURI,
              placeId: detailResult.id,
              isFromSearch: true,
              priceLevel: detailResult.priceLevel,
              photos: detailResult.photos?.slice(0, 3).map((p) => p.getURI({ maxHeight: 300, maxWidth: 400 })),
              userVisited: false,
              visits: [],
            } as Winery
          } catch (error) {
            console.error(`Failed to fetch details for place ${place.id}:`, error)
            return null
          }
        })

        const wineryResults = (await Promise.all(wineryPromises)).filter((w): w is Winery => w !== null)

        setSearchResults(wineryResults)
        setShowSearchResults(true)
        setSearchCount((prev) => prev + 1)
      } catch (error) {
        console.error("Error during winery search:", error)
      } finally {
        setSearching(false)
      }
    },
    [currentBounds, autoSearch, boundsChanged],
  )
  
  const autoSearchRef = useRef(autoSearch)
  useEffect(() => {
    autoSearchRef.current = autoSearch
  }, [autoSearch])

  const searchWineriesRef = useRef(searchWineries);
  useEffect(() => {
    searchWineriesRef.current = searchWineries;
  }, [searchWineries]);

  const debouncedAutoSearch = useCallback(
  (bounds: any) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (autoSearchRef.current && bounds) {
        searchWineriesRef.current(undefined, bounds, true)
      }
    }, 1000)
  }, [])

  // ============================================================================================
  // MIGRATION: Rewritten to use the modern `google.maps.marker.AdvancedMarkerElement`
  // This addresses the deprecation warning and uses modern best practices for custom markers.
  // ============================================================================================
  const addAllMarkers = useCallback((allWineries: Winery[]) => {
    if (!mapInstanceRef.current || !window.google.maps.marker) {
      return
    }

    markersRef.current.forEach((marker) => {
      marker.map = null
    })
    markersRef.current.clear()

    allWineries.forEach((winery) => {
      const iconUrl = winery.isFromSearch
        ? "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDlDNSAxNC4yNSAxMiAyMiAxMiAyMkMxMiAyMiAxOSAxNC4yNSAxOSA5QzE5IDUuMTMgMTUuODcgMiAxMiAyWk0xMiAxMS41QzEwLjYyIDExLjUgOS41IDEwLjM4IDkuNSA5QzkuNSA3LjYyIDEwLjYyIDYuNSAxMiA2LjVDMTMuMzggNi41IDE0LjUgNy42MiAxNC41IDlDMTQuNSAxMC4zOCAxMy4zOCAxMS41IDEyIDExLjVaIiBmaWxsPSIjMzMzM0ZGIi8+Cjwvc3ZnPgo=" // Blue
        : winery.userVisited
        ? "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDlDNSAxNC4yNSAxMiAyMiAxMiAyMkMxMiAyMiAxOSAxNC4yNSAxOSA5QzE5IDUuMTMgMTUuODcgMiAxMiAyWk0xMiAxMS41QzEwLjYyIDExLjUgOS41IDEwLjM4IDkuNSA5QzkuNSA3LjYyIDEwLjYyIDYuNSAxMiA2LjVDMTMuMzggNi41IDE0LjUgNy42MiAxNC41IDlDMTQuNSAxMC4zOCAxMy4zOCAxMS41IDEyIDExLjVaIiBmaWxsPSIjMTBCOTgxIi8+Cjwvc3ZnPgo=" // Green
        : "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDOC4xMyAyIDUgNS4xMyA1IDlDNSAxNC4yNSAxMiAyMiAxMiAyMkMxMiAyMiAxOSAxNC4yNSAxOSA5QzE5IDUuMTMgMTUuODcgMiAxMiAyWk0xMiAxMS41QzEwLjYyIDExLjUgOS41IDEwLjM4IDkuNSA5QzkuNSA3LjYyIDEwLjYyIDYuNSAxMiA2LjVDMTMuMzggNi41IDE0LjUgNy42MiAxNC41IDlDMTQuNSAxMC4zOCAxMy4zOCAxMS41IDEyIDExLjVaIiBmaWxsPSIjRUY0NDQ0Ii8+Cjwvc3ZnPgo=" // Red

      const pinElement = document.createElement("img")
      pinElement.src = iconUrl
      pinElement.style.width = "32px"
      pinElement.style.height = "32px"
      pinElement.style.cursor = "pointer"

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat: winery.lat, lng: winery.lng },
        map: mapInstanceRef.current,
        title: winery.name,
        content: pinElement,
      })

      marker.addListener("click", () => {
        setSelectedWinery(winery)
      })

      markersRef.current.set(winery.id, marker)
    })
  }, [])

  useEffect(() => {
    if (mapInstanceRef.current) {
      const allWineriesMap = new Map<string, Winery>()
      wineries.forEach(w => {
        const key = w.placeId || w.id
        allWineriesMap.set(key, w)
      })
      searchResults.forEach(w => {
        const key = w.placeId || w.id
         if (!allWineriesMap.has(key)) {
           allWineriesMap.set(key, w)
         }
      })
      addAllMarkers(Array.from(allWineriesMap.values()))
    }
  }, [wineries, searchResults, addAllMarkers]);

  const loadWineryData = useCallback(async () => {
    console.log("Loading winery data without map...")
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

    console.log("Winery data loaded:", wineryData)
    setWineries(wineryData)
    setLoading(false)
  }, [userId, fetchUserVisits])

  const createMapContainer = useCallback(() => {
    if (!containerRef.current) return null

    const existingContainer = containerRef.current.querySelector("#google-map-div")
    if (existingContainer) {
      existingContainer.remove()
    }

    const mapDiv = document.createElement("div")
    mapDiv.id = "google-map-div"
    mapDiv.style.width = "100%"
    mapDiv.style.height = "100%"
    mapDiv.style.minHeight = "384px"
    mapDiv.style.borderRadius = "0.5rem"

    containerRef.current.appendChild(mapDiv)
    mapContainerRef.current = mapDiv

    console.log("Map container created:", mapDiv)
    return mapDiv
  }, [])

  const initializeMap = useCallback(async () => {
    if (!googleMapsLoaded || apiKeyStatus !== "valid") {
      return
    }

    console.log("Starting map initialization...")

    try {
      const mapContainer = createMapContainer()
      if (!mapContainer) {
        setError("Failed to create map container")
        setShowFallback(true)
        setLoading(false)
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 200))

      if (!window.google || !window.google.maps) {
        setError("Google Maps API not available")
        setShowFallback(true)
        setLoading(false)
        return
      }
      
      const mapInstance = new window.google.maps.Map(mapContainer, {
        center: { lat: 42.5, lng: -77.0 },
        zoom: 10,
        // The mapId is required for Advanced Markers to display
        mapId: "WINERY_MAP_DEMO",
        styles: [
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#4A90E2" }] },
        ],
      })

      mapInstanceRef.current = mapInstance

      mapInstance.addListener("bounds_changed", () => {
        const bounds = mapInstance.getBounds()
        if (bounds) {
            setCurrentBounds(bounds)
            if (autoSearchRef.current) {
              debouncedAutoSearch(bounds)
            }
        }
      })

      mapInstance.addListener("idle", () => {
        const bounds = mapInstance.getBounds()
        if (autoSearchRef.current && bounds) {
          debouncedAutoSearch(bounds)
        }
      })

      console.log("Map created successfully")

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
      
      console.log("Map initialization complete")
      setLoading(false)
    } catch (error) {
      console.error("Error initializing map:", error)
      const errorString = (error as Error).toString()
      if (errorString.includes("InvalidKeyMapError")) {
        setApiKeyStatus("invalid")
        setError("Invalid Google Maps API key.")
      } else {
        setError(`Failed to initialize map: ${errorString}`)
      }
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
    debouncedAutoSearch,
  ])

  // ============================================================================================
  // MIGRATION: Updated to load the `marker` library and use the `loading="async"` attribute.
  // ============================================================================================
  useEffect(() => {
    const loadGoogleMaps = async () => {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

      if (!apiKey) {
        setError("Google Maps API key is not configured.")
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
          // CORRECTION: Added the 'marker' library for AdvancedMarkerElement
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,maps,marker&callback=initGoogleMaps`
          script.async = true
          // CORRECTION: Added loading="async" for best practices
          script.setAttribute("loading", "async")

          window.initGoogleMaps = () => {
            if (window.google && window.google.maps) {
              setGoogleMapsLoaded(true)
              resolve()
            } else {
              reject(new Error("Google Maps API not available after load"))
            }
          }

          script.onerror = (error) => reject(new Error("Failed to load Google Maps script"))

          document.head.appendChild(script)
        })
      } catch (error) {
        console.error("Error loading Google Maps:", error)
        setError("Failed to load Google Maps API.")
        setShowFallback(true)
        await loadWineryData()
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
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
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
        const newVisit = { ...visitData, id: responseData.id, createdAt: responseData.created_at };

        const updateWinery = (w: Winery) =>
          w.id === winery.id
            ? {
                ...w,
                visits: [...(w.visits || []), newVisit],
                userVisited: true,
              }
            : w

        setWineries((prev) => prev.map(updateWinery))
        setSearchResults((prev) => prev.map(updateWinery))

        setSelectedWinery((prev) =>
          prev?.id === winery.id
            ? {
                ...prev,
                visits: [...(prev.visits || []), newVisit],
                userVisited: true,
              }
            : prev,
        )
      } else {
        alert(`Failed to save visit: ${responseData.error || "Unknown error"}`)
      }
    } catch (error) {
      alert(`Error saving visit: ${error}`)
    }
  }

  const handleDeleteVisit = async (winery: Winery, visitId: string) => {
    try {
      const response = await fetch(`/api/visits/${visitId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        const updateWinery = (w: Winery) => {
            if (w.id !== winery.id) return w;
            const updatedVisits = w.visits?.filter((v) => v.id !== visitId) || [];
            return {
                ...w,
                visits: updatedVisits,
                userVisited: updatedVisits.length > 0,
              }
        }
        
        setWineries((prev) => prev.map(updateWinery))
        setSearchResults((prev) => prev.map(updateWinery))

        setSelectedWinery((prev) =>
          prev?.id === winery.id
            ? {
                ...prev,
                visits: prev.visits?.filter((v) => v.id !== visitId) || [],
                userVisited: (prev.visits?.filter((v) => v.id !== visitId) || []).length > 0,
              }
            : prev,
        )
      } else {
        const responseData = await response.json()
        alert(`Failed to delete visit: ${responseData.error || "Unknown error"}`)
      }
    } catch (error) {
      alert(`Error deleting visit: ${error}`)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchLocation.trim()) {
      searchWineries(searchLocation.trim())
    }
  }

  const handleSearchInCurrentArea = () => {
    searchWineries(undefined, currentBounds!)
  }

  const clearSearchResults = () => {
    setSearchResults([])
    setShowSearchResults(false)
    setSearchCount(0)
    lastSearchBoundsRef.current = null
  }

  const handleAutoSearchToggle = (enabled: boolean) => {
    setAutoSearch(enabled)
    if (enabled && currentBounds) {
      debouncedAutoSearch(currentBounds)
    }
  }
  
  if (error || showFallback) {
    return (
      <div className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-3">
                <p>
                  <strong>Map Error:</strong> {error}
                </p>

                <div className="text-sm space-y-3">
                  <div className="flex items-center space-x-2">
                    <Key className="h-4 w-4" />
                    <span>
                      <strong>API Key Status:</strong>{" "}
                      {apiKeyStatus === "missing" ? (
                        <span className="text-red-600 flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          Missing
                        </span>
                      ) : apiKeyStatus === "invalid" ? (
                        <span className="text-red-600 flex items-center gap-1">
                          <XCircle className="h-3 w-3" />
                          Invalid/Project Error
                        </span>
                      ) : apiKeyStatus === "valid" ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Valid
                        </span>
                      ) : (
                        <span className="text-yellow-600">Checking...</span>
                      )}
                    </span>
                  </div>

                  {apiKeyTestResult && (
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="font-medium mb-1">API Key Test Result:</p>
                      <p className="text-sm">{apiKeyTestResult}</p>
                    </div>
                  )}

                  <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                    <p className="font-medium text-red-800 mb-2">🚨 ApiProjectMapError - Action Required:</p>
                    <p className="text-sm text-red-700 mb-3">
                      This error means your Google Cloud project has configuration issues. You need to:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-red-700">
                      <li>
                        <strong>Enable billing</strong> - Google Maps requires a billing account (even for free usage)
                      </li>
                      <li>
                        <strong>Enable APIs</strong> - Maps JavaScript API and Places API must be enabled
                      </li>
                      <li>
                        <strong>Check quotas</strong> - Make sure you haven't exceeded usage limits
                      </li>
                      <li>
                        <strong>Verify project</strong> - Ensure your project is active and valid
                      </li>
                    </ol>
                  </div>

                  <div className="bg-blue-50 p-3 rounded">
                    <p className="font-medium text-blue-800 mb-2">Quick Setup Links:</p>
                    <div className="space-y-2 text-sm">
                      <Button variant="outline" size="sm" asChild className="w-full justify-start bg-transparent">
                        <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          1. Enable Billing
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild className="w-full justify-start bg-transparent">
                        <a
                          href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          2. Enable Places API
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" asChild className="w-full justify-start bg-transparent">
                        <a
                          href="https://console.cloud.google.com/apis/credentials"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          3. Check API Key
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Finger Lakes Wineries</CardTitle>
                <CardDescription>
                  Map is currently unavailable - using list view. All winery tracking features are still functional!
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {wineries.map((winery) => (
                    <Card
                      key={winery.id}
                      className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                        winery.userVisited ? "border-green-200 bg-green-50" : ""
                      }`}
                      onClick={() => setSelectedWinery(winery)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">{winery.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">{winery.address}</p>
                            {winery.phone && <p className="text-sm text-gray-500 mt-1">{winery.phone}</p>}
                            {winery.rating && <p className="text-sm text-gray-500 mt-1">Rating: {winery.rating}/5.0</p>}
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            {winery.userVisited && (
                              <div className="flex items-center space-x-1 text-green-600">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-sm font-medium">
                                  {winery.visits?.length || 0} visit{(winery.visits?.length || 0) !== 1 ? "s" : ""}
                                </span>
                              </div>
                            )}
                            {winery.visits && winery.visits.length > 0 && (
                              <div className="flex items-center space-x-1 text-gray-500">
                                <Calendar className="w-3 h-3" />
                                <span className="text-xs">
                                  Last: {new Date(winery.visits[0].visitDate).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Your Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {wineries.filter((w) => w.userVisited).length}
                  </div>
                  <div className="text-sm text-gray-600">of {wineries.length} wineries visited</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Total visits: {wineries.reduce((sum, w) => sum + (w.visits?.length || 0), 0)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Visited</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-gray-300 rounded-full"></div>
                  <span className="text-sm">Not visited</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">Click any winery to add visits and reviews</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {selectedWinery && (
          <WineryModal
            winery={selectedWinery}
            onClose={() => setSelectedWinery(null)}
            onSaveVisit={handleVisitUpdate}
            onDeleteVisit={handleDeleteVisit}
          />
        )}
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
            Search for wineries in any location or explore dynamically as you move the map
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
                <Input
                  placeholder="Enter city, region, or address (e.g., 'Napa Valley, CA')"
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" disabled={searching || !searchLocation.trim()}>
                  {searching ? "Searching..." : "Search"}
                </Button>
              </form>
              <Button
                variant="outline"
                onClick={handleSearchInCurrentArea}
                disabled={searching || !currentBounds}
                className="flex items-center space-x-2 bg-transparent"
              >
                <MapPin className="w-4 h-4" />
                <span>Search Current Area</span>
              </Button>
            </div>

            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <Switch id="auto-search" checked={autoSearch} onCheckedChange={handleAutoSearchToggle} />
                  <Label htmlFor="auto-search" className="text-sm font-medium">
                    Auto-discover wineries as you explore
                  </Label>
                </div>
                {autoSearch && searching && (
                  <div className="flex items-center space-x-1 text-blue-600">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
                    <span className="text-xs">Searching...</span>
                  </div>
                )}
              </div>
              {searchCount > 0 && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  {searchCount} searches
                </Badge>
              )}
            </div>

            {showSearchResults && (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {searchResults.length} wineries found
                  </Badge>
                  <span className="text-sm text-gray-600">Blue markers on map</span>
                  {autoSearch && <span className="text-xs text-gray-500">(Auto-updating as you explore)</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={clearSearchResults}>
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Clear Results
                </Button>
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
              <CardDescription>
                {loading
                  ? "Loading map and winery data..."
                  : autoSearch
                    ? "Pan and zoom to automatically discover wineries in new areas!"
                    : "Click on any marker to view details and track your visits. Enable auto-discovery for dynamic exploration!"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                ref={containerRef}
                className="h-96 w-full rounded-lg border bg-gray-100 relative"
                style={{
                  minHeight: "384px",
                  minWidth: "100%",
                  display: "block",
                }}
              >
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg z-10">
                    <div className="text-center space-y-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <div className="space-y-1">
                        <p className="text-gray-700 font-medium">
                          {apiKeyStatus === "checking"
                            ? "Validating API key..."
                            : !googleMapsLoaded
                              ? "Loading Google Maps..."
                              : "Initializing map..."}
                        </p>
                        {apiKeyTestResult && <p className="text-xs text-gray-600">{apiKeyTestResult}</p>}
                        <div className="flex items-center justify-center space-x-4 text-xs text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Key className="h-3 w-3" />
                            <span>API: {apiKeyStatus}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Wifi className="h-3 w-3" />
                            <span>Maps: {googleMapsLoaded ? "loaded" : "loading"}</span>
                          </div>
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
            <CardHeader>
              <CardTitle>Your Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{wineries.filter((w) => w.userVisited).length}</div>
                <div className="text-sm text-gray-600">of {wineries.length} default wineries visited</div>
                <div className="text-xs text-gray-500 mt-1">
                  Total visits: {wineries.reduce((sum, w) => sum + (w.visits?.length || 0), 0)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                <span className="text-sm">Visited (default wineries)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                <span className="text-sm">Not visited (default wineries)</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                <span className="text-sm">Discovered wineries</span>
              </div>
            </CardContent>
          </Card>

          {showSearchResults && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Discovered Wineries</span>
                  <Badge variant="secondary">{searchResults.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchResults.slice(0, 10).map((winery) => (
                    <div
                      key={winery.id}
                      className="p-2 border rounded cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setSelectedWinery(winery)}
                    >
                      <div className="font-medium text-sm">{winery.name}</div>
                      <div className="text-xs text-gray-600">{winery.address}</div>
                      {winery.rating && <div className="text-xs text-gray-500">★ {winery.rating}/5.0</div>}
                    </div>
                  ))}
                  {searchResults.length > 10 && (
                    <div className="text-xs text-gray-500 text-center py-2">
                      And {searchResults.length - 10} more... (see map for all results)
                    </div>
                  )}
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
          onSaveVisit={handleVisitUpdate}
          onDeleteVisit={handleDeleteVisit}
        />
      )}
    </div>
  )
}