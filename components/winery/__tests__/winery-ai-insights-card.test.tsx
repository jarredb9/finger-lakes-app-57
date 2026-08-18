import { render, screen } from '@testing-library/react';
import { WineryAIInsightsCard } from '../winery-ai-insights-card';
import { createMockWinery } from '@/lib/test-utils/fixtures';

describe('WineryAIInsightsCard', () => {
  it('renders Gemini summary and area details when provided', () => {
    const winery = createMockWinery({
      generative_summary: 'A charming winery with panoramic lake views and world-class Riesling.',
      neighborhood_summary: 'Located on the scenic east side of Seneca Lake.',
      enrichment_tier: 'enriched',
    });

    render(<WineryAIInsightsCard winery={winery} />);

    expect(screen.getByTestId('gemini-summary')).toBeInTheDocument();
    expect(screen.getByText('Gemini Insight')).toBeInTheDocument();
    expect(screen.getByText('A charming winery with panoramic lake views and world-class Riesling.')).toBeInTheDocument();
    expect(screen.getByText('About the Area')).toBeInTheDocument();
    expect(screen.getByText('Located on the scenic east side of Seneca Lake.')).toBeInTheDocument();
  });

  it('renders loading skeleton when enrichment is pending or isLoading is true', () => {
    const winery = createMockWinery({
      id: 'loading-id' as any,
      enrichment_tier: undefined,
      generative_summary: null,
    });

    const { container } = render(<WineryAIInsightsCard winery={winery} loadingWineryId={'loading-id' as any} />);

    const stableContainer = container.querySelector('.stable-gemini-container');
    expect(stableContainer).toHaveAttribute('data-state', 'loading');
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders Service Limited banner when enriched but summary and photos are missing', () => {
    const winery = createMockWinery({
      enrichment_tier: 'enriched',
      generative_summary: null,
      primary_photo_reference: null,
    });

    render(<WineryAIInsightsCard winery={winery} />);

    expect(screen.getByText('Service Limited: Rich details and AI summaries are currently unavailable.')).toBeInTheDocument();
  });

  it('renders empty fallback when no AI summary is available', () => {
    const winery = createMockWinery({
      enrichment_tier: 'basic',
      generative_summary: null,
      primary_photo_reference: 'places/photo/123',
    });

    render(<WineryAIInsightsCard winery={winery} />);

    expect(screen.getByText('No AI summaries generated yet.')).toBeInTheDocument();
  });
});
