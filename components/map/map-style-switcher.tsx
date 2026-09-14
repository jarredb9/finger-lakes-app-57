"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Compass, Navigation } from "lucide-react";

export type MapStyleType = "streets" | "outdoors";

export interface MapStyleSwitcherProps {
  currentStyle: MapStyleType;
  onStyleChange: (style: MapStyleType) => void;
  className?: string;
}

export const MapStyleSwitcher = memo(({
  currentStyle,
  onStyleChange,
  className = "",
}: MapStyleSwitcherProps) => {
  return (
    <div
      data-testid="map-style-switcher"
      className={`absolute top-4 left-4 z-30 flex gap-1 bg-background/95 backdrop-blur-sm p-1 rounded-lg border shadow-md ${className}`}
    >
      <Button
        size="sm"
        variant={currentStyle === "outdoors" ? "default" : "ghost"}
        onClick={() => onStyleChange("outdoors")}
        className="h-7 px-2.5 text-xs gap-1.5"
      >
        <Compass className="h-3.5 w-3.5" />
        <span>Outdoors</span>
      </Button>
      <Button
        size="sm"
        variant={currentStyle === "streets" ? "default" : "ghost"}
        onClick={() => onStyleChange("streets")}
        className="h-7 px-2.5 text-xs gap-1.5"
      >
        <Navigation className="h-3.5 w-3.5" />
        <span>Streets</span>
      </Button>
    </div>
  );
});

MapStyleSwitcher.displayName = "MapStyleSwitcher";
