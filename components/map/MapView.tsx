"use client";
import React, { memo } from "react";
import { Map } from "@vis.gl/react-google-maps";
import { Winery, Trip } from "@/lib/types";
import TripWineryClusterer from "../trip-winery-clusterer";
import DiscoveredClusterer from "../discovered-clusterer";
import WishlistClusterer from "../wishlist-clusterer";
import WineryClusterer from "../winery-clusterer";
import FavoriteClusterer from "../favorite-clusterer";

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
    return (
      <div className="h-[50vh] w-full lg:h-[600px] bg-muted">
        <Map
          defaultCenter={{ lat: 40, lng: -98 }}
          defaultZoom={4}
          gestureHandling={"greedy"}
          disableDefaultUI={true}
          mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}
          clickableIcons={true}
        >
          {selectedTrip && (
            <TripWineryClusterer
              wineries={selectedTrip.wineries}
              onClick={onMarkerClick}
            />
          )}

          {!selectedTrip && (
            <>
              {(filter.includes("all") || filter.includes("notVisited")) && (
                <DiscoveredClusterer
                  wineries={discoveredWineries}
                  onClick={onMarkerClick}
                />
              )}

              {(filter.includes("all") || filter.includes("wantToGo")) && (
                <WishlistClusterer
                  wineries={wishlistWineries}
                  onClick={onMarkerClick}
                />
              )}

              {(filter.includes("all") || filter.includes("visited")) && (
                <WineryClusterer
                  wineries={visitedWineries}
                  onClick={onMarkerClick}
                />
              )}

              {(filter.includes("all") || filter.includes("favorites")) && (
                <FavoriteClusterer
                  wineries={favoriteWineries}
                  onClick={onMarkerClick}
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