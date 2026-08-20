import { Winery } from "@/lib/types";
import { useWineryPhoto } from "@/hooks/use-winery-photo";

export interface WineryImageProps {
  photoRef: string;
  winery: Winery;
  className?: string;
  alt?: string;
}

export function WineryImage({
  photoRef,
  winery,
  className,
  alt = "Winery photo",
}: WineryImageProps) {
  const { imgSrc, cachePhoto } = useWineryPhoto(photoRef, winery);

  if (!imgSrc) return <div className={`bg-muted animate-pulse ${className || ""}`.trim()} />;

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      onLoad={cachePhoto}
      loading="lazy"
      draggable={false}
    />
  );
}

export default WineryImage;
