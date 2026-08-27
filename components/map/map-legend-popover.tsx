"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface LegendItem {
  label: string;
  color: string;
  borderColor?: string;
  description?: string;
}

export const DEFAULT_LEGEND_ITEMS: LegendItem[] = [
  { label: "Trip Stop", color: "#f17e3a", borderColor: "#d26e32" },
  { label: "Favorite", color: "#FBBF24", borderColor: "#F59E0B" },
  { label: "Want to Go", color: "#9333ea", borderColor: "#7e22ce" },
  { label: "Visited", color: "#10B981", borderColor: "#059669" },
  { label: "Discovered", color: "#3B82F6", borderColor: "#2563EB" },
];

export interface MapLegendPopoverProps {
  items?: LegendItem[];
  triggerClassName?: string;
  align?: "start" | "center" | "end";
  className?: string;
}

export function MapLegendPopover({
  items = DEFAULT_LEGEND_ITEMS,
  triggerClassName,
  align = "end",
  className,
}: MapLegendPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 px-2 text-xs text-muted-foreground hover:text-foreground",
            triggerClassName
          )}
          aria-label="Map Legend"
        >
          <Info className="w-3 h-3 mr-1" />
          Legend
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-56", className)} align={align}>
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Map Legend</h4>
          <div className="grid gap-2">
            {items.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{
                    backgroundColor: item.color,
                    borderColor: item.borderColor || item.color,
                    borderWidth: "1px",
                    borderStyle: "solid",
                  }}
                />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

