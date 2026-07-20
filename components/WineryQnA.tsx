// components/WineryQnA.tsx
import { useState, useMemo, useEffect, useRef } from "react";
import { PlaceReview, Winery } from "@/lib/types";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { MessageSquare, Dog, CalendarCheck, Baby, CheckCircle2, XCircle, Car, Zap, Accessibility, Sun, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { GoogleAttribution } from "./GoogleAttribution";
import { Button } from "@/components/ui/button";

interface WineryQnAProps {
  winery: Winery;
  activeQuestionId?: string | null;
  setActiveQuestionId?: (id: string | null) => void;
}

export const questions = [
  {
    id: "parking",
    text: "Is there free parking?",
    icon: Car,
    keywords: ["parking", "park", "lot", "garage", "valet", "spaces", "street parking"],
  },
  {
    id: "restrooms",
    text: "Are restrooms available?",
    icon: MessageSquare,
    keywords: ["restroom", "restrooms", "bathroom", "bathrooms", "toilet", "toilets", "facilities", "washroom", "washrooms", "lavatory"],
  },
  {
    id: "tasting_room",
    text: "How is the tasting room?",
    icon: MessageSquare,
    keywords: ["tasting room", "tasting area", "indoor tasting", "inside tasting", "bar", "counter", "tasting bar", "tasting table"],
  },
  {
    id: "dogs",
    text: "Are dogs allowed?",
    icon: Dog,
    keywords: ["dog", "dogs", "pet", "pets", "puppy", "puppies", "pup", "pups", "canine", "canines", "furry friend", "pooch", "pooches", "doggie", "doggy"],
  },
  {
    id: "picnic_area",
    text: "Is there a picnic area?",
    icon: Sun,
    keywords: ["picnic", "picnic area", "picnic table", "picnic tables", "bring your own food", "byof", "lawn seating", "picnics", "picnicking"],
  },
  {
    id: "ev_charging",
    text: "Is EV charging available?",
    icon: Zap,
    keywords: ["ev", "charging", "charger", "electric vehicle", "tesla", "supercharger", "plug"],
  },
  {
    id: "reservations",
    text: "Are reservations required?",
    icon: CalendarCheck,
    keywords: ["reservation", "reservations", "booking", "book ahead", "booked"],
  },
  {
    id: "tasting_fee",
    text: "What is the tasting fee?",
    icon: HelpCircle,
    keywords: ["fee", "fees", "cost", "tasting fee", "tasting fees", "price", "charge", "waived", "free tasting", "tasting cost", "prices"],
  },
  {
    id: "kids",
    text: "Is it kid-friendly?",
    icon: Baby,
    keywords: ["kid", "kids", "child", "children", "family", "stroller", "toddler", "toddlers"],
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
  activeQuestionId 
}: WineryQnAProps) {
  const [activeReviewIndex, setActiveReviewIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const reviews = winery.reviews;

  const activeQuestion = useMemo(() => {
    return questions.find((q) => q.id === activeQuestionId);
  }, [activeQuestionId]);

  const hasOnlineReservations = useMemo(() => {
    if (!winery.website) return false;
    return reservationPlatforms.some(platform => winery.website!.includes(platform));
  }, [winery.website]);

  const searchResults = useMemo(() => {
    if (activeQuestionId === 'reservations') {
      if (winery.reservable !== undefined) return null;
      if (hasOnlineReservations) return null;
    }

    if (!activeQuestionId || !reviews) return [];

    const currentQuestion = questions.find((q) => q.id === activeQuestionId);
    if (!currentQuestion) return [];

    const foundReviews: { review: PlaceReview; snippet: string }[] = [];

    reviews.forEach((review) => {
      const reviewText = typeof review.text === 'string' 
        ? review.text 
        : (typeof review.text === 'object' && review.text !== null ? (review.text as any).text : '');

      if (!reviewText) return;

      for (const keyword of currentQuestion.keywords) {
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
              author_name: review.author_name || (review as any).authorAttribution?.displayName || 'Anonymous',
              relative_time_description: review.relative_time_description || (review as any).relativePublishTimeDescription,
              text: reviewText
            }, 
            snippet 
          });
          return;
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

  if (!activeQuestionId) {
    return null;
  }

  const currentResult = searchResults?.[activeReviewIndex];

  return (
    <div className="space-y-4 pt-2" ref={containerRef} data-testid="winery-qna">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2 text-sm text-foreground">
          {activeQuestion ? (
            <>
              <activeQuestion.icon className="h-4 w-4 text-primary shrink-0" />
              <span>{activeQuestion.text}</span>
            </>
          ) : (
            <>
              <MessageSquare className="w-4 h-4 text-primary" />
              <span>Question Insights</span>
            </>
          )}
        </h4>
        <GoogleAttribution variant="reviews" />
      </div>

      <div className="space-y-3">
        {activeQuestionId === 'reservations' && (winery.reservable !== undefined || hasOnlineReservations) ? (
          <>
            {winery.reservable !== undefined && (
              <Card className="bg-muted/30 border-border/50">
                <CardContent className="p-3 text-sm flex items-center gap-2">
                  {winery.reservable ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                  <span className="font-medium text-foreground">
                    {winery.reservable ? "Reservations can be made." : "Reservations are not offered."}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">(From Google)</span>
                </CardContent>
              </Card>
            )}
            {winery.reservable === undefined && hasOnlineReservations && (
               <Card className="bg-muted/30 border-border/50">
                  <CardContent className="p-4 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-foreground">Online reservations seem to be available.</span>
                    </div>
                    <CardDescription className="mt-2 pl-7">
                      {"Their website points to a reservation service. It's a good idea to book ahead."}
                    </CardDescription>
                  </CardContent>
               </Card>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {currentResult ? (
              <>
                <Card className="bg-muted/30 border-border/50">
                  <CardContent className="p-3 text-sm">
                    <div className="relative">
                      <p className="italic text-foreground leading-relaxed">
                        {isExpanded ? currentResult.review.text : currentResult.snippet}
                      </p>
                      <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-primary hover:underline font-medium mt-1.5 flex items-center gap-1 text-xs"
                        data-testid="toggle-full-review"
                      >
                        {isExpanded ? (
                          <><ChevronUp className="h-4.5 w-4.5" /> Show less</>
                        ) : (
                          <><ChevronDown className="h-4.5 w-4.5" /> Show full review</>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-right text-muted-foreground mt-2">
                      - {currentResult.review.author_name} ({currentResult.review.relative_time_description})
                    </p>
                  </CardContent>
                </Card>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-1">
                  <div className="flex items-center flex-wrap gap-2">
                    {searchResults && searchResults.length > 0 && (
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                        {activeReviewIndex + 1} of {searchResults.length}
                      </span>
                    )}
                    {winery.userRatingCount && winery.userRatingCount > 5 && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <HelpCircle className="h-3 w-3" />
                        Top results from {winery.userRatingCount} total reviews.
                      </p>
                    )}
                  </div>

                  {searchResults && searchResults.length > 1 && (
                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                      {activeReviewIndex > 0 && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setActiveReviewIndex(activeReviewIndex - 1)}
                          className="text-xs h-7 gap-1 border-primary/20 hover:border-primary/50 hover:bg-primary/5 text-primary"
                          data-testid="prev-review"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          Previous
                        </Button>
                      )}
                      
                      {activeReviewIndex < searchResults.length - 1 && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setActiveReviewIndex(activeReviewIndex + 1)}
                          className="text-xs h-7 gap-1 border-primary/20 hover:border-primary/50 hover:bg-primary/5 text-primary"
                          data-testid="next-review"
                        >
                          Next
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No mention of this in the reviews. It might be best to call or check their website.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}