import { render, screen } from '@testing-library/react';
import WineryQnA from '../WineryQnA';
import { createMockWinery } from '@/lib/test-utils/fixtures';

describe('WineryQnA Attribution', () => {
  it('shows Google attribution when reviews are present', () => {
    const winery = createMockWinery({
      reviews: [
        {
          text: 'Great dog friendly place!',
          rating: 5,
          author_name: 'John Doe',
          relative_time_description: '2 months ago',
          time: Math.floor(Date.now() / 1000),
        }
      ],
    });

    render(<WineryQnA winery={winery} />);
    
    // This should fail initially as GoogleAttribution is not yet in WineryQnA
    expect(screen.getByText('(Google Reviews)')).toBeInTheDocument();
  });
});
