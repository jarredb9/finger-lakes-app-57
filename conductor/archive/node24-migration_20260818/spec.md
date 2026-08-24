# Specification: Node.js 24 Migration & Infrastructure Modernization

## 1. Overview
In response to Vercel's announcement deprecating Node.js 20 for Builds and Functions on October 1, 2026 (following upstream Node.js 20 End-of-Life on April 30, 2026), this track migrates the entire project configuration, local development environment, typing definitions, CI/CD workflows, and deployment configurations to Node.js 24 (LTS codename 'Krypton').

## 2. Functional & Technical Requirements
- **Package Configuration:**
  - Update `package.json` `engines.node` from `"20.x"` to `"24.x"`.
  - Upgrade `@types/node` devDependency from `^20.19.25` to `^24.13.3`.
- **Environment Management:**
  - Update `.nvmrc` from `v20` to `24`.
- **CI/CD Pipeline:**
  - Update `.github/workflows/ci.yml` to set `node-version: '24'` across all workflow jobs (`build`, `e2e-tests`, `merge-reports`, `deploy`).
- **Compatibility, Engine & Incompatibility Strategy:**
  - Audit dependency tree via `npm ls` and engine checks to identify any package with strict `<24` constraints or outdated native C++ bindings (such as `sharp`).
  - For direct packages requiring Node 24 support, apply minimal non-breaking version updates.
  - For transitive sub-dependencies requiring version pins, leverage `overrides` in `package.json`.
  - Verify Next.js 16 App Router build (`next build --webpack`) under Node.js 24 runtime.
  - Verify `@serwist/next` service worker compilation (`app/sw.ts` -> `public/sw.js`) under Node 24.
  - Verify Jest 30 (`jest.config.mjs`) test runner and ESM/CJS interop under Node 24.
  - Verify OpenSSL 3.5 compatibility (ensuring crypto/key constraints don't affect Web Crypto / idb-keyval / auth flows).
- **Documentation & References:**
  - Update `conductor/tech-stack.md` and `.gemini/skills/project-testing-best-practices/references/pw-webkit-stability.md` to reference Node.js 24.

## 3. Non-Functional Requirements
- **Zero Regressions:** PWA offline caching, Jest unit test suites, type checking, and production bundle generation must maintain 100% functionality.
- **Continuous Integration Stability:** All GitHub Actions pipelines must execute cleanly on Node 24 runners.

## 4. Acceptance Criteria
1. `engines.node` in `package.json` is set to `"24.x"`.
2. `@types/node` is updated to `^24.13.3` and `npm run type-check` passes with zero errors.
3. `.nvmrc` specifies `24`.
4. `.github/workflows/ci.yml` uses `node-version: '24'` across all jobs.
5. `npm run test` (Jest) passes all unit tests on Node 24.
6. `npm run build` succeeds cleanly, emitting Next.js production output and Serwist service worker assets.
7. Containerized Playwright E2E verification completes successfully.

## 5. Out of Scope
- Supabase Edge Functions runtime modifications (Supabase Edge Functions operate independently on Deno 2.0).
- Upgrades to major frontend dependencies beyond Node 24 compatibility (Next.js is already on v16, React on v19).
