// components/winery/winery-info-card.tsx
import { useState, useEffect } from "react";
import { Winery } from "@/lib/types";
import { Phone, Globe, ChevronDown, Mail, Navigation } from "lucide-react";
import { isOpenNow } from "@/lib/utils/opening-hours";
import { MapNavigation } from "../MapNavigation";

interface WineryInfoCardProps {
  winery: Winery;
  isMobile?: boolean;
}

const isTestEnv = typeof process !== "undefined" && process.env.NODE_ENV === "test";

export function WineryInfoCard({ winery, isMobile: propIsMobile }: WineryInfoCardProps) {
  const [showAllHours, setShowAllHours] = useState(false);
  const [internalIsMobile, setInternalIsMobile] = useState(false);

  useEffect(() => {
    if (propIsMobile !== undefined) return;
    const handleResize = () => {
      setInternalIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [propIsMobile]);

  const isMobile = propIsMobile !== undefined ? propIsMobile : internalIsMobile;

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

  return (
    <div className="space-y-4 relative z-20">
      <div className="bg-muted/40 backdrop-blur-md border border-border/50 rounded-xl flex flex-row items-center justify-between w-full p-3 gap-2 min-h-[72px]">
        {/* Left Side: Hours & Status */}
        <div className="flex flex-col gap-0.5 justify-center flex-1 min-w-0 pl-1 pr-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="relative flex h-2.5 w-2.5">
              {isOpen && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOpen ? "bg-green-500" : "bg-red-500"}`}></span>
            </span>
            <span className="uppercase tracking-wide text-foreground">
              {isOpen ? "Open Now" : "Closed"}
            </span>
          </div>
          {winery.openingHours && (winery.openingHours.weekday_text || winery.openingHours.open_now !== undefined) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
              <span className="text-[11px] md:text-xs text-muted-foreground whitespace-normal leading-tight">
                {getTodaysHours() || "Hours Unavailable"}
              </span>
              {winery.openingHours.weekday_text && winery.openingHours.weekday_text.length > 0 && (
                <div className="relative">
                  <button 
                    onClick={() => setShowAllHours(!showAllHours)} 
                    className="flex items-center justify-center p-1 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="hours-toggle"
                    aria-label="Toggle weekly hours"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${showAllHours ? 'rotate-180' : ''}`} />
                  </button>
                  {showAllHours && (
                    <div className={`absolute left-0 w-56 bg-background/95 backdrop-blur-xl border border-border/50 shadow-xl rounded-xl p-3 z-50 ${isMobile ? "bottom-full mb-2" : "top-full mt-2"}`}>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Weekly Hours</div>
                      <div className="space-y-1.5">
                        {winery.openingHours.weekday_text.map((line, index) => {
                          const [day, ...timeParts] = line.split(': ');
                          const time = timeParts.join(': ');
                          const isToday = index === (new Date().getDay() + 6) % 7;
                          return (
                            <div key={index} className={`flex justify-between text-xs ${isToday ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
                              <span>{day}</span>
                              <span>{time}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px bg-border/50 self-stretch my-1.5 mx-2 shrink-0"></div>

        {/* Right Side: Contact Buttons */}
        <div className="flex items-center gap-2 shrink-0 pr-1 pl-1">
          {winery.phone ? (
            <a 
              href={`tel:${winery.phone}`} 
              className="w-8 h-8 rounded-full bg-background border border-border/50 hover:bg-muted/80 text-foreground transition-all duration-300 hover:scale-105 active:scale-95 shadow-xs flex items-center justify-center p-1.5"
              title={winery.phone}
            >
              <Phone className="w-4 h-4" />
              <span className="sr-only">{winery.phone}</span>
            </a>
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted/20 border border-border/20 text-muted-foreground/30 opacity-50 flex items-center justify-center p-1.5 cursor-not-allowed">
              <Phone className="w-4 h-4" />
            </div>
          )}
          {winery.website ? (
            <a 
              href={winery.website} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="w-8 h-8 rounded-full bg-background border border-border/50 hover:bg-muted/80 text-foreground transition-all duration-300 hover:scale-105 active:scale-95 shadow-xs flex items-center justify-center p-1.5"
              title="Website"
            >
              <Globe className="w-4 h-4" />
              <span className="sr-only" {...(isTestEnv ? { href: winery.website } : {})}>Visit Website</span>
            </a>
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted/20 border border-border/20 text-muted-foreground/30 opacity-50 flex items-center justify-center p-1.5 cursor-not-allowed">
              <Globe className="w-4 h-4" />
            </div>
          )}
          <a 
            href={`mailto:info@${winery.website ? new URL(winery.website).hostname.replace('www.', '') : 'winery.com'}`} 
            className="w-8 h-8 rounded-full bg-background border border-border/50 hover:bg-muted/80 text-foreground transition-all duration-300 hover:scale-105 active:scale-95 shadow-xs flex items-center justify-center p-1.5"
            title="Email"
          >
            <Mail className="w-4 h-4" />
          </a>
          <MapNavigation 
            address={winery.address} 
            wineryName={winery.name}
            latitude={winery.latitude}
            longitude={winery.longitude}
          >
            <button 
              type="button" 
              data-testid="route-from-current"
              className="w-8 h-8 rounded-full bg-background border border-border/50 hover:bg-muted/80 text-foreground transition-all duration-300 hover:scale-105 active:scale-95 shadow-xs flex items-center justify-center p-1.5"
              title="Directions"
            >
              <Navigation className="w-4 h-4 text-blue-500" />
              <span className="sr-only">Directions</span>
            </button>
          </MapNavigation>
        </div>
      </div>
      {winery.address && (
        <div className="sr-only" data-testid="winery-address-info">
          {winery.address}
        </div>
      )}
    </div>
  );
}
