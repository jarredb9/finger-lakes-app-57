"use client";

import { useState } from "react";
import { useUIStore, UIState } from "@/lib/stores/uiStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";

interface NoteEditorProps {
    initialValue: string;
    onSave: (value: string) => void;
    onCancel: () => void;
}

function NoteEditor({ initialValue, onSave, onCancel }: NoteEditorProps) {
    const [noteValue, setNoteValue] = useState(initialValue);

    return (
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
            <Textarea 
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                placeholder="Add private notes for this winery..."
                className="min-h-[200px]"
            />
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
                <Button onClick={() => onSave(noteValue)}>Save Notes</Button>
            </div>
        </div>
    );
}

type UIStoreWithLegacy = UIState & {
    onNoteSave?: (wineryDbId: number, notes: string) => void;
};

export function WineryNoteModal() {
    const store = useUIStore() as UIStoreWithLegacy;
    const { 
        isModalOpen, 
        activeNoteWineryDbId, 
        activeNoteInitialValue, 
        activeNoteTripId,
        activeModal,
        closeWineryNoteEditor,
        modalTitle,
        modalDescription
    } = store;
    
    const mounted = useMounted();

    const isThisModalOpen = (isModalOpen && activeNoteWineryDbId !== null) || activeModal?.type === 'winery_notes';

    const handleClose = () => {
        closeWineryNoteEditor();
    };

    const handleSave = async (value: string) => {
        const wineryDbId = activeNoteWineryDbId ?? activeModal?.props?.wineryDbId;
        const tripId = activeNoteTripId ?? activeModal?.props?.tripId;

        if (typeof store.onNoteSave === 'function') {
            store.onNoteSave(wineryDbId, value);
        } else if (tripId && wineryDbId) {
            await useTripStore.getState().saveWineryNote(tripId.toString(), wineryDbId, value);
        }
        closeWineryNoteEditor();
    };

    if (!mounted) return null;

    return (
        <Dialog open={isThisModalOpen} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <DialogContent
                data-testid="note-modal"
                data-state="ready"
                className="max-w-2xl w-full max-h-[85dvh] sm:max-h-[90vh] p-0 flex flex-col"
                onFocusOutside={(e) => e.preventDefault()}
            >
                {activeNoteWineryDbId !== null && (
                    <>
                        {(modalTitle || modalDescription) && (
                            <DialogHeader className="p-6 pb-0">
                                {modalTitle && <DialogTitle>{modalTitle}</DialogTitle>}
                                {modalDescription && <DialogDescription>{modalDescription}</DialogDescription>}
                            </DialogHeader>
                        )}
                        <NoteEditor 
                            key={`${activeNoteWineryDbId}-${isThisModalOpen}`}
                            initialValue={activeNoteInitialValue}
                            onSave={handleSave}
                            onCancel={handleClose}
                        />
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
