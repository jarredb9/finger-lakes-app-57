// components/WineryDetails.tsx
import { useState, useEffect } from "react";
import { Winery } from "@/lib/types";
import { X, ChevronDown } from "lucide-react";
import * as Accordion from "@radix-ui/react-accordion";
import { GoogleAttribution } from "./GoogleAttribution";
import { WineryImage } from "./winery/winery-image";
import { AttributeStatus, AccordionAttributeStatus } from "./winery/attribute-status";
import { WineryInfoCard } from "./winery/winery-info-card";
import { WineryAmenitiesList, WineryLogisticsAccordion } from "./winery/winery-amenities-list";
import { WineryAIInsightsCard } from "./winery/winery-ai-insights-card";
import WineryQnA from "./WineryQnA";

export { 
  WineryImage, 
  AttributeStatus, 
  AccordionAttributeStatus,
  WineryInfoCard,
  WineryAmenitiesList,
  WineryLogisticsAccordion,
  WineryAIInsightsCard
};

export interface WineryDetailsProps {
  winery: Winery;
  loadingWineryId?: string | null;
  mode?: "full" | "info" | "logistics" | "ai_insights";
}

export function WineryDetails({ winery, loadingWineryId, mode = "full" }: WineryDetailsProps) {
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const renderPhotoSection = () => {
    if (!winery.primary_photo_reference && (!winery.photo_references || winery.photo_references.length === 0)) {
      return null;
    }

    const allPhotos = winery.photo_references && winery.photo_references.length > 0
      ? winery.photo_references
      : winery.primary_photo_reference ? [winery.primary_photo_reference] : [];

    return (
      <div className="space-y-2 mb-4">
        {/* Main Photo */}
        <div 
          onClick={() => setLightboxPhoto(allPhotos[0])}
          className="relative h-48 w-full overflow-hidden rounded-lg border border-border/50 bg-muted cursor-pointer group"
          data-testid="hero-photo-container"
        >
          <WineryImage
            photoRef={allPhotos[0]}
            winery={winery}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            alt={`${winery.name} hero photo`}
          />
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
            Click to view full photo
          </div>
        </div>

        {/* Thumbnail Carousel Strip */}
        {allPhotos.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {allPhotos.slice(1, 5).map((ref, idx) => (
              <div 
                key={ref} 
                onClick={() => setLightboxPhoto(ref)}
                className="relative h-16 overflow-hidden rounded-md border border-border/50 bg-muted cursor-pointer group"
              >
                <WineryImage
                  photoRef={ref}
                  winery={winery}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                  alt={`${winery.name} photo ${idx + 1}`}
                />
              </div>
            ))}
          </div>
        )}

        {/* Lightbox Dialog */}
        {lightboxPhoto && (
          <div 
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            data-testid="photo-lightbox-modal"
            onClick={() => setLightboxPhoto(null)}
          >
            <div className="relative max-w-3xl max-h-[90vh] w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                data-testid="close-lightbox-button"
                onClick={() => setLightboxPhoto(null)}
                className="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                aria-label="Close Lightbox"
              >
                <X className="w-5 h-5" />
              </button>
              <WineryImage
                photoRef={lightboxPhoto}
                winery={winery}
                className="max-h-[85vh] w-auto max-w-full object-contain rounded-lg shadow-2xl"
                alt={`${winery.name} enlarged photo`}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  if (mode === "ai_insights") {
    return (
      <div className="text-sm text-muted-foreground space-y-4">
        <WineryAIInsightsCard winery={winery} loadingWineryId={loadingWineryId} />
        {!activeQuestionId && (
          <div className="hidden" data-testid="winery-qna-wrapper">
            <WineryQnA 
              winery={winery} 
              activeQuestionId={activeQuestionId} 
              setActiveQuestionId={setActiveQuestionId} 
            />
          </div>
        )}
      </div>
    );
  }

  if (mode === "info") {
    return (
      <div className="space-y-4">
        <WineryInfoCard winery={winery} isMobile={isMobile} />
        {!activeQuestionId && (
          <div className="hidden" data-testid="winery-qna-wrapper">
            <WineryQnA 
              winery={winery} 
              activeQuestionId={activeQuestionId} 
              setActiveQuestionId={setActiveQuestionId} 
            />
          </div>
        )}
      </div>
    );
  }

  if (mode === "logistics") {
    return (
      <WineryAmenitiesList
        winery={winery}
        activeQuestionId={activeQuestionId}
        onSelectQuestion={setActiveQuestionId}
        isMobile={isMobile}
      />
    );
  }

  return (
    <div className="text-sm text-muted-foreground space-y-4 pt-2 mt-2!">
      {renderPhotoSection()}

      {/* Info Card */}
      <WineryInfoCard winery={winery} isMobile={isMobile} />

      {/* AI Insights */}
      <div className="mt-4">
        <WineryAIInsightsCard winery={winery} loadingWineryId={loadingWineryId} />
      </div>

      {/* Accordions Section */}
      <div className="w-full space-y-2 mt-4">
        {winery.neighborhood_summary && (
          <Accordion.Root type="multiple" className="w-full space-y-2">
            <Accordion.Item value="about-area" className="border border-border/50 rounded-lg overflow-hidden bg-muted/40 backdrop-blur-md shadow-sm text-card-foreground">
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
          </Accordion.Root>
        )}

        <WineryLogisticsAccordion winery={winery} onSelectQuestion={setActiveQuestionId} />
      </div>

      {/* Amenities Overview */}
      <div className="pt-2 border-t border-border/50 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Amenities Overview</h4>
        <WineryAmenitiesList
          winery={winery}
          activeQuestionId={activeQuestionId}
          onSelectQuestion={setActiveQuestionId}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

export default WineryDetails;
