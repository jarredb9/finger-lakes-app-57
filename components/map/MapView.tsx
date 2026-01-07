"use client";
import { memo } from "react";
import { Map } from "@vis.gl/react-google-maps";
import { Winery, Trip } from "@/lib/types";
import GenericMarkerClusterer from "../generic-marker-clusterer";
import { Polyline } from "./polyline";

interface MapViewProps {
  discoveredWineries: Winery[];
  visitedWineries: Winery[];
  wishlistWineries: Winery[];
  favoriteWineries: Winery[];
  filter: string[];
  onMarkerClick: (winery: Winery) => void;
  selectedTrip?: Trip | null;
}

const MapView = memo(
  ({
    discoveredWineries,
    visitedWineries,
    wishlistWineries,
    favoriteWineries,
    filter,
    onMarkerClick,
    selectedTrip,
  }: MapViewProps) => {
    // Prepare trip path if a trip is selected
    const tripPath = selectedTrip?.wineries
      ? selectedTrip.wineries.map((w) => ({ lat: Number(w.lat), lng: Number(w.lng) }))
      : [];

    return (
      <div className="h-full w-full bg-muted">
        <Map
          defaultCenter={{ lat: 40, lng: -98 }}
          defaultZoom={4}
          gestureHandling={"greedy"}
          disableDefaultUI={true}
          mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
          clickableIcons={true}
        >
          {selectedTrip && (
            <>
              <GenericMarkerClusterer
                wineries={selectedTrip.wineries}
                onClick={onMarkerClick}
                color="#f17e3a"
                strokeColor="#d26e32"
                zIndexBase={30}
                numbered={true}
              />
              {tripPath.length > 1 && (
                <Polyline
                  path={tripPath}
                  strokeColor="#f17e3a"
                  strokeOpacity={0}
                  strokeWeight={3}
                  icons={[
                    {
                      icon: {
                        path: "M 0,-1 0,1",
                        strokeOpacity: 1,
                        scale: 3,
                        strokeColor: "#f17e3a",
                      },
                      offset: "0",
                      repeat: "20px",
                    },
                  ]}
                />
              )}
            </>
          )}

          {!selectedTrip && (
            <>
              {(filter.includes("all") || filter.includes("notVisited")) && (
                <GenericMarkerClusterer
                  wineries={discoveredWineries}
                  onClick={onMarkerClick}
                  color="#3B82F6"
                  strokeColor="#2563EB"
                  zIndexBase={1000}
                />
              )}

              {(filter.includes("all") || filter.includes("wantToGo")) && (
                <GenericMarkerClusterer
                  wineries={wishlistWineries}
                  onClick={onMarkerClick}
                  color="#9333ea"
                  strokeColor="#7e22ce"
                  zIndexBase={2000}
                />
              )}

              {(filter.includes("all") || filter.includes("visited")) && (
                <GenericMarkerClusterer
                  wineries={visitedWineries}
                  onClick={onMarkerClick}
                  color="#10B981"
                  strokeColor="#059669"
                  zIndexBase={3000}
                />
              )}

              {(filter.includes("all") || filter.includes("favorites")) && (
                <GenericMarkerClusterer
                  wineries={favoriteWineries}
                  onClick={onMarkerClick}
                  color="#FBBF24"
                  strokeColor="#F59E0B"
                  zIndexBase={4000}
                />
              )}
            </>
          )}
        </Map>
      </div>
    );
  }
);

MapView.displayName = "MapView";

export default MapView;