/**
 * Defensive patch for Element.prototype.releasePointerCapture and setPointerCapture.
 * Prevents Uncaught NotFoundError in Chromium DevTools touch emulation and when
 * synthetic pointer events are prematurely released or disconnected before cleanup.
 */
export function initPointerCaptureDefensivePatch() {
  if (typeof window === "undefined" || typeof Element === "undefined") {
    return;
  }

  const originalRelease = Element.prototype.releasePointerCapture;
  if (originalRelease) {
    Element.prototype.releasePointerCapture = function (pointerId: number) {
      if (typeof this.hasPointerCapture === "function" && this.hasPointerCapture(pointerId)) {
        try {
          originalRelease.call(this, pointerId);
        } catch {
          // Swallow DOMException if pointer became invalid during the tick
        }
      }
    };
  }

  const originalSet = Element.prototype.setPointerCapture;
  if (originalSet) {
    Element.prototype.setPointerCapture = function (pointerId: number) {
      try {
        originalSet.call(this, pointerId);
      } catch {
        // Guard against setting capture on detached or inactive synthetic pointers
      }
    };
  }
}

// Auto-initialize when imported on client side
if (typeof window !== "undefined") {
  initPointerCaptureDefensivePatch();
}
