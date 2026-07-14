// components/WineryDetails.tsx
import { useState } from "react";
import { Winery } from "@/lib/types";
import { 
  Star, 
  Phone, 
  Globe, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Dog, 
  Baby, 
  Sun, 
  Zap, 
  Car, 
  Accessibility, 
  Check, 
  X, 
  AlertTriangle,
  HelpCircle
} from "lucide-react";
import WineryQnA from "./WineryQnA";
import { isOpenNow } from "@/lib/utils/opening-hours";
import * as Accordion from "@radix-ui/react-accordion";
import { useWineryPhoto } from "@/hooks/use-winery-photo";
import { GeminiDisclosure } from "./GeminiDisclosure";
import { GoogleAttribution } from "./GoogleAttribution";
import { MapNavigation } from "./MapNavigation";

interface WineryDetailsProps {
  winery: Winery;
  loadingWineryId?: string | null;
}

function WineryImage({ photoRef, winery, className, alt = "Winery photo" }: { photoRef: string; winery: Winery; className?: string; alt?: string }) {
  const { imgSrc, cachePhoto } = useWineryPhoto(photoRef, winery);

  if (!imgSrc) return <div className={`bg-muted animate-pulse ${className}`} />;

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      onLoad={cachePhoto}
      loading="lazy"
    />
  );
}

interface AttributeStatusProps {
  value: boolean | null | undefined;
  questionId?: string;
  onSelectQuestion?: (id: string | null) => void;
}

function AttributeStatus({ value, questionId, onSelectQuestion }: AttributeStatusProps) {
  if (value === true) {
    return <Check className="h-3 w-3 text-green-500" data-testid="status-yes" />;
  }
  if (value === false) {
    return <X className="h-3 w-3 text-red-500" data-testid="status-no" />;
  }
  
  if (questionId && onSelectQuestion) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectQuestion(questionId);
        }}
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground underline decoration-dotted cursor-pointer"
        data-testid={`status-unknown-${questionId}`}
        title="Click to search reviews"
      >
        <HelpCircle className="h-3 w-3 text-gray-400" />
        <span>Unknown (Ask Reviews)</span>
      </button>
    );
  }
  
  return (
    <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" data-testid="status-unknown">
      <HelpCircle className="h-3 w-3 text-gray-400" />
      <span>Unknown</span>
    </div>
  );
}

