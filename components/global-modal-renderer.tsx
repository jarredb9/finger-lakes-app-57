"use client";

import { useUIStore } from "@/lib/stores/uiStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function GlobalModalRenderer() {
  const { 
    isModalOpen, 
    modalContent, 
    modalTitle, 
    modalDescription, 
    closeModal
  } = useUIStore();

  const handleClose = () => {
    closeModal();
  };

  // This renderer ONLY handles generic modalContent.
  // Specialized modals (VisitFormModal, WineryNoteModal) handle their own state.
  const shouldOpen = isModalOpen && !!modalContent;

  return (
    <Dialog open={shouldOpen} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent
            data-testid="global-modal"
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
              {modalContent}
            </div>
        </DialogContent>
    </Dialog>
  );
}
