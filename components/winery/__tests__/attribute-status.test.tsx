import { render, screen, fireEvent } from '@testing-library/react';
import { AttributeStatus, AccordionAttributeStatus } from '../attribute-status';

describe('AttributeStatus', () => {
  it('renders green check icon when value is true', () => {
    render(<AttributeStatus value={true} />);
    expect(screen.getByTestId('status-yes')).toBeInTheDocument();
  });

  it('renders red X icon when value is false', () => {
    render(<AttributeStatus value={false} />);
    expect(screen.getByTestId('status-no')).toBeInTheDocument();
  });

  it('renders static Unknown label when value is undefined and no onSelectQuestion is passed', () => {
    render(<AttributeStatus value={undefined} />);
    expect(screen.getByTestId('status-unknown')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders interactive button when value is null with questionId and onSelectQuestion', () => {
    const handleSelectQuestion = jest.fn();
    render(
      <AttributeStatus
        value={null}
        questionId="dogs"
        onSelectQuestion={handleSelectQuestion}
      />
    );

    const button = screen.getByTestId('status-unknown-dogs');
    expect(button).toBeInTheDocument();
    expect(screen.getByText('Unknown (Ask Reviews)')).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleSelectQuestion).toHaveBeenCalledWith('dogs');
  });
});

describe('AccordionAttributeStatus', () => {
  it('renders green check icon when value is true', () => {
    const { container } = render(<AccordionAttributeStatus value={true} />);
    expect(container.querySelector('.text-green-500')).toBeInTheDocument();
  });

  it('renders red X icon when value is false', () => {
    const { container } = render(<AccordionAttributeStatus value={false} />);
    expect(container.querySelector('.text-red-500')).toBeInTheDocument();
  });

  it('renders static Unknown label when value is null without callback', () => {
    render(<AccordionAttributeStatus value={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders interactive button when questionId and onSelectQuestion are provided', () => {
    const handleSelectQuestion = jest.fn();
    render(
      <AccordionAttributeStatus
        value={null}
        questionId="parking"
        onSelectQuestion={handleSelectQuestion}
      />
    );

    const button = screen.getByRole('button', { name: /Unknown \(Ask Reviews\)/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleSelectQuestion).toHaveBeenCalledWith('parking');
  });
});
