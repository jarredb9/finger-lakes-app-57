"use client";

import { useUIStore } from "@/lib/stores/uiStore";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function GlobalModalRenderer() {
  const { isModalOpen, modalContent, closeModal } = useUIStore();

  return (
    <Dialog open={isModalOpen} onOpenChange={(isOpen) => !isOpen && closeModal()}>
        <DialogContent
            className="max-w-2xl w-full max-h-[85dvh] sm:max-h-[90vh] p-0 flex flex-col"
            onPointerDownOutside={(e) => {
                if ((e.target as HTMLElement)?.closest('[vaul-drawer-trigger]')) {
                    e.preventDefault();
                }
            }}
            onFocusOutside={(e) => e.preventDefault()}
        >
            {modalContent}
        </DialogContent>
    </Dialog>
  );
}
