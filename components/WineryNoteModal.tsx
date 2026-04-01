"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { useUIStore } from "@/lib/stores/uiStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";

export function WineryNoteModal() {
    const { 
        isModalOpen, 
        activeNoteWineryDbId, 
        activeNoteInitialValue, 
        onNoteSave, 
        closeWineryNoteEditor,
        modalTitle,
        modalDescription
    } = useUIStore();
    
    const [noteValue, setNoteValue] = useState("");
    const mounted = useMounted();

    const isThisModalOpen = isModalOpen && activeNoteWineryDbId !== null;

    const handleClose = () => {
        closeWineryNoteEditor();
    };

    const handleSave = () => {
        if (activeNoteWineryDbId !== null && onNoteSave) {
            onNoteSave(activeNoteWineryDbId, noteValue);
            closeWineryNoteEditor();
        }
    };

    if (!mounted) return null;

    const modalRoot = document.getElementById("modal-root");
    if (!modalRoot) return null;

    return createPortal(
        <Dialog open={isThisModalOpen} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <DialogContent
                data-testid="note-modal"
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
                        <div className="overflow-y-auto flex-1 p-6 space-y-4">
                            <Textarea 
                                key={`${activeNoteWineryDbId}-${isThisModalOpen}`}
                                defaultValue={activeNoteInitialValue}
                                onChange={(e) => setNoteValue(e.target.value)}
                                placeholder="Add private notes for this winery..."
                                className="min-h-[200px]"
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                                <Button onClick={handleSave}>Save Notes</Button>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>,
        modalRoot
    );
}
