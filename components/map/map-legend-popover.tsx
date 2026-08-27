export interface LegendItem {
  label: string;
  color: string;
  borderColor?: string;
  description?: string;
}

export const DEFAULT_LEGEND_ITEMS: LegendItem[] = [];

export interface MapLegendPopoverProps {
  items?: LegendItem[];
  triggerClassName?: string;
  align?: "start" | "center" | "end";
}

export function MapLegendPopover(_props: MapLegendPopoverProps) {
  return null;
}
