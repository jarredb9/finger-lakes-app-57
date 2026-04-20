
export function ModalHost() {
    // We render the div immediately to avoid race conditions with Portals.
    // The SSR/Hydration risk is low for an empty div.
    return <div id="modal-root" className="relative z-[100]" />;
}
