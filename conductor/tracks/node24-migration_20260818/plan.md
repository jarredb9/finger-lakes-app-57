# Implementation Plan: Node.js 24 Migration

## Phase 1: Environment & Engine Configuration
- [x] Task: Update Node engine specifications and runtime configuration files (ce3eefc)
    - [x] Update `package.json` with `"engines": { "node": "24.x" }` and `@types/node` to `^24.13.3`
    - [x] Update `.nvmrc` to `24`
    - [x] Update `.github/workflows/ci.yml` `node-version` to `'24'` across all jobs (`build`, `e2e-tests`, `merge-reports`, `deploy`)
- [x] Task: Update Project Documentation & Testing Guidelines (050214c)
    - [x] Update `conductor/tech-stack.md` to document Node.js 24 LTS tooling runtime
    - [x] Update `.gemini/skills/project-testing-best-practices/references/pw-webkit-stability.md` rule 13 for Node.js 24
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Environment & Engine Configuration' (Protocol in workflow.md)

## Phase 2: Dependency Auditing & Compatibility Remediation
- [ ] Task: Audit Dependency Graph & Engine Constraints under Node 24
    - [ ] Run `npm install` and audit direct/transitive packages for deprecation warnings or engine conflicts
    - [ ] Verify native module bindings (e.g. `sharp` override) and ABI compatibility under Node 24
- [ ] Task: Verify Type Definitions & Remediate Incompatibilities
    - [ ] Run `npm run type-check` with `@types/node@24`
    - [ ] Apply targeted patch bumps or `package.json` overrides for any incompatible transitive packages
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Dependency Auditing & Compatibility Remediation' (Protocol in workflow.md)

## Phase 3: Build & Test Suite Execution
- [ ] Task: Verify Jest Unit Test Suite under Node 24
    - [ ] Run Jest unit test suite (`npm run test`) and verify 100% test pass rate
- [ ] Task: Verify Production Build & Serwist PWA Compilation
    - [ ] Run `npm run build` to verify Next.js 16 Webpack build and `@serwist/next` service worker generation
- [ ] Task: Verify E2E Playwright Suite in Container
    - [ ] Run containerized Playwright verification (`./scripts/run-e2e-container.sh webkit e2e/smoke.spec.ts`)
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Build & Test Suite Execution' (Protocol in workflow.md)
