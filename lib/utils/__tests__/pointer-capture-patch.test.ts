import { initPointerCaptureDefensivePatch } from '../pointer-capture-patch';

describe('Pointer Capture Defensive Patch', () => {
  let originalRelease: any;
  let originalSet: any;
  let originalHas: any;

  beforeEach(() => {
    originalRelease = Element.prototype.releasePointerCapture;
    originalSet = Element.prototype.setPointerCapture;
    originalHas = Element.prototype.hasPointerCapture;
  });

  afterEach(() => {
    Element.prototype.releasePointerCapture = originalRelease;
    Element.prototype.setPointerCapture = originalSet;
    Element.prototype.hasPointerCapture = originalHas;
  });

  it('safely skips releasePointerCapture when element does not have pointer capture', () => {
    const mockOriginalRelease = jest.fn();
    Element.prototype.releasePointerCapture = mockOriginalRelease;
    Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);

    initPointerCaptureDefensivePatch();

    const element = document.createElement('div');
    expect(() => {
      element.releasePointerCapture(123);
    }).not.toThrow();

    expect(mockOriginalRelease).not.toHaveBeenCalled();
  });

  it('calls native releasePointerCapture when element has pointer capture', () => {
    const mockOriginalRelease = jest.fn();
    Element.prototype.releasePointerCapture = mockOriginalRelease;
    Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(true);

    initPointerCaptureDefensivePatch();

    const element = document.createElement('div');
    element.releasePointerCapture(123);

    expect(mockOriginalRelease).toHaveBeenCalledWith(123);
  });

  it('catches and suppresses NotFoundError exceptions if native releasePointerCapture throws', () => {
    const mockOriginalRelease = jest.fn().mockImplementation(() => {
      throw new DOMException('NotFoundError', 'NotFoundError');
    });
    Element.prototype.releasePointerCapture = mockOriginalRelease;
    Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(true);

    initPointerCaptureDefensivePatch();

    const element = document.createElement('div');
    expect(() => {
      element.releasePointerCapture(123);
    }).not.toThrow();
  });

  it('catches and suppresses exceptions if setPointerCapture fails on invalid pointer', () => {
    const mockOriginalSet = jest.fn().mockImplementation(() => {
      throw new DOMException('InvalidPointerId', 'InvalidPointerId');
    });
    Element.prototype.setPointerCapture = mockOriginalSet;

    initPointerCaptureDefensivePatch();

    const element = document.createElement('div');
    expect(() => {
      element.setPointerCapture(999);
    }).not.toThrow();
  });
});
