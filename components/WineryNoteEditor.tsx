// components/WineryNoteEditor.tsx
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";

interface WineryNoteEditorProps {
  wineryDbId: number;
  initialNotes: string;
  onSave: (wineryDbId: number, notes: string) => void;
}

export default function WineryNoteEditor({ wineryDbId, initialNotes, onSave }: WineryNoteEditorProps) {
  const [note, setNote] = useState(initialNotes);

  useEffect(() => {
    setNote(initialNotes);
  }, [initialNotes]);

  const handleBlur = () => {
    onSave(wineryDbId, note);
  };

  return (
    <Textarea
      placeholder="Add notes..."
      value={note}
      onChange={(e) => setNote(e.target.value)}
      onBlur={handleBlur}
      className="mt-2 text-sm"
    />
  );
}