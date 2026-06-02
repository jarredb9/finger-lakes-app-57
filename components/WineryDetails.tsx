// components/WineryDetails.tsx
import { useState } from "react";
import { Winery } from "@/lib/types";
import { 
  Star, 
  Phone, 
  Globe, 
  MapPin, 
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
  AlertTriangle 
} from "lucide-react";
import { Separator } from "./ui/separator";
import WineryQnA from "./WineryQnA";
import { isOpenNow } from "@/lib/utils/opening-hours";
import { useWineryStore } from "@/lib/stores/wineryStore";
import * as Accordion from "@radix-ui/react-accordion";

interface WineryDetailsProps {
  winery: Winery;
}

function WineryImage({ photoRef, winery, className, alt = "Winery photo" }: { photoRef: string; winery: Winery; className?: string; alt?: string }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const updateWinery = useWineryStore((state) => state.updateWinery);

  const imgSrc = (winery.cached_photos && winery.cached_photos[photoRef])
    ? winery.cached_photos[photoRef]
    : apiKey
      ? `https://places.googleapis.com/v1/${photoRef}/media?key=${apiKey}&maxWidthPx=800`
      : null;

  const handleLoad = async () => {
    if (winery.cached_photos && winery.cached_photos[photoRef]) {
      return;
    }
    if (!apiKey) return;
    try {
      const url = `https://places.googleapis.com/v1/${photoRef}/media?key=${apiKey}&maxWidthPx=800`;
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const currentCached = winery.cached_photos || {};
        updateWinery(winery.id, {
          cached_photos: {
            ...currentCached,
            [photoRef]: base64
          }
        });
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.warn("Error caching image:", e);
    }
  };

  if (!imgSrc) return <div className={`bg-muted animate-pulse ${className}`} />;

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      onLoad={handleLoad}
      loading="lazy"
    />
  );
}

export default function WineryDetails({ winery }: WineryDetailsProps) {
  const [showAllHours, setShowAllHours] = useState(false);
  const loadingWineryId = useWineryStore((state) => state.loadingWineryId);

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
              <span className="text-[10px] text-muted-foreground/80 italic">Summarized with Gemini</span>
            </div>
            <p className="text-xs leading-relaxed text-foreground">{winery.generative_summary}</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-start space-x-2">
        <MapPin className="w-4 h-4 mt-1 shrink-0" />
        <span>{winery.address}</span>
      </div>
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
      {winery.openingHours && (
        <div className="flex items-start space-x-2">
          <Clock className="w-4 h-4 mt-1 shrink-0" />
          <div>
            <div className="flex items-center">
              {isOpen !== null && (
                <span
                  className={`font-semibold mr-2 ${
                    isOpen ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {isOpen ? 'Open' : 'Closed'}
                </span>
              )}
              <span className="text-sm">{getTodaysHours()}</span>
              {winery.openingHours.weekday_text && (
                <button onClick={() => setShowAllHours(!showAllHours)} className="ml-2 p-1 rounded-full hover:bg-gray-100">
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
          <span>{winery.rating}/5.0 (Google Reviews)</span>
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
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <Dog className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span>Dog Friendly:</span>
                {winery.allows_dogs === true ? (
                  <Check className="w-4 h-4 text-green-600 font-bold" />
                ) : winery.allows_dogs === false ? (
                  <X className="w-4 h-4 text-red-600" />
                ) : (
                  <span className="text-muted-foreground/60 italic">Unknown</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Baby className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span>Kid Friendly:</span>
                {winery.good_for_children === true ? (
                  <Check className="w-4 h-4 text-green-600 font-bold" />
                ) : winery.good_for_children === false ? (
                  <X className="w-4 h-4 text-red-600" />
                ) : (
                  <span className="text-muted-foreground/60 italic">Unknown</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span>Outdoor Seating:</span>
                {winery.outdoor_seating === true ? (
                  <Check className="w-4 h-4 text-green-600 font-bold" />
                ) : winery.outdoor_seating === false ? (
                  <X className="w-4 h-4 text-red-600" />
                ) : (
                  <span className="text-muted-foreground/60 italic">Unknown</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span>EV Charging:</span>
                {winery.has_ev_charging === true ? (
                  <Check className="w-4 h-4 text-green-600 font-bold" />
                ) : winery.has_ev_charging === false ? (
                  <X className="w-4 h-4 text-red-600" />
                ) : (
                  <span className="text-muted-foreground/60 italic">Unknown</span>
                )}
              </div>
            </div>

            {/* Parking Options */}
            {winery.parking_options && Object.keys(winery.parking_options).length > 0 && (
              <div className="border-t pt-2.5 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px]">
                  <Car className="w-3.5 h-3.5" />
                  <span>Parking Options</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 pl-5 text-[11px]">
                  {Object.entries(winery.parking_options).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1">
                      <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                      {val === true ? <Check className="w-3.5 h-3.5 text-green-600" /> : <X className="w-3.5 h-3.5 text-red-500" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accessibility Options */}
            {winery.accessibility_options && Object.keys(winery.accessibility_options).length > 0 && (
              <div className="border-t pt-2.5 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px]">
                  <Accessibility className="w-3.5 h-3.5" />
                  <span>Accessibility</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 pl-5 text-[11px]">
                  {Object.entries(winery.accessibility_options).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1">
                      <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                      {val === true ? <Check className="w-3.5 h-3.5 text-green-600" /> : <X className="w-3.5 h-3.5 text-red-500" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>

      {((winery.reviews && winery.reviews.length > 0) || winery.reservable !== undefined) && (
        <>
          <Separator className="my-4!" />
          <WineryQnA winery={winery} />
        </>
      )}
    </div>
  );
}
