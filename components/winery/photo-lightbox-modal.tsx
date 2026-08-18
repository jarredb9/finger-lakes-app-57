import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Winery } from "@/lib/types";
import { HeroPhotoCarousel } from "./hero-photo-carousel";

export interface PhotoLightboxModalProps {
  winery: Winery | null;
  photoRef: string | null;
  onClose: () => void;
  onPhotoSelect?: (photoRef: string) => void;
}

export function PhotoLightboxModal({
  winery,
  photoRef,
  onClose,
  onPhotoSelect,
}: PhotoLightboxModalProps) {
  if (!winery || !photoRef || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto"
      data-testid="photo-lightbox-modal"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <button
        type="button"
        data-testid="close-lightbox-button"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-6 right-6 z-[210] p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
        aria-label="Close Lightbox"
      >
        <X className="w-5 h-5" />
      </button>
      <div
        className="relative max-w-3xl h-[70vh] w-full flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="h-full w-full overflow-hidden rounded-lg">
          <HeroPhotoCarousel
            winery={winery}
            isFull={true}
            isMobile={false}
            initialPhotoRef={photoRef}
            isLightbox={true}
            onPhotoSelect={onPhotoSelect}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PhotoLightboxModal;
