import { Check, X, HelpCircle } from "lucide-react";

export interface AttributeStatusProps {
  value: boolean | null | undefined;
  questionId?: string;
  onSelectQuestion?: (id: string | null) => void;
}

export function AttributeStatus({ value, questionId, onSelectQuestion }: AttributeStatusProps) {
  if (value === true) {
    return <Check className="h-4 w-4 text-green-500" data-testid="status-yes" />;
  }
  if (value === false) {
    return <X className="h-4 w-4 text-red-500" data-testid="status-no" />;
  }

  if (questionId && onSelectQuestion) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectQuestion(questionId);
        }}
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground underline decoration-dotted cursor-pointer"
        data-testid={`status-unknown-${questionId}`}
        title="Click to search reviews"
      >
        <HelpCircle className="h-3 w-3 text-gray-400" />
        <span>Unknown (Ask Reviews)</span>
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" data-testid="status-unknown">
      <HelpCircle className="h-3 w-3 text-gray-400" />
      <span>Unknown</span>
    </div>
  );
}

export function AccordionAttributeStatus({ value, questionId, onSelectQuestion }: AttributeStatusProps) {
  if (value === true) {
    return <Check className="h-3.5 w-3.5 text-green-500" />;
  }
  if (value === false) {
    return <X className="h-3.5 w-3.5 text-red-500" />;
  }

  if (questionId && onSelectQuestion) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectQuestion(questionId);
        }}
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground underline decoration-dotted cursor-pointer"
        title="Click to search reviews"
      >
        <HelpCircle className="h-3 w-3 text-gray-400" />
        <span>Unknown (Ask Reviews)</span>
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <HelpCircle className="h-3 w-3 text-gray-400" />
      <span>Unknown</span>
    </div>
  );
}

export default AttributeStatus;
