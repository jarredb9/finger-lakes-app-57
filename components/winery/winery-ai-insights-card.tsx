// components/winery/winery-ai-insights-card.tsx
import { Winery } from "@/lib/types";
import { Sparkles, AlertTriangle } from "lucide-react";
import { GeminiDisclosure } from "../GeminiDisclosure";
import { GoogleAttribution } from "../GoogleAttribution";

interface WineryAIInsightsCardProps {
  winery: Winery;
  loadingWineryId?: string | null;
}

export function WineryAIInsightsCard({ winery, loadingWineryId }: WineryAIInsightsCardProps) {
  const getSummaryText = (summary: unknown): string | null => {
    if (!summary) return null;
    if (typeof summary === 'string') return summary;
    if (typeof summary === 'object' && summary !== null) {
      const s = summary as Record<string, unknown>;
      const overview = s.overview as Record<string, unknown> | undefined;
      return (typeof overview?.text === 'string' ? overview.text : null) || (typeof s.text === 'string' ? s.text : null);
    }
    return null;
  };

  const genSummaryText = getSummaryText(winery.generative_summary);
  const neighSummaryText = getSummaryText(winery.neighborhood_summary);

  const isLoading = loadingWineryId === winery.id;
  const isEnrichmentPending = !winery.enrichment_tier && !genSummaryText;
  const hasServiceLimitError = 
    winery.enrichment_tier === 'enriched' && 
    !genSummaryText && 
    !winery.primary_photo_reference;

  return (
    <div className="space-y-3">
      {/* Stable Gemini Insight Container */}
      <div 
        className="stable-gemini-container" 
        data-state={isLoading || isEnrichmentPending ? "loading" : (hasServiceLimitError ? "error" : "ready")}
      >
        {isLoading || isEnrichmentPending ? (
          <div className="space-y-2 p-3.5 rounded-lg border border-dashed animate-pulse">
            <div className="h-4 bg-muted rounded w-1/4" />
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-5/6" />
          </div>
        ) : hasServiceLimitError ? (
          <div className="p-3.5 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-900/50 rounded-lg text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
            <span>Service Limited: Rich details and AI summaries are currently unavailable.</span>
          </div>
        ) : genSummaryText ? (
          <div 
            data-testid="gemini-summary"
            className="relative p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/20 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-semibold text-xs">
                <Sparkles className="w-3.5 h-3.5 fill-purple-600/10 animate-pulse" />
                <span>Gemini Insight</span>
              </div>
              <GeminiDisclosure />
            </div>
            <p className="text-xs leading-relaxed text-foreground">{genSummaryText}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground p-4 text-center border rounded-xl border-dashed">No AI summaries generated yet.</p>
        )}
      </div>

      {neighSummaryText && (
        <div className="p-4 rounded-xl border border-border/50 bg-muted/40 backdrop-blur-md shadow-sm space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">About the Area</h4>
          <p className="text-xs leading-relaxed text-foreground">{neighSummaryText}</p>
          <GoogleAttribution className="mt-2 justify-end" variant="powered-by" />
        </div>
      )}
    </div>
  );
}
