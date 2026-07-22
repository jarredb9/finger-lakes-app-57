// components/WineryVarietalsTab.tsx
import React from "react";
import { WineryVarietal } from "@/lib/types";
import { Wine, Sparkles } from "lucide-react";

interface WineryVarietalsTabProps {
  varietals?: WineryVarietal[];
  geminiTastingNotes?: string;
  reviews?: Array<{ text?: string; user_review?: string }> | null;
}

const COMMON_VARIETALS = [
  "Dry Riesling",
  "Riesling",
  "Cabernet Franc",
  "Ice Wine",
  "Gewürztraminer",
  "Chardonnay",
  "Pinot Noir",
  "Pinot Gris",
  "Merlot",
  "Rosé",
  "Sparkling Wine",
];

export default function WineryVarietalsTab({
  varietals,
  geminiTastingNotes,
  reviews = [],
}: WineryVarietalsTabProps) {
  // If no explicit varietals provided, perform fallback scanning of reviews
  const activeVarietals: WineryVarietal[] = React.useMemo(() => {
    if (varietals && varietals.length > 0) {
      return varietals;
    }

    const reviewTexts = (reviews || [])
      .map((r) => r.text || r.user_review || "")
      .join(" ");

    const detected = COMMON_VARIETALS.filter((v) =>
      new RegExp(`\\b${v}\\b`, "i").test(reviewTexts)
    );

    if (detected.length === 0) {
      return [
        {
          name: "Riesling",
          description: "Signature Finger Lakes white wine known for bright acidity and fruit notes.",
          sweetness: 3,
          body: 3,
        },
      ];
    }

    return detected.map((name) => ({
      name,
      description: `Discovered in guest reviews at this winery.`,
      sweetness: 3,
      body: 4,
    }));
  }, [varietals, reviews]);

  return (
    <div className="space-y-4" data-testid="varietals-tab-content">
      {/* Gemini AI Tasting Notes */}
      {(() => {
        const notesText = typeof geminiTastingNotes === 'string' 
          ? geminiTastingNotes 
          : (geminiTastingNotes as any)?.overview?.text || (geminiTastingNotes as any)?.text;
        if (!notesText) return null;
        return (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sommelier AI Tasting Notes</span>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed font-medium">
              {notesText}
            </p>
          </div>
        );
      })()}

      {/* Grape Varietal Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Wine className="w-3.5 h-3.5" />
          <span>Featured Wines & Flavor Profiles</span>
        </h3>

        <div className="grid grid-cols-1 gap-3">
          {activeVarietals.map((v, i) => {
            const sweetnessVal = v.sweetness ?? v.dryness ?? 3;
            const bodyVal = v.body ?? 5;
            const descriptionText = v.description || v.tasting_notes;

            return (
              <div
                key={`${v.name}-${i}`}
                className="bg-card border border-border/50 rounded-xl p-4 space-y-3 shadow-xs"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{v.name}</h4>
                    {descriptionText && (
                      <p className="text-xs text-muted-foreground mt-0.5">{descriptionText}</p>
                    )}
                  </div>
                  {v.price && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                      {v.price}
                    </span>
                  )}
                </div>

                {/* Flavor Sliders */}
                <div className="space-y-2 pt-1 border-t border-border/30">
                  {/* Sweetness Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                      <span>Dry</span>
                      <span className="font-semibold text-foreground">Sweetness</span>
                      <span>Sweet</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="range"
                        role="slider"
                        aria-label={`${v.name} sweetness`}
                        min={1}
                        max={10}
                        value={sweetnessVal}
                        readOnly
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-default accent-primary"
                      />
                    </div>
                  </div>

                  {/* Body Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                      <span>Light</span>
                      <span className="font-semibold text-foreground">Body</span>
                      <span>Full</span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="range"
                        role="slider"
                        aria-label={`${v.name} body`}
                        min={1}
                        max={10}
                        value={bodyVal}
                        readOnly
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-default accent-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
