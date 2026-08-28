"use client";

import { useWineryMapContext } from "@/components/winery-map-context";
import { MapControls } from "@/components/map/map-controls";
import { MapLegendPopover } from "@/components/map/map-legend-popover";
import WinerySearchResults from "@/components/map/WinerySearchResults";
import { Separator } from "@/components/ui/separator";

export function ExploreTabContent() {
  const { listResultsInView, isSearching, handleOpenModal } = useWineryMapContext();

  return (
    <div data-testid="explore-tab-content" className="p-4 space-y-4 pb-20">
      <MapControls />

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Wineries in View</h3>
          <MapLegendPopover />
        </div>
        <WinerySearchResults
          listResultsInView={listResultsInView}
          isSearching={isSearching}
          handleOpenModal={handleOpenModal}
        />
      </div>
    </div>
  );
}
