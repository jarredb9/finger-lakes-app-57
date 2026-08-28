import { render, screen } from "@testing-library/react";
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
});
