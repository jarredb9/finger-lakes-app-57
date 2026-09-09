"use client";

import { useUIStore } from "@/lib/stores/uiStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function GlobalModalRenderer() {
  const store = useUIStore() as any;
  const { 
    isModalOpen, 
    activeModal, 
    modalTitle, 
    modalDescription, 
    closeModal
  } = store;

  const handleClose = () => {
    closeModal();
  };

  // This renderer handles generic dialog content via activeModal.props.content or legacy modalContent
  const content = activeModal?.props?.content ?? store.modalContent;
  const shouldOpen = Boolean(isModalOpen && content);

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
              {content}
            </div>
        </DialogContent>
    </Dialog>
  );
}
