import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();

describe('Tooling & Dependency Verification (Phase 1)', () => {
  const DEAD_PACKAGES = [
    '@dnd-kit/core',
    '@dnd-kit/sortable',
    '@dnd-kit/utilities',
    'recharts',
    'react-resizable-panels',
    'input-otp',
    'sonner',
    '@radix-ui/react-aspect-ratio',
    '@radix-ui/react-collapsible',
    '@radix-ui/react-context-menu',
    '@radix-ui/react-hover-card',
    '@radix-ui/react-menubar',
    '@radix-ui/react-navigation-menu',
    '@radix-ui/react-progress',
    '@radix-ui/react-radio-group',
    '@radix-ui/react-scroll-area',
    '@radix-ui/react-slider',
  ];

  describe('Source Code Dead Package Imports', () => {
    function getSourceFiles(dir: string, fileList: string[] = []): string[] {
      const fullPath = path.join(ROOT_DIR, dir);
      if (!fs.existsSync(fullPath)) return fileList;

      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        const resPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '__tests__') {
            getSourceFiles(resPath, fileList);
          }
        } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name) && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
          fileList.push(resPath);
        }
      }
      return fileList;
    }

    it('asserts zero imports in app/, components/, or lib/ for dead packages', () => {
      const targetDirs = ['app', 'components', 'lib'];
      const sourceFiles = targetDirs.flatMap(dir => getSourceFiles(dir));

      const importRegex = /(?:from\s+['"]|import\s*\(\s*['"]|require\s*\(\s*['"])(@dnd-kit\/[^'"]+|recharts|react-resizable-panels|input-otp|sonner|@radix-ui\/react-(?:aspect-ratio|collapsible|context-menu|hover-card|menubar|navigation-menu|progress|radio-group|scroll-area|slider))['"]/g;

      const violations: { file: string; match: string }[] = [];

      for (const file of sourceFiles) {
        const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf-8');
        let match: RegExpExecArray | null;
        while ((match = importRegex.exec(content)) !== null) {
          violations.push({ file, match: match[1] });
        }
      }

      expect(violations).toEqual([]);
    });

    it('verifies @radix-ui/react-accordion is retained and actively imported', () => {
      const amenitiesListPath = path.join(ROOT_DIR, 'components/winery/winery-amenities-list.tsx');
      const wineryDetailsPath = path.join(ROOT_DIR, 'components/WineryDetails.tsx');

      expect(fs.existsSync(amenitiesListPath)).toBe(true);
      expect(fs.existsSync(wineryDetailsPath)).toBe(true);

      const amenitiesContent = fs.readFileSync(amenitiesListPath, 'utf-8');
      const detailsContent = fs.readFileSync(wineryDetailsPath, 'utf-8');

      expect(amenitiesContent).toContain('@radix-ui/react-accordion');
      expect(detailsContent).toContain('@radix-ui/react-accordion');
    });
  });

  describe('package.json Dependency and Override Hygiene', () => {
    let pkgJson: {
      dependencies?: Record<string, string>;
      overrides?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    beforeAll(() => {
      const pkgRaw = fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8');
      pkgJson = JSON.parse(pkgRaw);
    });

    it('asserts dead packages are pruned from package.json#dependencies while retaining @radix-ui/react-accordion', () => {
      const dependencies = pkgJson.dependencies || {};

      DEAD_PACKAGES.forEach(pkg => {
        expect(dependencies).not.toHaveProperty(pkg);
      });

      expect(dependencies).toHaveProperty('@radix-ui/react-accordion');
    });

    it('asserts package.json#overrides is cleaned of brittle overrides while retaining essential overrides', () => {
      const overrides = pkgJson.overrides || {};

      expect(overrides).not.toHaveProperty('minimatch');
      expect(overrides).not.toHaveProperty('glob');
      expect(overrides).not.toHaveProperty('brace-expansion');
      expect(overrides).not.toHaveProperty('uuid');

      expect(overrides).toHaveProperty('postcss');
      expect(overrides).toHaveProperty('ws');
      expect(overrides).toHaveProperty('sharp');
    });

    it('asserts dev script uses Turbopack while build script uses Webpack', () => {
      const scripts = pkgJson.scripts || {};
      expect(scripts.dev).toBe('next dev --turbo');
      expect(scripts.build).toBe('next build --webpack');
    });
  });

  describe('next.config.mjs Serwist Config Gating', () => {
    it('exports plain nextConfig without webpack hooks when NODE_ENV is not production', () => {
      const result = execSync(
        `node --input-type=module -e "import('./next.config.mjs').then(m => console.log(JSON.stringify({ isWebpackDefined: typeof m.default?.webpack === 'function', hasConfig: !!m.default })))"`,
        {
          cwd: ROOT_DIR,
          env: { ...process.env, NODE_ENV: 'development' },
          encoding: 'utf-8',
        }
      );

      const parsed = JSON.parse(result.trim());
      expect(parsed.hasConfig).toBe(true);
      expect(parsed.isWebpackDefined).toBe(false);
    });

    it('conditionally attaches Serwist webpack hooks when NODE_ENV is production', () => {
      const result = execSync(
        `node --input-type=module -e "import('./next.config.mjs').then(m => console.log(JSON.stringify({ isWebpackDefined: typeof m.default?.webpack === 'function', hasConfig: !!m.default })))"`,
        {
          cwd: ROOT_DIR,
          env: { ...process.env, NODE_ENV: 'production' },
          encoding: 'utf-8',
        }
      );

      const parsed = JSON.parse(result.trim());
      expect(parsed.hasConfig).toBe(true);
      expect(parsed.isWebpackDefined).toBe(true);
    });
  });
});
