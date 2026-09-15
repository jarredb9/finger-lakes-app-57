import fs from 'fs';
import path from 'path';

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

  describe('Jest Configuration (jest.config.mjs)', () => {
    it('verifies workerIdleMemoryLimit is set to 512MB and clearMocks is true in config', () => {
      const configPath = path.join(process.cwd(), 'jest.config.mjs');
      const configContent = fs.readFileSync(configPath, 'utf-8');

      expect(configContent).toMatch(/workerIdleMemoryLimit:\s*['"]512MB['"]/);
      expect(configContent).toMatch(/clearMocks:\s*true/);
    });
  });

  describe('Store Test Suite Module Reset Hygiene (Phase 1 Task 2)', () => {
    it('asserts zero occurrences of jest.resetModules() across store test suites in lib/stores/__tests__', () => {
      const storeTestsDir = path.join(process.cwd(), 'lib/stores/__tests__');
      const files = fs.readdirSync(storeTestsDir).filter(f => f.endsWith('.test.ts') || f.endsWith('.test.tsx'));

      // Files designated for Phase 1 Task 3
      const task3Files = ['relational-ids.test.ts', 'tripStore.domainInvariants.test.ts'];
      const targetFiles = files.filter(f => !task3Files.includes(f));

      const violations: { file: string; line: number }[] = [];

      for (const file of targetFiles) {
        const content = fs.readFileSync(path.join(storeTestsDir, file), 'utf-8');
        const lines = content.split('\n');
        lines.forEach((lineText, idx) => {
          if (lineText.includes('jest.resetModules()')) {
            violations.push({ file, line: idx + 1 });
          }
        });
      }

      expect(violations).toEqual([]);
    });
  });
});

