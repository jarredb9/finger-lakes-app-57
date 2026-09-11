"use client";

import React from "react";
import { Winery, Visit } from "@/lib/types";
import { WineryModalTab } from "./use-winery-modal-state";
import { WineryCommunityTab } from "../WineryCommunityTab";
import { WineryDetails } from "../WineryDetails";
import { WineryVarietalsTab } from "../WineryVarietalsTab";
import TripPlannerSection from "../TripPlannerSection";
import VisitCardHistory from "../VisitCardHistory";
import { Calendar as CalendarIcon } from "lucide-react";

export interface WineryModalTabsListProps {
  effectiveActiveTab: WineryModalTab;
  setActiveTab: (tab: WineryModalTab) => void;
  isAIEnabled?: boolean;
  size?: "sm" | "md";
}

export function WineryModalTabsList({
  effectiveActiveTab,
  setActiveTab,
  isAIEnabled = false,
  size = "md",
}: WineryModalTabsListProps) {
  const tabs = [
    { id: "community", label: "Community" },
    { id: "amenities", label: "Amenities" },
    ...(isAIEnabled ? [{ id: "ai_insights", label: "AI Insights" }] : []),
    { id: "varietals", label: "Varietals" },
    { id: "visits", label: "Visits" },
    { id: "trip", label: "Trip" },
  ];

  return (
    <div
      className="flex border-b border-border/50 w-full overflow-x-auto scrollbar-none flex-nowrap justify-between shrink-0"
      role="tablist"
    >
      {tabs.map((t) => {
        const isActive = effectiveActiveTab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveTab(t.id as WineryModalTab)}
            className={`font-semibold border-b-2 transition-all duration-200 whitespace-nowrap shrink-0 ${
              size === "sm"
                ? "py-2 px-3 text-xs"
                : "py-2.5 px-3.5 text-xs md:text-sm"
            } ${
              isActive
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export interface WineryModalTabContentProps {
  winery: Winery | null;
  effectiveActiveTab: WineryModalTab;
  isAIEnabled?: boolean;
  loadingWineryId?: string | null;
  visits?: Visit[];
  visitHistoryRef?: React.RefObject<HTMLDivElement | null>;
  onEditVisit?: (visit: Visit) => void;
  onDeleteVisit?: (visitId: string) => void;
  onClose?: () => void;
}

export function WineryModalTabContent({
  winery,
  effectiveActiveTab,
  isAIEnabled = false,
  loadingWineryId = null,
  visits = [],
  visitHistoryRef,
  onEditVisit = () => {},
  onDeleteVisit = () => {},
  onClose = () => {},
}: WineryModalTabContentProps) {
  if (!winery) return null;

  switch (effectiveActiveTab) {
    case "community":
      return <WineryCommunityTab wineryDbId={winery.dbId ?? null} />;
    case "amenities":
      return (
        <WineryDetails
          winery={winery}
          loadingWineryId={loadingWineryId}
          mode="logistics"
        />
      );
    case "ai_insights":
      return isAIEnabled ? (
        <WineryDetails
          winery={winery}
          loadingWineryId={loadingWineryId}
          mode="ai_insights"
        />
      ) : (
        <WineryCommunityTab wineryDbId={winery.dbId ?? null} />
      );
    case "varietals":
      return (
        <WineryVarietalsTab
          varietals={winery.varietals ?? undefined}
          reviews={winery.reviews}
        />
      );
    case "visits":
      return (
        <div className="space-y-4" data-testid="visits-tab-content">
          <div className="flex justify-between items-center">
            <h3 className="text-xs md:text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CalendarIcon className="w-4 h-4" />
              <span>Your Visits</span>
            </h3>
          </div>
          {visits.length > 0 ? (
            <div ref={visitHistoryRef}>
              <VisitCardHistory
                visits={visits}
                editingVisitId={null}
                onEditClick={onEditVisit}
                onDeleteVisit={onDeleteVisit}
                onTogglePhotoForDeletion={() => {}}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              {winery.userVisited
                ? "You haven't reviewed any visits here yet."
                : "You haven't visited this winery yet."}
            </p>
          )}
        </div>
      );
    case "trip":
      return <TripPlannerSection winery={winery} onClose={onClose} />;
    default:
      return null;
  }
}
