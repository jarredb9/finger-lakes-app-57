import { useEffect, useRef, useState, useMemo } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Winery } from "@/lib/types";
import { WineryImage } from "./winery-image";

export interface HeroPhotoCarouselProps {
  winery: Winery;
  isFull?: boolean;
  isMobile?: boolean;
  onPhotoClick?: (photoRef: string) => void;
  initialPhotoRef?: string | null;
  isLightbox?: boolean;
  onPhotoSelect?: (photoRef: string) => void;
}

export function HeroPhotoCarousel({
  winery,
  isMobile,
  onPhotoClick,
  initialPhotoRef,
  isLightbox = false,
  onPhotoSelect,
}: HeroPhotoCarouselProps) {
  const photos = useMemo<string[]>(() => {
    return winery?.photo_references?.length
      ? winery.photo_references
      : winery?.primary_photo_reference
      ? [winery.primary_photo_reference]
      : [];
  }, [winery]);

  const initialIndex = useMemo(() => {
    if (!initialPhotoRef) return 0;
    const idx = photos.indexOf(initialPhotoRef);
    return idx > 0 ? idx : 0;
  }, [initialPhotoRef, photos]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const activeIndexRef = useRef(initialIndex);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    startIndex: initialIndex,
    watchSlides: false,
    watchResize: false,
  });

  // Handle slide selection and preserve position on any internal reInit
  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      const index = emblaApi.selectedScrollSnap();
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        setCurrentIndex(index);
        if (photos[index]) {
          onPhotoSelect?.(photos[index]);
        }
      }
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    };

    const onReInit = () => {
      if (activeIndexRef.current > 0 && activeIndexRef.current < photos.length) {
        emblaApi.scrollTo(activeIndexRef.current, true);
      }
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    };

    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onReInit);

    // Initial button state sync
    onSelect();

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onReInit);
    };
  }, [emblaApi, photos, onPhotoSelect]);

  if (!photos.length) {
    return <div className="h-full w-full bg-gradient-to-r from-muted/30 to-muted/10" />;
  }

  // Render a single static image on mobile viewports to prevent horizontal vs vertical swipe gesture conflicts
  if (isMobile && !isLightbox) {
    return (
      <div
        className="relative h-full w-full overflow-hidden cursor-pointer"
        onClick={() => onPhotoClick?.(photos[0])}
      >
        <WineryImage
          photoRef={photos[0]}
          winery={winery}
          className="h-full w-full object-cover"
          alt={`${winery.name} hero photo`}
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full group overflow-hidden pointer-events-auto">
      <div className="overflow-hidden h-full w-full" ref={emblaRef}>
        <div className="flex h-full w-full">
          {photos.map((ref, idx) => (
            <div
              key={`${ref}-${idx}`}
              className="h-full shrink-0 relative cursor-pointer min-w-0 flex-[0_0_100%]"
              onClick={() => onPhotoClick?.(ref)}
            >
              <WineryImage
                photoRef={ref}
                winery={winery}
                className="h-full w-full object-cover"
                alt={`${winery.name} photo ${idx + 1}`}
              />
            </div>
          ))}
        </div>
      </div>

      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (canScrollPrev && emblaApi) {
              emblaApi.scrollPrev();
            }
          }}
          className={`absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white transition-all duration-300 ${
            canScrollPrev ? "opacity-100 scale-100 cursor-pointer" : "opacity-0 scale-90 pointer-events-none"
          }`}
          aria-label="Previous photo"
          disabled={!canScrollPrev}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {photos.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (canScrollNext && emblaApi) {
              emblaApi.scrollNext();
            }
          }}
          className={`absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white transition-all duration-300 ${
            canScrollNext ? "opacity-100 scale-100 cursor-pointer" : "opacity-0 scale-90 pointer-events-none"
          }`}
          aria-label="Next photo"
          disabled={!canScrollNext}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {photos.length > 1 && (
        <div
          className={`absolute ${isLightbox ? "bottom-3" : "bottom-14"} left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 backdrop-blur-md`}
        >
          {photos.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Go to photo ${idx + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                emblaApi && emblaApi.scrollTo(idx);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                currentIndex === idx ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default HeroPhotoCarousel;
