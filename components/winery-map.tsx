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
  priceLevel?: number
  photos?: string[]
}

interface WineryMapProps {
  userId: string
}

export default function WineryMap({ userId }: WineryMapProps) {
  // Fallback UI (map error or fallback mode)
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

        {/* Functional fallback content */}
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

  // Main UI (map and search)
  return (
    <div className="space-y-6">
      {/* Search Controls */}
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

            {/* Auto-search toggle */}
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
                <div className="text-sm text-gray-600">of {wineries.length} wineries visited</div>
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