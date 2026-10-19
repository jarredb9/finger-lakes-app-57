# Implementation Plan — Phase 1, Task 1: Scaffold Python package structure, `pyproject.toml`, and npm test scripts

## 1. Overview & Objective
Establish the foundational Python package directory structure (`scripts/agent-resolve/agent_resolve/` and `scripts/agent-resolve/tests/`), standard PEP 621 build/dependency metadata (`scripts/agent-resolve/pyproject.toml`), `sys.path` test discovery bootstrap, and npm test runner scripts (`test:agent` and `test:agent:all`) in `package.json`.

In accordance with the Phase 1 Task 1 specification in `plan.md`, `agent_resolve/__init__.py` is scaffolded with version metadata only; public symbol re-exports and `_AgentResolveModule` (`types.ModuleType`) dynamic attribute delegation are deferred to Phase 1 Task 3 (TDD Green phase) after failing unit tests are authored in Phase 1 Task 2 (TDD Red phase).

---

## 2. Target Files & Semantic Insertion Anchors

### 2.1 PEP 621 Package Configuration
- **Path:** `scripts/agent-resolve/pyproject.toml`
- **Action:** Create new file.
- **Anchor:** File root (new file).
- **Structure & Metadata:**
  - `[build-system]`:
    - `requires = ["setuptools>=61.0"]`
    - `build-backend = "setuptools.build_meta"`
  - `[project]`:
    - `name = "agent-resolve"`
    - `version = "0.1.0"`
    - `description = "Autonomous Issue Resolver Harness for GitHub Actions and Scheduled Nightly Runs"`
    - `requires-python = ">=3.12"`
    - `dependencies = ["google-genai>=0.1.0", "pydantic>=2.0.0", "tenacity>=8.2.0"]` (synchronized with root `requirements-agent.txt`)
  - `[project.scripts]`:
    - `agent-resolve = "agent_resolve.cli:main"`
  - `[tool.setuptools.packages.find]`:
    - `where = ["."]`
    - `include = ["agent_resolve*"]`
    - `exclude = ["tests*"]`

### 2.2 Package Root Initialization (Minimal Scaffolding)
- **Path:** `scripts/agent-resolve/agent_resolve/__init__.py`
- **Action:** Create new file.
- **Anchor:** File root (new file).
- **Exports & Signatures:**
  ```python
  __version__: str = "0.1.0"
  __all__: list[str] = ["__version__"]
  ```

### 2.3 Modular Test Suite Bootstrap
- **Path:** `scripts/agent-resolve/tests/__init__.py`
- **Action:** Create new file.
- **Anchor:** File root (new file).
- **Exports & Signatures:**
  ```python
  from pathlib import Path
  import sys

  PACKAGE_ROOT: Path = Path(__file__).resolve().parent.parent
  ```

### 2.4 Developer npm Test Scripts
- **Path:** `package.json`
- **Action:** Modify existing `"scripts"` object.
- **Semantic Insertion Anchor:** Inside `"scripts"`, immediately following `"conductor:prompt": "python3 scripts/agent/generate-prompt.py"` (lines 43–45).
- **Added Script Signatures:**
  ```json
  "test:agent": "python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve",
  "test:agent:all": "python3.12 -m unittest discover -s scripts/__tests__ && python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve"
  ```

### 2.5 Conductor Track Status & Task Registry Updates
- **Path:** `conductor/tracks.md`
  - **Semantic Insertion Anchor:** Table row `| **agent-resolve-decomposition_20261015** | ...` (line 37) and track section heading `- [ ] **Track: Decompose monolithic scripts/agent-resolve/agent-resolve.py into a modular Python package**` (line 41).
  - **Transition:** Update `[ ] New` to `[~] In Progress` in the registry table and `- [ ]` to `- [~]` in the track list.
- **Path:** `conductor/tracks/agent-resolve-decomposition_20261015/plan.md`
  - **Semantic Insertion Anchor:** Line 4 (`- [ ] Task: Scaffold Python package structure, pyproject.toml, and npm test scripts`).
  - **Transition:** Mark `[~]` prior to scaffolding; mark `[x] <commit_sha>` along with sub-items `[x]` after verification.

---

## 3. Interfaces, Types & Exported Signatures

Because this task scaffolds Python packaging infrastructure and Node `package.json` scripts (with no TypeScript modules modified), the formal module contracts are:

```typescript
// package.json scripts contract
interface AgentPackageScripts {
  "test:agent": "python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve";
  "test:agent:all": "python3.12 -m unittest discover -s scripts/__tests__ && python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve";
}
```

