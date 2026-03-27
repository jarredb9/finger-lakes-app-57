"use client";

import { useUIStore } from "@/lib/stores/uiStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import VisitForm from "./VisitForm";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function GlobalModalRenderer() {
  const { 
    isModalOpen, 
    modalContent, 
    modalTitle, 
    modalDescription, 
    closeModal,
    activeVisitWinery,
    editingVisit,
    closeVisitForm,
    activeNoteWineryDbId,
    activeNoteInitialValue,
    onNoteSave,
    closeWineryNoteEditor
  } = useUIStore();

  const [photosToDelete, setPhotosToDelete] = useState<string[]>([]);
  const [noteValue, setNoteValue] = useState("");

  // Sync internal note value when editor opens
  useEffect(() => {
    if (activeNoteWineryDbId !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNoteValue(activeNoteInitialValue);
    }
  }, [activeNoteWineryDbId, activeNoteInitialValue]);

  const handleClose = () => {
    if (activeVisitWinery) {
      closeVisitForm();
    } else if (activeNoteWineryDbId !== null) {
      closeWineryNoteEditor();
    } else {
      closeModal();
    }
    setPhotosToDelete([]);
  };

  const handleNoteSave = () => {
    if (activeNoteWineryDbId !== null && onNoteSave) {
      onNoteSave(activeNoteWineryDbId, noteValue);
      closeWineryNoteEditor();
    }
  };

  const renderContent = () => {
    if (modalContent) return modalContent;

    if (activeVisitWinery) {
      return (
        <VisitForm 
          winery={activeVisitWinery}
          editingVisit={editingVisit}
          onCancelEdit={handleClose}
          photosToDelete={photosToDelete}
          togglePhotoForDeletion={(path) => setPhotosToDelete(prev => 
            prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
          )}
          setPhotosToDelete={setPhotosToDelete}
        />
      );
    }

    if (activeNoteWineryDbId !== null) {
      return (
        <div className="p-6 space-y-4">
          <Textarea 
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value)}
            placeholder="Add private notes for this winery..."
            className="min-h-[200px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleNoteSave}>Save Notes</Button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent
            data-testid="visit-modal"
            className="max-w-2xl w-full max-h-[85dvh] sm:max-h-[90vh] p-0 flex flex-col"
            onFocusOutside={(e) => e.preventDefault()}
        >
            {(modalTitle || modalDescription) && (
                <DialogHeader className="p-6 pb-0">
                    {modalTitle && <DialogTitle>{modalTitle}</DialogTitle>}
                    {modalDescription && <DialogDescription>{modalDescription}</DialogDescription>}
                </DialogHeader>
            )}
            <div className="overflow-y-auto flex-1">
              {renderContent()}
            </div>
        </DialogContent>
    </Dialog>
  );
}
