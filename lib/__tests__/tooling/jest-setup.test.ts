describe('Jest Setup & Test Infrastructure Verification (Phase 1 Task 1)', () => {
  describe('URL Polyfills in JSDOM Environment', () => {
    it('provides a functional URL.createObjectURL polyfill that returns a blob URL', () => {
      expect(typeof URL.createObjectURL).toBe('function');
      const mockBlob = new Blob(['test content'], { type: 'text/plain' });
      const objectUrl = URL.createObjectURL(mockBlob);
      expect(typeof objectUrl).toBe('string');
      expect(objectUrl.startsWith('blob:')).toBe(true);
    });

    it('provides a functional URL.revokeObjectURL polyfill', () => {
      expect(typeof URL.revokeObjectURL).toBe('function');
      expect(() => URL.revokeObjectURL('blob:mock-test')).not.toThrow();
    });

    it('exposes URL polyfills on window.URL in JSDOM', () => {
      expect(typeof window.URL.createObjectURL).toBe('function');
      expect(typeof window.URL.revokeObjectURL).toBe('function');
    });
  });

  describe('Global Mock Isolation (clearMocks: true)', () => {
    const mockFn = jest.fn();

    it('records calls in step 1', () => {
      mockFn('call-1');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('clears mock calls automatically between tests without manual clearAllMocks', () => {
      expect(mockFn).toHaveBeenCalledTimes(0);
    });
  });
});


