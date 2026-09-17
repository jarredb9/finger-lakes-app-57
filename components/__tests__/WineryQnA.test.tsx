import { render, screen, fireEvent } from "@testing-library/react";
import WineryQnA from "../WineryQnA";
import { createMockWinery } from "@/lib/test-utils/fixtures";
import { GooglePlaceId, Winery } from "@/lib/types";

describe("WineryQnA Keyword & Boundary Matching", () => {
  const mockWineryBase = createMockWinery({
    id: "winery-1" as GooglePlaceId,
    name: "Sample Winery",
    address: "123 Wine Way",
    reviews: []
  });

  it("does not match 'park' inside 'sparkling' for parking question", () => {
    const winery: Winery = {
      ...mockWineryBase,
      reviews: [
        {
          author_name: "John Doe",
          rating: 5,
          text: "I tried a variety of wines (sparkling, too) and each wine was delightful.",
          relative_time_description: "a week ago",
          time: 123456
        }
      ]
    };

    render(<WineryQnA winery={winery} activeQuestionId="parking" />);
    expect(screen.getByText(/No mention of this in the reviews/i)).toBeInTheDocument();
  });

  it("does not match dog park / fenced park for parking question", () => {
    const winery: Winery = {
      ...mockWineryBase,
      reviews: [
        {
          author_name: "Jane Smith",
          rating: 5,
          text: "We took our dogs out to the huge fenced park.",
          relative_time_description: "a month ago",
          time: 123456
        }
      ]
    };

    render(<WineryQnA winery={winery} activeQuestionId="parking" />);
    expect(screen.getByText(/No mention of this in the reviews/i)).toBeInTheDocument();
  });

  it("matches real parking terms like 'parking lot' or 'free parking'", () => {
    const winery: Winery = {
      ...mockWineryBase,
      reviews: [
        {
          author_name: "Sam",
          rating: 5,
          text: "They have a huge parking lot with plenty of free parking.",
          relative_time_description: "2 days ago",
          time: 123456
        }
      ]
    };

    render(<WineryQnA winery={winery} activeQuestionId="parking" />);
    expect(screen.getByText(/parking lot/i)).toBeInTheDocument();
  });

  it("does not match 'ev' inside 'every' for ev_charging question", () => {
    const winery: Winery = {
      ...mockWineryBase,
      reviews: [
        {
          author_name: "Sam",
          rating: 5,
          text: "Every single wine was delicious and wonderful.",
          relative_time_description: "2 days ago",
          time: 123456
        }
      ]
    };

    render(<WineryQnA winery={winery} activeQuestionId="ev_charging" />);
    expect(screen.getByText(/No mention of this in the reviews/i)).toBeInTheDocument();
  });

  it("does not match 'family-owned' for kids question", () => {
    const winery: Winery = {
      ...mockWineryBase,
      reviews: [
        {
          author_name: "Sam",
          rating: 5,
          text: "This is a wonderful family-owned winery with deep roots.",
          relative_time_description: "2 days ago",
          time: 123456
        }
      ]
    };

    render(<WineryQnA winery={winery} activeQuestionId="kids" />);
    expect(screen.getByText(/No mention of this in the reviews/i)).toBeInTheDocument();
  });

  it("matches 'kid-friendly' and 'stroller' for kids question", () => {
    const winery: Winery = {
      ...mockWineryBase,
      reviews: [
        {
          author_name: "Sam",
          rating: 5,
          text: "Very kid-friendly atmosphere and plenty of room for a stroller.",
          relative_time_description: "2 days ago",
          time: 123456
        }
      ]
    };

    render(<WineryQnA winery={winery} activeQuestionId="kids" />);
    expect(screen.getByText(/plenty of room/i)).toBeInTheDocument();
  });

  it("asserts active question transition resets review index without out-of-bounds review flashes", () => {
    const wineryWithReviews = createMockWinery({
      id: "winery-reviews" as GooglePlaceId,
      name: "Reviews Winery",
      reviews: [
        {
          author_name: "Alice",
          rating: 5,
          relative_time_description: "a week ago",
          text: "Free parking available in the main lot. Great parking space.",
          time: 123456,
        },
        {
          author_name: "Bob",
          rating: 4,
          relative_time_description: "2 weeks ago",
          text: "Plenty of parking spots near the entrance.",
          time: 123457,
        },
        {
          author_name: "Charlie",
          rating: 5,
          relative_time_description: "a month ago",
          text: "The bathroom and restroom facilities were very clean.",
          time: 123458,
        },
      ],
    });

    let currentQuestionId: string | null = "parking";
    const setQuestionId = jest.fn((newId: string | null) => {
      currentQuestionId = newId;
    });

    const { rerender } = render(
      <WineryQnA
        winery={wineryWithReviews}
        activeQuestionId={currentQuestionId}
        setActiveQuestionId={setQuestionId}
      />
    );

    // Question "parking" has 2 reviews. Advance to review 2 (index 1)
    expect(screen.getByText(/1 of 2/i)).toBeInTheDocument();
    const nextBtn = screen.getByTestId("next-review");
    fireEvent.click(nextBtn);
    expect(screen.getByText(/2 of 2/i)).toBeInTheDocument();

    // Switch question to "restrooms", which has only 1 review
    currentQuestionId = "restrooms";
    rerender(
      <WineryQnA
        winery={wineryWithReviews}
        activeQuestionId={currentQuestionId}
        setActiveQuestionId={setQuestionId}
      />
    );

    // Keyed card must immediately reset to index 0 ("1 of 1") without reading out-of-bounds review index 1
    expect(screen.getByText(/1 of 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Charlie/i)).toBeInTheDocument();
    expect(screen.queryByText(/2 of 1/i)).not.toBeInTheDocument();
  });
});
