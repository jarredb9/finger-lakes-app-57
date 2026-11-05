import fs from 'fs';
import path from 'path';
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

  it('exports initPointerCaptureDefensivePatch as a callable function', () => {
    expect(typeof initPointerCaptureDefensivePatch).toBe('function');
  });

  it('runs safely in SSR or headless environments where window or Element is undefined', () => {
    const originalElement = global.Element;
    try {
      (global as any).Element = undefined;

      expect(() => {
        initPointerCaptureDefensivePatch();
      }).not.toThrow();
    } finally {
      global.Element = originalElement;
    }
  });

  it('is idempotent when called multiple times consecutively', () => {
    const mockOriginalRelease = jest.fn();
    Element.prototype.releasePointerCapture = mockOriginalRelease;
    Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(true);

    initPointerCaptureDefensivePatch();
    initPointerCaptureDefensivePatch();
    initPointerCaptureDefensivePatch();

    const element = document.createElement('div');
    expect(() => {
      element.releasePointerCapture(456);
    }).not.toThrow();

    expect(mockOriginalRelease).toHaveBeenCalledWith(456);
  });

  it('catches and suppresses SecurityError and generic DOMException during pointer capture operations', () => {
    const mockReleaseSecurityError = jest.fn().mockImplementation(() => {
      throw new DOMException('SecurityError', 'SecurityError');
    });
    Element.prototype.releasePointerCapture = mockReleaseSecurityError;
    Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(true);

    const mockSetGenericError = jest.fn().mockImplementation(() => {
      throw new DOMException('General DOM failure', 'UnknownError');
    });
    Element.prototype.setPointerCapture = mockSetGenericError;

    initPointerCaptureDefensivePatch();

    const element = document.createElement('div');
    expect(() => {
      element.releasePointerCapture(101);
    }).not.toThrow();

    expect(() => {
      element.setPointerCapture(102);
    }).not.toThrow();
  });

  it('includes "use client" directive at top of file for Next.js App Router client execution', () => {
    const filePath = path.resolve(__dirname, '../pointer-capture-patch.ts');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.trim().split('\n');
    const hasUseClient = lines.some(line => line.trim() === '"use client"' || line.trim() === "'use client'");
    expect(hasUseClient).toBe(true);
  });
});