export default function WineryDetails({ winery, loadingWineryId }: WineryDetailsProps) {
  const [showAllHours, setShowAllHours] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

  const getTodaysHours = () => {
    if (!winery.openingHours?.weekday_text) {
      return null;
    }
    const todayIndex = (new Date().getDay() + 6) % 7;
    const todaysLine = winery.openingHours.weekday_text[todayIndex];
    const hours = todaysLine.substring(todaysLine.indexOf(':') + 2);
    return hours;
  };
  
  const isOpen = isOpenNow(winery.openingHours);

  const isLoading = loadingWineryId === winery.id;
  const isEnrichmentPending = !winery.enrichment_tier && !winery.generative_summary;
  const hasServiceLimitError = 
    winery.enrichment_tier === 'enriched' && 
    !winery.generative_summary && 
    !winery.primary_photo_reference;

  return (
    <div className="text-sm text-muted-foreground space-y-2 pt-2 mt-2!">
      {/* Premium Hero Image and Photo Grid */}
      {winery.primary_photo_reference && (
        <div className="space-y-2 mb-4">
          <div className="relative h-48 w-full overflow-hidden rounded-lg border bg-muted">
            <WineryImage
              photoRef={winery.primary_photo_reference}
              winery={winery}
              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              alt={`${winery.name} hero photo`}
            />
          </div>
          {winery.photo_references && winery.photo_references.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {winery.photo_references
                .filter(ref => ref !== winery.primary_photo_reference)
                .slice(0, 4)
                .map((ref, idx) => (
                  <div key={ref} className="relative h-16 overflow-hidden rounded-md border bg-muted">
                    <WineryImage
                      photoRef={ref}
                      winery={winery}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-110"
                      alt={`${winery.name} photo ${idx + 1}`}
                    />
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Stable Gemini Insight Container */}
      <div 
        className="stable-gemini-container my-3" 
        data-state={isLoading || isEnrichmentPending ? "loading" : (hasServiceLimitError ? "error" : "ready")}
      >
        {isLoading || isEnrichmentPending ? (
          <div className="space-y-2 p-3 rounded-lg border border-dashed animate-pulse">
            <div className="h-4 bg-muted rounded w-1/4" />
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-5/6" />
          </div>
        ) : hasServiceLimitError ? (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-900/50 rounded-lg text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
            <span>Service Limited: Rich details and AI summaries are currently unavailable.</span>
          </div>
        ) : winery.generative_summary ? (
          <div className="relative p-3.5 rounded-lg bg-gradient-to-r from-purple-500/5 to-indigo-500/5 border border-purple-500/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-semibold text-xs">
                <Sparkles className="w-3.5 h-3.5 fill-purple-600/10 animate-pulse" />
                <span>Gemini Insight</span>
              </div>
              <GeminiDisclosure />
            </div>
            <p className="text-xs leading-relaxed text-foreground">{winery.generative_summary}</p>
          </div>
        ) : null}
      </div>

      <MapNavigation address={winery.address} wineryName={winery.name} />

      {winery.phone && (
        <div className="flex items-center space-x-2">
          <Phone className="w-4 h-4 shrink-0" />
          <span>{winery.phone}</span>
        </div>
      )}
      {winery.website && (
        <div className="flex items-center space-x-2">
          <Globe className="w-4 h-4 shrink-0" />
          <a href={winery.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
            Visit Website
          </a>
        </div>
      )}
      {winery.openingHours && (winery.openingHours.weekday_text || winery.openingHours.open_now !== undefined) && (
        <div className="flex items-start space-x-2">
          <Clock className="w-4 h-4 mt-1 shrink-0" />
          <div>
            <div className="flex items-center">
              {(isOpen !== null || winery.openingHours.open_now !== undefined) && (
                <span
                  className={`font-semibold mr-2 ${
                    (isOpen ?? winery.openingHours.open_now) ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {(isOpen ?? winery.openingHours.open_now) ? 'Open' : 'Closed'}
                </span>
              )}
              {getTodaysHours() && <span className="text-sm">{getTodaysHours()}</span>}
              {winery.openingHours.weekday_text && winery.openingHours.weekday_text.length > 0 && (
                <button 
                  onClick={() => setShowAllHours(!showAllHours)} 
                  className="ml-2 p-1 rounded-full hover:bg-gray-100"
                  data-testid="hours-toggle"
                >
                  {showAllHours ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              )}
            </div>
            {showAllHours && winery.openingHours.weekday_text && (
              <div className="mt-2 text-sm space-y-1">
                {winery.openingHours.weekday_text.map((line, index) => (
                  <div key={index}>{line}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {winery.rating && (
        <div className="flex items-center space-x-2">
          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
          <div className="flex items-center gap-1.5">
            <span>{winery.rating}/5.0</span>
            {winery.userRatingCount && (
              <span className="text-xs text-muted-foreground">
                ({winery.userRatingCount.toLocaleString()})
              </span>
            )}
            <GoogleAttribution variant="reviews" />
          </div>
        </div>
      )}

      {/* Accordions Section */}
      <Accordion.Root type="multiple" className="w-full space-y-2 mt-4">
        {winery.neighborhood_summary && (
          <Accordion.Item value="about-area" className="border rounded-lg overflow-hidden bg-card text-card-foreground">
            <Accordion.Header className="flex">
              <Accordion.Trigger className="flex flex-1 items-center justify-between py-2.5 px-3.5 font-medium hover:bg-muted/50 transition-all text-xs text-left">
                <span>About the Area</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="px-3.5 pb-3.5 pt-1.5 text-xs text-muted-foreground border-t bg-muted/5">
              <p className="leading-relaxed">{winery.neighborhood_summary}</p>
              <GoogleAttribution className="mt-2 justify-end" variant="powered-by" />
            </Accordion.Content>
          </Accordion.Item>
        )}

        <Accordion.Item value="logistics-accessibility" className="border rounded-lg overflow-hidden bg-card text-card-foreground">
          <Accordion.Header className="flex">
            <Accordion.Trigger className="flex flex-1 items-center justify-between py-2.5 px-3.5 font-medium hover:bg-muted/50 transition-all text-xs text-left">
              <span>Logistics & Accessibility</span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="px-3.5 pb-3.5 pt-2 text-xs text-muted-foreground border-t bg-muted/5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Car className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span className="text-[11px]">Free Parking:</span>
                <AttributeStatus 
                  value={winery.parking_options?.freeParking} 
                  questionId="parking" 
                  onSelectQuestion={setActiveQuestionId} 
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span className="text-[11px]">EV Charging:</span>
                <AttributeStatus 
                  value={winery.has_ev_charging} 
                  questionId="ev_charging" 
                  onSelectQuestion={setActiveQuestionId} 
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Accessibility className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span className="text-[11px]">Wheelchair Acc.:</span>
                <AttributeStatus 
                  value={winery.accessibility_options?.wheelchairAccessibleEntrance} 
                  questionId="wheelchair" 
                  onSelectQuestion={setActiveQuestionId} 
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Sun className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span className="text-[11px]">Outdoor:</span>
                <AttributeStatus 
                  value={winery.outdoor_seating} 
                  questionId="outdoor" 
                  onSelectQuestion={setActiveQuestionId} 
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Dog className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span className="text-[11px]">Dogs Allowed:</span>
                <AttributeStatus 
                  value={winery.allows_dogs} 
                  questionId="dogs" 
                  onSelectQuestion={setActiveQuestionId} 
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Baby className="h-3.5 w-3.5 text-muted-foreground/70" />
                <span className="text-[11px]">Kid Friendly:</span>
                <AttributeStatus 
                  value={winery.good_for_children} 
                  questionId="kids" 
                  onSelectQuestion={setActiveQuestionId} 
                />
              </div>
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>

      <WineryQnA 
        winery={winery} 
        activeQuestionId={activeQuestionId} 
        setActiveQuestionId={setActiveQuestionId} 
      />
    </div>
  );
}