```python
# scripts/agent-resolve/agent_resolve/__init__.py
__version__: str
__all__: list[str]

# scripts/agent-resolve/tests/__init__.py
PACKAGE_ROOT: pathlib.Path
```

---

## 4. Behavioral Logic, Conditions & Edge Cases

1. **Flat-Layout Multi-Package Discovery Guard (`pyproject.toml`):**
   - `scripts/agent-resolve/` contains both `agent_resolve/` and `tests/`. Setuptools `>=61.0` raises a multi-package discovery error in flat layouts unless `tool.setuptools.packages.find` explicitly scopes `include = ["agent_resolve*"]` and `exclude = ["tests*"]`.
2. **Zero-Install `sys.path` Bootstrap (`scripts/agent-resolve/tests/__init__.py`):**
   - Compute `PACKAGE_ROOT = Path(__file__).resolve().parent.parent` (`<repo>/scripts/agent-resolve`).
   - Condition: `if str(PACKAGE_ROOT) not in sys.path: sys.path.insert(0, str(PACKAGE_ROOT))`
   - Guarantees that running `unittest` with or without `-t scripts/agent-resolve` and without prior `pip install -e scripts/agent-resolve` resolves `import agent_resolve` to the local `scripts/agent-resolve/agent_resolve` package.
3. **Coexistence with Legacy Monolith During Phase 1 Task 1:**
   - `scripts/agent-resolve/agent-resolve.py` (hyphenated) remains untouched in Task 1 so `python3.12 -m unittest discover -s scripts/__tests__` (which loads `scripts/agent-resolve/agent-resolve.py` via `importlib.util.spec_from_file_location` in a separate process) and `python3.12 -m unittest discover -s scripts/agent-resolve/tests -t scripts/agent-resolve` (which runs in its own process via `&&` in `test:agent:all`) both exit `0` without namespace collision.

---

## 5. Execution Verification Protocol

Run the following verification commands after applying the file changes:

1. **Verify `pyproject.toml` PEP 621 Schema & Metadata via `tomllib`:**
   ```bash
   python3.12 -c 'import tomllib, pathlib; data = tomllib.loads(pathlib.Path("scripts/agent-resolve/pyproject.toml").read_text()); assert data["build-system"]["build-backend"] == "setuptools.build_meta"; assert data["project"]["scripts"]["agent-resolve"] == "agent_resolve.cli:main"; print("pyproject.toml valid:", data["project"]["name"], data["project"]["version"])'
   ```
2. **Verify `agent_resolve` Package Import & Version Metadata:**
   ```bash
   python3.12 -c 'import sys; sys.path.insert(0, "scripts/agent-resolve"); import agent_resolve; assert agent_resolve.__version__ == "0.1.0"; print("agent_resolve.__version__ =", agent_resolve.__version__)'
   ```
3. **Verify Modular Test Runner (`npm run test:agent`):**
   ```bash
   npm run test:agent
   ```
4. **Verify Combined Legacy + Modular Test Runner (`npm run test:agent:all`):**
   ```bash
   npm run test:agent:all
   ```

---

## 6. Post-Execution Commit & Git Notes Protocol

1. **Commit Code Changes (requires `BypassSandbox: true`):**
   ```bash
   git add scripts/agent-resolve/pyproject.toml scripts/agent-resolve/agent_resolve/__init__.py scripts/agent-resolve/tests/__init__.py package.json
   git commit -m "chore(agent-resolve): scaffold Python package structure, pyproject.toml, and npm test scripts"
   ```
2. **Attach Git Note (requires `BypassSandbox: true`):**
   ```bash
   git notes add -m "Task: Scaffold Python package structure, pyproject.toml, and npm test scripts
   Summary: Created PEP 621 pyproject.toml configuration, minimal agent_resolve package __init__.py, tests __init__.py with sys.path fallback bootstrap, and added test:agent / test:agent:all npm scripts.
   Files: scripts/agent-resolve/pyproject.toml, scripts/agent-resolve/agent_resolve/__init__.py, scripts/agent-resolve/tests/__init__.py, package.json
   Rationale: Establishes the formal Python packaging and test discovery foundation for decomposing the monolithic agent-resolve.py script into modular submodules without requiring editable installation in CI." $(git log -1 --format="%H")
   ```
3. **Update Track Plan & Commit (`conductor/tracks.md` and `conductor/tracks/agent-resolve-decomposition_20261015/plan.md`):**
   Record the 7-character commit SHA on Phase 1 Task 1 in `plan.md` and commit with `conductor(plan): Mark task 'Scaffold Python package structure, pyproject.toml, and npm test scripts' as complete`.
