"use client";

import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { useUIStore } from "@/lib/stores/uiStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import VisitForm from "./VisitForm";

export function VisitFormModal() {
    const { 
        isModalOpen, 
        activeVisitWinery, 
        editingVisit, 
        modalTitle, 
        modalDescription, 
        closeVisitForm 
    } = useUIStore();
    
    const { saveVisit, updateVisit, isSavingVisit } = useVisitStore();
    const { toast } = useToast();
    const [photosToDelete, setPhotosToDelete] = useState<string[]>([]);

    const [modalRoot, setModalRoot] = useState<HTMLElement | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const handle = requestAnimationFrame(() => {
            setMounted(true);
            setModalRoot(document.getElementById("modal-root"));
        });
        return () => cancelAnimationFrame(handle);
    }, []);

    const handleSave = async (visitData: any, photos: string[]) => {
        try {
            if (!activeVisitWinery) return;
            if (editingVisit) {
                await updateVisit(
                    String(editingVisit.id!), 
                    { 
                        visit_date: visitData.visit_date, 
                        user_review: visitData.user_review, 
                        rating: visitData.rating,
                        is_private: visitData.is_private 
                    }, 
                    visitData.photos, 
                    photos
                );
                const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
                toast({ 
                    description: isOffline 
                        ? "Edit cached. It will be synced once you're back online." 
                        : "Visit updated successfully." 
                });
            } else {
                await saveVisit(activeVisitWinery, visitData);
                const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
                toast({ 
                    description: isOffline 
                        ? "Visit cached. It will be synced once you're back online." 
                        : "Visit added successfully." 
                });
            }
            closeVisitForm();
        } catch (error) {
            const message = error instanceof Error ? error.message : "An error occurred.";
            toast({ variant: "destructive", description: message });
            throw error;
        }
    };

    const handleClose = () => {
        closeVisitForm();
        setPhotosToDelete([]);
    };

    if (!mounted || !modalRoot) return null;

    // We keep the Dialog open if the global isModalOpen is true AND we have an active winery.
    // This ensures we don't show an empty dialog if isModalOpen is true for a DIFFERENT reason.
    const isThisModalOpen = isModalOpen && !!activeVisitWinery;

    return createPortal(
        <Dialog open={isThisModalOpen} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <DialogContent
                data-testid="visit-modal"
                className="max-w-2xl w-full max-h-[85dvh] sm:max-h-[90vh] p-0 flex flex-col"
                onFocusOutside={(e) => e.preventDefault()}
            >
                {activeVisitWinery && (
                    <>
                        {(modalTitle || modalDescription) && (
                            <DialogHeader className="p-6 pb-0">
                                {modalTitle && <DialogTitle>{modalTitle}</DialogTitle>}
                                {modalDescription && <DialogDescription>{modalDescription}</DialogDescription>}
                            </DialogHeader>
                        )}
                        <div className="overflow-y-auto flex-1">
                            <VisitForm 
                                editingVisit={editingVisit}
                                onCancel={handleClose}
                                onSave={handleSave}
                                isSubmitting={isSavingVisit}
                                photosToDelete={photosToDelete}
                                togglePhotoForDeletion={(path) => setPhotosToDelete(prev => 
                                    prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
                                )}
                                setPhotosToDelete={setPhotosToDelete}
                            />
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>,
        modalRoot
    );
}
