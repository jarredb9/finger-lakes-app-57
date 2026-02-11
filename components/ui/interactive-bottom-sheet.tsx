"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, X } from "lucide-react";

export type SheetMode = "mini" | "full";

interface InteractiveBottomSheetProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: SheetMode;
  onModeChange: (mode: SheetMode) => void;
  title: React.ReactNode;
  children: React.ReactNode;
}

export function InteractiveBottomSheet({
  isOpen,
  onOpenChange,
  mode,
  onModeChange,
  title,
  children,
  className,
  ...props
}: InteractiveBottomSheetProps) {
  const touchStart = useRef<number | null>(null);

  const toggleSize = () => {
    onModeChange(mode === "mini" ? "full" : "mini");
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchEnd - touchStart.current;

    // Swipe Down (Positive difference)
    if (diff > 50) {
      if (mode === "full") {
        onModeChange("mini");
      } else {
        onOpenChange(false);
      }
    }
    // Swipe Up (Negative difference)
    else if (diff < -50) {
       if (mode === "mini") {
         onModeChange("full");
       }
    }
    touchStart.current = null;
  };

  return (
    isOpen && (
        <div
          {...props}
          className={cn(
            "fixed bottom-16 left-0 right-0 z-40 bg-background border-t rounded-t-[15px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] flex flex-col",
            "transition-transform duration-300 ease-out will-change-transform",
            mode === "full" ? "h-[calc(100vh-4rem)] top-4" : "h-[45vh]",
            "translate-y-0 pointer-events-auto",
            className
          )}
        >
          {/* Sheet Header / Handle */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/10 shrink-0 w-full rounded-t-[15px] relative">
            {/* Toggle Area (Expand/Collapse) */}
            <div
              className="flex-1 flex items-center cursor-pointer active:bg-muted/20 transition-colors touch-none"
              onClick={toggleSize}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              role="button"
              aria-label={mode === "mini" ? "Expand to full screen" : "Minimize to half screen"}
            >
              <div className="flex-1 text-left truncate pr-2">
                <div className="text-sm font-semibold text-foreground">{title}</div>
              </div>

              {/* Controls */}
              <div className="h-8 w-8 flex items-center justify-center text-muted-foreground mr-8">
                {mode === "full" ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </div>
            </div>

            {/* Drag Handle Visual */}
            <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full absolute left-1/2 -translate-x-1/2 top-1.5 pointer-events-none" aria-hidden="true" />

            {/* Close Button (Independent) */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div
                role="button"
                tabIndex={0}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-muted/50 hover:bg-muted text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChange(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onOpenChange(false);
                  }
                }}
                aria-label="Close sheet"
              >
                <X className="h-4 w-4" />
              </div>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-hidden relative bg-background">
             {children}
          </div>
        </div>
    )
  );
}
