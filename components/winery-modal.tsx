// components/winery-modal.tsx
import { useWineryModalState } from "./winery/use-winery-modal-state";
import { DesktopWineryModal } from "./winery/desktop-winery-modal";
import { MobileWineryDrawer } from "./winery/mobile-winery-drawer";

export function WineryModal() {
  const {
    isWineryModalOpen,
    activeWinery,
    loadingWineryId,
    isLoading,
    isStreetViewActive,
    isMobile,
    isAIEnabled,
    lightboxPhoto,
    setLightboxPhoto,
    snapPoint,
    setSnapPoint,
    activeTab,
    effectiveActiveTab,
    setActiveTab,
    visits,
    scrollContainerRef,
    visitHistoryRef,
    closeWineryModal,
    openVisitForm,
    handleStreetViewClick,
    handleWishlistToggle,
    handleFavoriteToggle,
    handleToggleFavoritePrivacy,
    handleToggleWishlistPrivacy,
    handleEditClick,
    handleDeleteVisit,
    handleTripBadgeClick,
  } = useWineryModalState();

  if (!isWineryModalOpen || isStreetViewActive) {
    return null;
  }

  const commonProps = {
    winery: activeWinery,
    loadingWineryId,
    isLoading,
    isAIEnabled,
    lightboxPhoto,
    setLightboxPhoto,
    activeTab,
    effectiveActiveTab,
    setActiveTab,
    visits,
    scrollContainerRef,
    visitHistoryRef,
    onLogVisit: () => activeWinery && openVisitForm(activeWinery),
    onStreetView: handleStreetViewClick,
    onToggleWishlist: handleWishlistToggle,
    onToggleFavorite: handleFavoriteToggle,
    onToggleFavoritePrivacy: handleToggleFavoritePrivacy,
    onToggleWishlistPrivacy: handleToggleWishlistPrivacy,
    onEditVisit: handleEditClick,
    onDeleteVisit: handleDeleteVisit,
    onTripBadgeClick: handleTripBadgeClick,
  };

  if (isMobile) {
    return (
      <MobileWineryDrawer
        isOpen={isWineryModalOpen}
        onClose={closeWineryModal}
        isMobile={isMobile}
        snapPoint={snapPoint}
        setSnapPoint={setSnapPoint}
        {...commonProps}
      />
    );
  }

  return (
    <DesktopWineryModal
      isOpen={isWineryModalOpen}
      onClose={closeWineryModal}
      {...commonProps}
    />
  );
}

export default WineryModal;