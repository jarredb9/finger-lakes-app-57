interface GoogleAttributionProps {
  className?: string;
  variant?: "powered-by" | "reviews" | "logo-only";
}

export function GoogleAttribution({ className = "", variant = "powered-by" }: GoogleAttributionProps) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] text-muted-foreground/70 ${className}`}>
      {variant === "powered-by" && <span>Powered by</span>}
      {variant === "reviews" && <span>(Google Reviews)</span>}
      {(variant === "powered-by" || variant === "logo-only") && (
        <img 
          src="https://maps.gstatic.com/mapfiles/api-3/images/google_whiteup_clr.png" 
          alt="Google"
          className="h-3 w-auto opacity-80"
          style={{ filter: "grayscale(1) invert(0.5)" }}
        />
      )}
    </div>
  );
}
