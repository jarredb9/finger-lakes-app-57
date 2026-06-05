// components/WineryQnA.tsx
import { useState, useMemo, useEffect, useRef } from "react";
import { PlaceReview, Winery } from "@/lib/types";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { MessageSquare, Dog, CalendarCheck, Baby, CheckCircle2, XCircle, Car, Zap, Accessibility, Sun } from "lucide-react";
import { GoogleAttribution } from "./GoogleAttribution";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WineryQnAProps {
  winery: Winery;
  activeQuestionId?: string | null;
  setActiveQuestionId?: (id: string | null) => void;
}

const questions = [
  {
    id: "reservations",
    text: "Are reservations required?",
    icon: CalendarCheck,
    keywords: ["reservation", "reservations", "booking", "book ahead", "booked"],
  },
  {
    id: "dogs",
    text: "Are dogs allowed?",
    icon: Dog,
    keywords: ["dog", "dogs", "pet", "pets", "puppy", "puppies", "furry friend"],
  },
  {
    id: "kids",
    text: "Is it kid-friendly?",
    icon: Baby,
    keywords: ["kid", "kids", "child", "children", "family", "stroller"],
  },
  {
    id: "parking",
    text: "Is there free parking?",
    icon: Car,
    keywords: ["parking", "park", "lot", "garage", "valet", "spaces"],
  },
  {
    id: "ev_charging",
    text: "Is EV charging available?",
    icon: Zap,
    keywords: ["ev", "charging", "charger", "electric vehicle", "tesla"],
  },
  {
    id: "wheelchair",
    text: "Is it wheelchair accessible?",
    icon: Accessibility,
    keywords: ["wheelchair", "accessible", "accessibility", "ramp", "elevator", "handicap", "handicapped"],
  },
  {
    id: "outdoor",
    text: "Is there outdoor seating?",
    icon: Sun,
    keywords: ["outdoor", "patio", "deck", "seating", "outside", "lawn", "garden", "picnic"],
  },
];

const reservationPlatforms = ['tock.com', 'resy.com', 'opentable.com', 'cellarpass.com'];

export default function WineryQnA({ 
  winery, 
  activeQuestionId: externalActiveId, 
  setActiveQuestionId: externalSetActiveId 
}: WineryQnAProps) {
  const [internalActiveId, setInternalActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const activeQuestionId = externalActiveId !== undefined ? externalActiveId : internalActiveId;
  const setActiveQuestionId = externalSetActiveId !== undefined ? externalSetActiveId : setInternalActiveId;
  
  const reviews = winery.reviews;

  const hasOnlineReservations = useMemo(() => {
    if (!winery.website) return false;
    return reservationPlatforms.some(platform => winery.website!.includes(platform));
  }, [winery.website]);

  const searchResults = useMemo(() => {
    // Handle structured data first
    if (activeQuestionId === 'reservations') {
      if (winery.reservable !== undefined) return null; // Handled by dedicated UI
      if (hasOnlineReservations) return null; // Handled by dedicated UI
    }

    if (!activeQuestionId || !reviews) return [];

    const activeQuestion = questions.find((q) => q.id === activeQuestionId);
    if (!activeQuestion) return [];

    const foundReviews: { review: PlaceReview; snippet: string }[] = [];

    reviews.forEach((review) => {
      if (!review.text) return;

      for (const keyword of activeQuestion.keywords) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        const match = review.text.match(regex);
        
        if (match && match.index !== undefined) {
          const index = match.index;
          const start = Math.max(0, index - 50);
          const end = Math.min(review.text.length, index + keyword.length + 50);
          const snippet = `...${review.text.substring(start, end)}...`;

          foundReviews.push({ review, snippet });
          return; // Move to the next review once a keyword is found
        }
      }
    });

    return foundReviews;
  }, [activeQuestionId, reviews, winery.reservable, hasOnlineReservations]);

  useEffect(() => {
    if (activeQuestionId && containerRef.current) {
      // Use requestAnimationFrame to ensure rendering has committed
      requestAnimationFrame(() => {
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, [activeQuestionId]);

  if ((!reviews || reviews.length === 0) && winery.reservable === undefined && !activeQuestionId) {
    return null;
  }

  return (
    <>
      <Separator className="my-4" />
      <div className="space-y-4 pt-2" ref={containerRef}>
        <div className="flex items-center justify-between">
          <h4 className="font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Common Questions
          </h4>
          <GoogleAttribution variant="reviews" />
        </div>
        <div className="w-full sm:max-w-xs">
          <Select 
            value={activeQuestionId || "none"} 
            onValueChange={(val) => setActiveQuestionId(val === "none" ? null : val)}
          >
            <SelectTrigger className="w-full font-medium" data-testid="qna-select">
              <SelectValue placeholder="Select a question to ask reviews..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select a question...</SelectItem>
              {questions.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  <div className="flex items-center gap-2">
                    <q.icon className="h-4 w-4 shrink-0" />
                    <span>{q.text}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeQuestionId && (
          <>
            {activeQuestionId === 'reservations' && (winery.reservable !== undefined || hasOnlineReservations) ? (
              <>
                {winery.reservable !== undefined && (
                  <Card className="bg-gray-50">
                    <CardContent className="p-3 text-sm flex items-center gap-2">
                      {winery.reservable ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                      <span className="font-medium">
                        {winery.reservable ? "Reservations can be made." : "Reservations are not offered."}
                      </span>
                      <span className="text-xs text-gray-500 ml-auto">(From Google)</span>
                    </CardContent>
                  </Card>
                )}
                {winery.reservable === undefined && hasOnlineReservations && (
                   <Card className="bg-gray-50">
                      <CardContent className="p-4 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <span className="font-medium">Online reservations seem to be available.</span>
                        </div>
                        <CardDescription className="mt-2 pl-7">
                                            {"Their website points to a reservation service. It's a good idea to book ahead."}
                        </CardDescription>
                      </CardContent>
                   </Card>
                )}
              </>
            ) : ( // Fallback for all other questions, or for reservations if no structured data is found
              <div className="space-y-2 mt-2">
                {searchResults && searchResults.length > 0 ? (
                  searchResults.map((result, index) => (
                    <Card key={index} className="bg-gray-50">
                      <CardContent className="p-3 text-sm">
                        <p className="italic text-gray-700">{result.snippet}</p>
                        <p className="text-xs text-right text-gray-500 mt-2">
                          - {result.review.author_name} ({result.review.relative_time_description})
                        </p>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No mention of this in the reviews. It might be best to call or check their website.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}