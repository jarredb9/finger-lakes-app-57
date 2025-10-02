// components/WineryQnA.tsx
import { useState, useMemo } from "react";
import { PlaceReview } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Dog, CalendarCheck, Baby } from "lucide-react";

interface WineryQnAProps {
  reviews: PlaceReview[];
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
];

export default function WineryQnA({ reviews }: WineryQnAProps) {
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

  const searchResults = useMemo(() => {
    if (!activeQuestionId || !reviews) return [];

    const activeQuestion = questions.find((q) => q.id === activeQuestionId);
    if (!activeQuestion) return [];

    const foundReviews: { review: PlaceReview; snippet: string }[] = [];

    reviews.forEach((review) => {
      if (!review.text) return;
      const reviewTextLower = review.text.toLowerCase();

      for (const keyword of activeQuestion.keywords) {
        if (reviewTextLower.includes(keyword.toLowerCase())) {
          // Create a snippet
          const index = reviewTextLower.indexOf(keyword.toLowerCase());
          const start = Math.max(0, index - 50);
          const end = Math.min(review.text.length, index + keyword.length + 50);
          const snippet = `...${review.text.substring(start, end)}...`;

          foundReviews.push({ review, snippet });
          return; // Move to the next review once a keyword is found
        }
      }
    });

    return foundReviews;
  }, [activeQuestionId, reviews]);

  if (!reviews || reviews.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 pt-2">
      <h4 className="font-semibold flex items-center gap-2">
        <MessageSquare className="w-5 h-5" />
        Common Questions
      </h4>
      <div className="flex flex-wrap gap-2">
        {questions.map((q) => (
          <Button
            key={q.id}
            variant={activeQuestionId === q.id ? "secondary" : "outline"}
            size="sm"
            onClick={() => setActiveQuestionId(activeQuestionId === q.id ? null : q.id)}
          >
            <q.icon className="w-4 h-4 mr-2" />
            {q.text}
          </Button>
        ))}
      </div>

      {activeQuestionId && (
        <div className="space-y-2">
          {searchResults.length > 0 ? (
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
    </div>
  );
}