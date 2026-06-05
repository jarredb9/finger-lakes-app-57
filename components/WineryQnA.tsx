// components/WineryQnA.tsx
import { useState, useMemo, useEffect, useRef } from "react";
import { PlaceReview, Winery } from "@/lib/types";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { MessageSquare, Dog, CalendarCheck, Baby, CheckCircle2, XCircle, Car, Zap, Accessibility, Sun, ChevronRight, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { GoogleAttribution } from "./GoogleAttribution";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
    keywords: ["dog", "dogs", "pet", "pets", "puppy", "puppies", "pup", "pups", "canine", "canines", "furry friend", "pooch", "pooches", "doggie", "doggy"],
  },
  {
    id: "kids",
    text: "Is it kid-friendly?",
    icon: Baby,
    keywords: ["kid", "kids", "child", "children", "family", "stroller", "toddler", "toddlers"],
  },
  {
    id: "parking",
    text: "Is there free parking?",
    icon: Car,
    keywords: ["parking", "park", "lot", "garage", "valet", "spaces", "street parking"],
  },
  {
    id: "ev_charging",
    text: "Is EV charging available?",
    icon: Zap,
    keywords: ["ev", "charging", "charger", "electric vehicle", "tesla", "supercharger", "plug"],
  },
  {
    id: "wheelchair",
    text: "Is it wheelchair accessible?",
    icon: Accessibility,
    keywords: ["wheelchair", "accessible", "accessibility", "ramp", "elevator", "handicap", "handicapped", "level entry"],
  },
  {
    id: "outdoor",
    text: "Is there outdoor seating?",
    icon: Sun,
    keywords: ["outdoor", "patio", "deck", "seating", "outside", "lawn", "garden", "picnic", "veranda", "balcony", "terrace"],
  },
];

const reservationPlatforms = ['tock.com', 'resy.com', 'opentable.com', 'cellarpass.com'];

export default function WineryQnA({ 
  winery, 
  activeQuestionId: externalActiveId, 
  setActiveQuestionId: externalSetActiveId 
}: WineryQnAProps) {
  const [internalActiveId, setInternalActiveId] = useState<string | null>(null);
  const [activeReviewIndex, setActiveReviewIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
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
      const reviewText = typeof review.text === 'string' 
        ? review.text 
        : (typeof review.text === 'object' && review.text !== null ? (review.text as any).text : '');

      if (!reviewText) return;

      for (const keyword of activeQuestion.keywords) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        const match = reviewText.match(regex);
        
        if (match && match.index !== undefined) {
          const index = match.index;
          const start = Math.max(0, index - 50);
          const end = Math.min(reviewText.length, index + keyword.length + 50);
          const snippet = `${start > 0 ? '...' : ''}${reviewText.substring(start, end)}${end < reviewText.length ? '...' : ''}`;

          foundReviews.push({ 
            review: {
              ...review,
              // Normalize the author name too just in case
              author_name: review.author_name || (review as any).authorAttribution?.displayName || 'Anonymous',
              relative_time_description: review.relative_time_description || (review as any).relativePublishTimeDescription,
              text: reviewText
            }, 
            snippet 
          });
          return; // Move to the next review once a keyword is found
        }
      }
    });

    return foundReviews;
  }, [activeQuestionId, reviews, winery.reservable, hasOnlineReservations]);

  // Reset index and expansion when question changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveReviewIndex(0);
     
    setIsExpanded(false);
  }, [activeQuestionId]);

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

  const currentResult = searchResults?.[activeReviewIndex];

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
              <div className="space-y-3 mt-2">
                {currentResult ? (
                  <>
                    <Card className="bg-gray-50">
                      <CardContent className="p-3 text-sm">
                        <div className="relative">
                          <p className="italic text-gray-700 leading-relaxed">
                            {isExpanded ? currentResult.review.text : currentResult.snippet}
                          </p>
                          <button 
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="text-primary hover:underline font-medium mt-1 flex items-center gap-1"
                            data-testid="toggle-full-review"
                          >
                            {isExpanded ? (
                              <><ChevronUp className="h-4 w-4" /> Show less</>
                            ) : (
                              <><ChevronDown className="h-4 w-4" /> Show full review</>
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-right text-gray-500 mt-2">
                          - {currentResult.review.author_name} ({currentResult.review.relative_time_description})
                        </p>
                      </CardContent>
                    </Card>
                    
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-1">
                      <div className="flex items-center gap-2">
                        {searchResults.length > 0 && (
                          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                            Match {activeReviewIndex + 1} of {searchResults.length}
                          </span>
                        )}
                        
                        {searchResults.length > 1 && activeReviewIndex < searchResults.length - 1 ? (
                          <p className="text-xs text-muted-foreground font-medium">
                            {searchResults.length - 1 - activeReviewIndex} other matching {searchResults.length - 1 - activeReviewIndex === 1 ? 'review' : 'reviews'} available
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400 italic">
                            No other relevant reviews found
                          </p>
                        )}
                      </div>

                      {searchResults.length > 1 && activeReviewIndex < searchResults.length - 1 && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setActiveReviewIndex(activeReviewIndex + 1)}
                          className="text-xs h-7 gap-1 border-primary/20 hover:border-primary/50 hover:bg-primary/5 text-primary"
                          data-testid="load-another-review"
                        >
                          <ChevronRight className="h-3 w-3" />
                          Load next matching review
                        </Button>
                      )}
                    </div>
                    
                    {winery.userRatingCount && winery.userRatingCount > 5 && (
                      <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                        <HelpCircle className="h-3 w-3" />
                        Searching top 5 of {winery.userRatingCount} total reviews.
                      </p>
                    )}
                  </>
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