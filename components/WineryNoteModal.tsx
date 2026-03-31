"use client";

import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { useUIStore } from "@/lib/stores/uiStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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
    const [modalRoot, setModalRoot] = useState<HTMLElement | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const handle = requestAnimationFrame(() => {
            setMounted(true);
            setModalRoot(document.getElementById("modal-root"));
        });
        return () => cancelAnimationFrame(handle);
    }, []);

    // Sync internal note value when editor opens
    useEffect(() => {
        if (activeNoteWineryDbId !== null) {
            const handle = requestAnimationFrame(() => {
                setNoteValue(activeNoteInitialValue);
            });
            return () => cancelAnimationFrame(handle);
        }
        return undefined;
    }, [activeNoteWineryDbId, activeNoteInitialValue]);

    if (!mounted || !modalRoot) return null;

    const handleClose = () => {
        closeWineryNoteEditor();
    };

    const handleSave = () => {
        if (activeNoteWineryDbId !== null && onNoteSave) {
            onNoteSave(activeNoteWineryDbId, noteValue);
            closeWineryNoteEditor();
        }
    };

    const isThisModalOpen = isModalOpen && activeNoteWineryDbId !== null;

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
                                value={noteValue}
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
