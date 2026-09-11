import { Winery } from "@/lib/types";
import { getWineryVibeTags } from "@/lib/utils/winery";

export interface WineryVibeScrollerProps {
  winery: Winery | null;
  compact?: boolean;
}

export function WineryVibeScroller({
  winery,
  compact = false,
}: WineryVibeScrollerProps) {
  if (!winery) return null;
  const vibeTags = getWineryVibeTags(winery);
  if (vibeTags.length === 0) return null;

  return (
    <div
      data-testid="vibe-tags-scroller"
      className={`overflow-x-auto scrollbar-none flex items-center py-1 flex-nowrap ${
        compact ? "gap-1.5" : "gap-2"
      }`}
    >
      {vibeTags.map((tag, idx) => (
        <span
          key={idx}
          className={`shrink-0 rounded-full font-semibold bg-primary/10 border border-primary/20 text-primary flex items-center gap-1.5 whitespace-nowrap ${
            compact ? "px-2.5 py-1 text-xs shadow-2xs" : "px-3 py-1.5 text-xs shadow-2xs"
          }`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export default WineryVibeScroller;
