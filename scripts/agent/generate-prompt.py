#!/usr/bin/env python3
"""
Conductor Prompt Generator for Antigravity-CLI

Generates optimized Planner and Executor prompts for Conductor tracks,
implementing zero-amnesia mode, strict TDD separation, and token-efficient gates.

Usage:
    python3 scripts/agent/generate-prompt.py [track] [phase] [task]
    python3 scripts/agent/generate-prompt.py 3 1             # Auto-detects active track
    python3 scripts/agent/generate-prompt.py                 # Auto-detects active track and next pending task
    python3 scripts/agent/generate-prompt.py --checkpoint -c # Task-agnostic single-session phase checkpoint prompt
    python3 scripts/agent/generate-prompt.py 3 1 --plan      # Outputs only the plan prompt
    python3 scripts/agent/generate-prompt.py 3 1 --exec      # Outputs only the exec prompt
    python3 scripts/agent/generate-prompt.py 3 1 --red       # Force Red phase prompt (failing tests only)
    python3 scripts/agent/generate-prompt.py 3 1 --green     # Force Green phase prompt (implement to pass tests)
    python3 scripts/agent/generate-prompt.py 3 1 --full      # [Deprecated] Full TDD cycle prompt (violates TDD invariant)
    python3 scripts/agent/generate-prompt.py 3 1 --copy-plan # Copies plan prompt to clipboard
    python3 scripts/agent/generate-prompt.py 3 1 --copy-exec # Copies exec prompt to clipboard
    python3 scripts/agent/generate-prompt.py --recovery      # Outputs recovery prompt for uncommitted changes
"""

import argparse
import base64
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Project root resolution (supports execution from scripts/ or scripts/agent/)
if (Path(__file__).resolve().parents[1] / "package.json").exists():
    PROJECT_ROOT = Path(__file__).resolve().parents[1]
else:
    PROJECT_ROOT = Path(__file__).resolve().parents[2]
TRACKS_REGISTRY = PROJECT_ROOT / "conductor" / "tracks.md"


def get_active_track() -> Optional[str]:
    """Detects in-progress or available track from conductor/tracks.md."""
    if not TRACKS_REGISTRY.exists():
        return None

    content = TRACKS_REGISTRY.read_text(encoding="utf-8")
    
    # Priority 1: Track marked [~] or [ ] In Progress or [~] In Progress
    in_progress = re.findall(
        r"\|\s*\*\*([a-zA-Z0-9_\-]+)\*\*\s*\|.*?\|\s*(?:\[~\]|\[[ ~]\]\s*In Progress)",
        content,
        re.IGNORECASE,
    )
    if in_progress:
        return in_progress[0]

    # Priority 2: Next incomplete track [ ]
    pending = re.findall(r"\|\s*\*\*([a-zA-Z0-9_\-]+)\*\*\s*\|.*?\|\s*\[ \]", content)
    # Exclude any that were already matched by in_progress
    pending = [p for p in pending if p not in in_progress]
    if pending:
        return pending[0]

    # Priority 3: Any track directory under conductor/tracks/
    tracks_dir = PROJECT_ROOT / "conductor" / "tracks"
    if tracks_dir.exists():
        tracks = [d.name for d in tracks_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
        if tracks:
            return tracks[0]

    return None


def resolve_track_dir(track_name):
    """Resolves track directory path whether active or archived."""
    if not track_name:
        return None
    # 1. Direct path (absolute or relative to current working directory or PROJECT_ROOT)
    p = Path(track_name)
    if not p.is_absolute():
        p = (PROJECT_ROOT / p).resolve()
    if p.is_dir() and (p / "plan.md").exists():
        return p

    # 2. Bare track name under conductor/tracks/
    tracks_dir = (PROJECT_ROOT / "conductor" / "tracks" / track_name).resolve()
    if tracks_dir.is_dir():
        return tracks_dir

    # 3. Bare track name under conductor/archive/
    archive_dir = (PROJECT_ROOT / "conductor" / "archive" / track_name).resolve()
    if archive_dir.is_dir():
        return archive_dir

    return tracks_dir


def derive_scope(track_name):
    """Derives a sensible git commit scope from the track name."""
    base = Path(track_name).name.split("_")[0]
    parts = base.split("-")
    return parts[0] if parts else "core"


def _rel_to_project(path: Path) -> str:
    """Returns path relative to PROJECT_ROOT when inside repo, else string path."""
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def is_checkpoint_task(task_desc: str) -> bool:
    """Returns True if task description represents a Phase Completion / Manual Verification checkpoint."""
    desc_lower = task_desc.lower().strip()
    return (
        "manual verification" in desc_lower
        or "protocol in workflow.md" in desc_lower
        or "checkpoint end of phase" in desc_lower
        or desc_lower.startswith("conductor - user manual verification")
    )


def parse_plan_tasks(track_name: Optional[str]) -> Dict[int, Dict[str, Any]]:
    """Parses phases, tasks, and subtasks from track plan.md."""
    track_dir = resolve_track_dir(track_name)
    plan_path = track_dir / "plan.md" if track_dir else None
    if not plan_path or not plan_path.exists():
        return {}

    content = plan_path.read_text(encoding="utf-8")
    phases: Dict[int, Dict[str, Any]] = {}
    current_phase_num = None

    checkpoint_header_re = re.compile(
        r"\s*(?:\[checkpoint:\s*([a-f0-9]{7,40})\]|\[([a-f0-9]{7,40})\])\s*$",
        re.IGNORECASE,
    )
    task_sha_re = re.compile(
        r"\s*(?:\(([a-f0-9]{7,40})\)|\[(?:commit:\s*|checkpoint:\s*)?([a-f0-9]{7,40})\]|([a-f0-9]{7,40}))\s*$",
        re.IGNORECASE,
    )

    for line in content.splitlines():
        # Phase header: e.g., ## Phase 2: On-Demand Enrichment... or ### Phase 1:... or ## Phase: Review Fixes
        phase_match = re.match(r"^(#{2,3})\s+Phase(?:\s+(\d+))?[:\s]+(.*)", line, re.IGNORECASE)
        if phase_match:
            raw_num = phase_match.group(2)
            raw_title = phase_match.group(3).strip()
            cp_match = checkpoint_header_re.search(raw_title)
            checkpoint_sha = None
            if cp_match:
                checkpoint_sha = cp_match.group(1) or cp_match.group(2)
                phase_title = raw_title[: cp_match.start()].strip()
            else:
                phase_title = raw_title

            raw_heading = checkpoint_header_re.sub("", line.strip()).strip()

            if raw_num:
                current_phase_num = int(raw_num)
            else:
                current_phase_num = (max(phases.keys()) + 1) if phases else 1
            phases[current_phase_num] = {
                "name": phase_title,
                "checkpoint_sha": checkpoint_sha,
                "raw_heading": raw_heading,
                "tasks": [],
            }
            continue

        if current_phase_num is not None:
            # Check indented subtask first (indented by 2+ spaces or tabs before - [ ])
            subtask_match = re.match(r"^(?:\s{2,}|\t+)-\s*\[([ x~X])\]\s*(.*)", line)
            if subtask_match and phases[current_phase_num]["tasks"]:
                phases[current_phase_num]["tasks"][-1]["subtasks"].append(subtask_match.group(2).strip())
                continue

            # Top-level Task item (starts at line start)
            task_match = re.match(r"^-\s*\[([ x~X])\]\s+(?:Task(?:\s+\d+)?:)?\s*(.*)", line)
            if task_match:
                status_char = task_match.group(1).lower()
                task_desc = task_match.group(2).strip()
                commit_sha = None
                sha_match = task_sha_re.search(task_desc)
                if sha_match:
                    commit_sha = sha_match.group(1) or sha_match.group(2) or sha_match.group(3)
                    clean_desc = task_desc[: sha_match.start()].strip()
                else:
                    clean_desc = re.sub(
                        r"\s*\[checkpoint:[^\]]+\]\s*$",
                        "",
                        task_desc,
                        flags=re.IGNORECASE,
                    ).strip()

                phases[current_phase_num]["tasks"].append({
                    "status": "complete" if status_char == "x" else ("in_progress" if status_char == "~" else "pending"),
                    "description": clean_desc,
                    "subtasks": [],
                    "commit_sha": commit_sha,
                    "is_checkpoint": is_checkpoint_task(clean_desc),
                    "raw_line": line.strip(),
                })

    return phases


def _verify_git_commit(rev: str, cwd: Path = PROJECT_ROOT) -> Optional[str]:
    """Verifies a git revision resolves to a commit and returns its 7-char short SHA, or None."""
    if not rev:
        return None
    try:
        res = subprocess.run(
            ["git", "rev-parse", "--verify", "--quiet", "--short=7", f"{rev}^{{commit}}"],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=3,
        )
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip()
    except Exception:
        pass
    return None


def resolve_phase_baseline_sha(
    phases: Dict[int, Dict[str, Any]],
    phase_num: Optional[int],
    cwd: Path = PROJECT_ROOT,
) -> Optional[str]:
    """Resolves the baseline commit SHA at the start of phase_num."""
    if phase_num is None or phase_num not in phases:
        return None

    has_git = _verify_git_commit("HEAD", cwd) is not None

    # Tier 1: Walk preceding phases in reverse order
    prior_phases = [p for p in sorted(phases.keys()) if p < phase_num]
    for prev_p in reversed(prior_phases):
        cp_sha = phases[prev_p].get("checkpoint_sha")
        if cp_sha:
            verified = _verify_git_commit(cp_sha, cwd)
            if verified:
                return verified
            if not has_git:
                return cp_sha[:7]

        for t in reversed(phases[prev_p].get("tasks", [])):
            t_sha = t.get("commit_sha")
            if t_sha:
                verified = _verify_git_commit(t_sha, cwd)
                if verified:
                    return verified
                if not has_git:
                    return t_sha[:7]

    # Tier 2: First phase (or no prior phase SHAs recorded)
    for t in phases[phase_num].get("tasks", []):
        t_sha = t.get("commit_sha")
        if t_sha:
            parent_verified = _verify_git_commit(f"{t_sha}~1", cwd)
            if parent_verified:
                return parent_verified
            break

    if has_git:
        for base_ref in ("main", "origin/main"):
            try:
                res = subprocess.run(
                    ["git", "merge-base", "HEAD", base_ref],
                    cwd=str(cwd),
                    capture_output=True,
                    text=True,
                    timeout=3,
                )
                if res.returncode == 0 and res.stdout.strip():
                    verified = _verify_git_commit(res.stdout.strip(), cwd)
                    if verified:
                        return verified
            except Exception:
                continue

    return None


_MUTATING_CMD_RE = re.compile(
    r"\b(db:reset|db:seed|db:gen-types|db:populate|db:start|db:stop|db:restart)\b",
    re.IGNORECASE,
)
_MUTATING_GIT_PREFIXES = (
    "git add",
    "git commit",
    "git notes",
    "git push",
    "git checkout",
    "git reset",
    "rm ",
)
_ALLOWED_VERIFICATION_TOKENS = (
    "run-jest-container.sh",
    "test:container",
    "test:integration:container",
    "run-e2e-container.sh",
    "test:functions",
    "test:agent",
    "type-check",
    "check-types",
    "db:check-types",
    "db:status",
    "db:lint",
    "db:audit",
    "npm test",
    "npm run test",
    "npm run lint",
    "npm run build",
    "build:container",
    "python3",
    "python ",
    "pytest",
    "deno test",
    "npx eslint",
    "npx tsc",
    "npx playwright",
    "npx jest",
)


def filter_idempotent_verification_cmd(cmd: str) -> Optional[str]:
    """Filters a candidate shell command down to idempotent, non-mutating verification gates."""
    if not cmd:
        return None

    segments = [seg.strip() for seg in cmd.split("&&")]
    kept: List[str] = []
    for seg in segments:
        if seg.startswith("! "):
            seg = seg[2:].strip()
        if not seg or seg.startswith("#"):
            continue
        if _MUTATING_CMD_RE.search(seg):
            continue
        seg_lower = seg.lower()
        if any(seg_lower.startswith(prefix) for prefix in _MUTATING_GIT_PREFIXES):
            continue
        if any(token in seg for token in _ALLOWED_VERIFICATION_TOKENS):
            kept.append(seg)

    if not kept:
        return None
    return " && ".join(kept)


def _extract_plan_targets_and_cmds(plan_file: Path) -> Tuple[List[str], List[str]]:
    """Extracts target file paths and verification commands from a task plan markdown file."""
    plan_targets: List[str] = []
    plan_verification_cmds: List[str] = []

    if not plan_file or not plan_file.exists():
        return plan_targets, plan_verification_cmds

    content = plan_file.read_text(encoding="utf-8")

    # 1. Extract target files mentioned in the plan
    target_matches = re.findall(
        r"(?:###\s+(?:Target\s+)?File\s+\d+:\s*(?:\[([^\]]+)\]|`([^`]+)`)|- \*\*Path:\*\*\s*`([^`]+)`|####\s+\[(?:MODIFY|NEW|DELETE)\]\s+([^\n\r]+))",
        content,
    )
    for m in target_matches:
        path_str = m[0] or m[1] or m[2] or m[3]
        if path_str:
            path_str = path_str.strip().strip("`")
            if not path_str.startswith("conductor/") and path_str not in plan_targets:
                plan_targets.append(path_str)

    # 2. Extract commands from Execution Verification Protocol / Plan section
    explicit_targets_found = bool(plan_targets)
    proto_match = re.search(
        r"##\s+(?:\d+\.\s+)?(?:Execution\s+Verification\s+Protocol|(?:Empirical\s+)?Verification\s+Plan|(?:Execution\s+&\s+)?Verification\s+Command)\b.*?\n(.*?)(?=\n##\s|\Z)",
        content,
        re.DOTALL | re.IGNORECASE,
    )
    if proto_match:
        proto_text = proto_match.group(1)
        bash_blocks = re.findall(r"```bash\s*\n(.*?)```", proto_text, re.DOTALL)
        for block in bash_blocks:
            flattened = re.sub(r"\\\s*\n\s*", " ", block)
            for cmd_line in flattened.splitlines():
                cmd_line = cmd_line.strip()
                if cmd_line and not cmd_line.startswith("#"):
                    if cmd_line not in plan_verification_cmds:
                        plan_verification_cmds.append(cmd_line)
                    if not explicit_targets_found:
                        for tf in re.findall(r"(?:^|\s)([a-zA-Z0-9_\-/\.]+\.(?:test|spec)\.[tj]sx?)(?:\s|$)", cmd_line):
                            if tf not in plan_targets and not tf.startswith("conductor/"):
                                plan_targets.append(tf)

    return plan_targets, plan_verification_cmds


def classify_phase_domain(changed_files: List[str], non_checkpoint_tasks: List[Dict[str, Any]]) -> str:
    """Classifies a phase into 'ui', 'database', or 'backend_tooling'."""
    for f in changed_files:
        norm = f.strip()
        if any(norm.startswith(prefix) for prefix in ("app/", "components/", "hooks/", "styles/", "public/")):
            if ".test." not in norm:
                return "ui"
        if norm.startswith("e2e/") and ".spec." in norm:
            return "ui"

    for f in changed_files:
        norm = f.strip()
        if (
            norm.startswith("supabase/")
            or norm.startswith("scripts/db/")
            or norm == "lib/database.types.ts"
            or ("supabase-rpc" in norm and ".test." in norm)
        ):
            return "database"

    all_text = " ".join(
        t.get("description", "") + " " + " ".join(t.get("subtasks", []))
        for t in non_checkpoint_tasks
    ).lower()
    if not changed_files:
        if any(kw in all_text for kw in ("components/", "app/", "e2e/", "playwright", "modal", "ui ")):
            return "ui"
        if any(
            kw in all_text
            for kw in (
                "supabase/",
                "database.types.ts",
                "rls",
                "security invoker",
                "migration",
                "security advisor linter",
                "db:check-types",
                "config.toml",
            )
        ):
            return "database"

    return "backend_tooling"


def collect_phase_checkpoint_context(
    track_name: str,
    phase_num: Optional[int],
    task_num: Optional[int],
    phases: Optional[Dict[int, Dict[str, Any]]] = None,
    cwd: Path = PROJECT_ROOT,
) -> Dict[str, Any]:
    """Collects pre-computed git scope, sibling plan targets, filtered verification commands, and domain."""
    if phases is None:
        phases = parse_plan_tasks(track_name)

    track_dir = resolve_track_dir(track_name)
    phase_info = phases.get(phase_num, {}) if phase_num is not None else {}
    phase_tasks = phase_info.get("tasks", [])
    non_checkpoint_tasks = [t for t in phase_tasks if not t.get("is_checkpoint")]

    checkpoint_plan_path = (
        track_dir / f"phase-{phase_num}-task-{task_num}-plan.md"
        if (track_dir and phase_num is not None and task_num is not None)
        else None
    )
    has_checkpoint_plan = bool(checkpoint_plan_path and checkpoint_plan_path.exists())

    # Discover all sibling plan files in this phase (task_idx != task_num)
    sibling_plans: List[Tuple[int, Path]] = []
    if track_dir and track_dir.exists() and phase_num is not None:
        pattern = re.compile(rf"^phase-{phase_num}-task-(\d+)-plan\.md$")
        for p in track_dir.iterdir():
            if p.is_file():
                m = pattern.match(p.name)
                if m:
                    idx = int(m.group(1))
                    if idx != task_num:
                        sibling_plans.append((idx, p))
        sibling_plans.sort(key=lambda item: item[0])

    sibling_targets: List[str] = []
    harvested_raw_cmds: List[str] = []

    for _, sp_path in sibling_plans:
        t_files, t_cmds = _extract_plan_targets_and_cmds(sp_path)
        for tf in t_files:
            if tf not in sibling_targets:
                sibling_targets.append(tf)
        for cmd in t_cmds:
            if cmd not in harvested_raw_cmds:
                harvested_raw_cmds.append(cmd)

    # Scan all non-checkpoint tasks in the phase for backticked commands and file paths
    for t in non_checkpoint_tasks:
        texts = [t.get("description", "")] + list(t.get("subtasks", []))
        for line in texts:
            for m in re.findall(r"`([^`]+)`", line):
                m_clean = m.strip()
                if any(
                    m_clean.startswith(prefix)
                    for prefix in [
                        "npm ",
                        "./scripts/",
                        "npx ",
                        "node ",
                        "pytest ",
                        "deno ",
                        "python3",
                        "python ",
                        "TEST_TYPE=",
                    ]
                ):
                    if m_clean not in harvested_raw_cmds:
                        harvested_raw_cmds.append(m_clean)
                elif (
                    "/" in m_clean
                    and " " not in m_clean
                    and not m_clean.startswith("conductor/")
                    and re.match(r"^[a-zA-Z0-9_\-/\.]+\.[a-zA-Z0-9]+$", m_clean)
                ):
                    if m_clean not in sibling_targets:
                        sibling_targets.append(m_clean)

    baseline_sha = resolve_phase_baseline_sha(phases, phase_num, cwd=cwd)

    # Compute changed files via git diff if baseline_sha resolves in git AND this phase has started
    phase_has_activity = any(
        t.get("status") in ("complete", "in_progress") or t.get("commit_sha")
        for t in non_checkpoint_tasks
    )
    git_changed_files: List[str] = []
    if phase_has_activity and baseline_sha and _verify_git_commit(baseline_sha, cwd=cwd):
        for diff_args in (
            ["git", "diff", "--name-only", baseline_sha, "HEAD"],
            ["git", "diff", "--name-only", "HEAD"],
        ):
            try:
                res = subprocess.run(
                    diff_args,
                    cwd=str(cwd),
                    capture_output=True,
                    text=True,
                    timeout=3,
                )
                if res.returncode == 0:
                    for line in res.stdout.splitlines():
                        f_path = line.strip()
                        if f_path and not f_path.startswith("conductor/") and f_path not in git_changed_files:
                            git_changed_files.append(f_path)
            except Exception:
                pass

    changed_files: List[str] = list(git_changed_files)
    for st in sibling_targets:
        if st not in changed_files:
            changed_files.append(st)

    # Build deduplicated, idempotent verification commands
    commands: List[str] = []
    if has_checkpoint_plan and checkpoint_plan_path is not None:
        _, cp_cmds = _extract_plan_targets_and_cmds(checkpoint_plan_path)
        for raw_c in cp_cmds:
            filtered = filter_idempotent_verification_cmd(raw_c)
            if filtered and filtered not in commands:
                commands.append(filtered)

    if not commands:
        for raw_c in harvested_raw_cmds:
            filtered = filter_idempotent_verification_cmd(raw_c)
            if filtered and filtered not in commands:
                commands.append(filtered)

        has_ts_targets = any(f.endswith((".ts", ".tsx")) for f in changed_files)
        if commands and has_ts_targets and not any("type-check" in c or "check-types" in c for c in commands):
            commands.append("npm run type-check")

    if not commands:
        # Derive targeted commands from changed_files
        int_tests = [f for f in changed_files if ".integration.test." in f]
        unit_tests = [f for f in changed_files if ".test." in f and ".integration.test." not in f]
        e2e_specs = [f for f in changed_files if f.endswith(".spec.ts") or (f.startswith("e2e/") and ".spec." in f)]
        has_edge = any(f.startswith("supabase/functions/") for f in changed_files)
        has_py = any(f.endswith(".py") for f in changed_files)
        has_ts = any(f.endswith((".ts", ".tsx")) for f in changed_files)

        if int_tests:
            commands.append(f"npm run test:integration:container -- {' '.join(int_tests)}")
        if unit_tests:
            commands.append(f"./scripts/containers/run-jest-container.sh {' '.join(unit_tests)}")
        if e2e_specs:
            commands.append(f"./scripts/containers/run-e2e-container.sh webkit {' '.join(e2e_specs)}")
        if has_edge:
            commands.append("npm run test:functions")
        if has_py:
            commands.append("npm run test:agent:all")
        if has_ts and not any("type-check" in c or "check-types" in c for c in commands):
            commands.append("npm run type-check")

        if not commands:
            domain_guess = classify_phase_domain(changed_files, non_checkpoint_tasks)
            if domain_guess == "database":
                commands = ["npm run db:check-types:local"]
            else:
                commands = [
                    "./scripts/containers/run-jest-container.sh",
                    "npm run type-check",
                ]

    # Ensure type-check sits after test runners when automatically appended
    domain = classify_phase_domain(changed_files, non_checkpoint_tasks)

    return {
        "baseline_sha": baseline_sha,
        "changed_files": changed_files,
        "sibling_plans": [ _rel_to_project(p) for _, p in sibling_plans ],
        "commands": commands,
        "domain": domain,
        "has_checkpoint_plan": has_checkpoint_plan,
        "clean_phase_name": phase_info.get("name", f"Phase {phase_num}"),
        "raw_heading": phase_info.get("raw_heading", f"## Phase {phase_num}: {phase_info.get('name', '')}".strip()),
    }


def find_next_pending_task(phases):
    """Finds the first pending (or in_progress) phase and task number."""
    for phase_num in sorted(phases.keys()):
        for task_idx, task in enumerate(phases[phase_num]["tasks"], start=1):
            if task["status"] in ("pending", "in_progress"):
                return phase_num, task_idx, task["description"], task.get("subtasks", [])
    return None, None, None, []


def copy_to_clipboard(text: str) -> bool:
    """Attempts to copy text to system clipboard via GUI tools (xclip, wl-copy, pbcopy, xsel)
    or terminal escape sequences (OSC 52 for SSH/tmux/headless environments)."""
    tools = [
        ["xclip", "-selection", "clipboard"],
        ["wl-copy"],
        ["pbcopy"],
        ["xsel", "--clipboard", "--input"],
    ]
    for cmd in tools:
        try:
            p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
            p.communicate(input=text.encode("utf-8"))
            if p.returncode == 0:
                return True
        except (FileNotFoundError, OSError):
            continue

    # Fallback: OSC 52 ANSI escape sequence for terminal / SSH / devcontainers
    try:
        b64_data = base64.b64encode(text.encode("utf-8")).decode("ascii")
        osc52 = f"\033]52;c;{b64_data}\a"
        try:
            with open("/dev/tty", "w") as tty:
                tty.write(osc52)
                tty.flush()
                return True
        except OSError:
            if sys.stderr.isatty():
                sys.stderr.write(osc52)
                sys.stderr.flush()
                return True
    except Exception:
        pass

    return False


def infer_verification_strategy(
    track_name: str,
    phase_num: Optional[int],
    task_num: Optional[int],
    task_desc: str = "",
    subtasks: Optional[List[str]] = None,
    mode: Optional[str] = None,
) -> Dict[str, Any]:
    """Infers the optimal targeted verification strategy and commit message
    by inspecting the task description, subtasks, target files, and plan document."""
    scope = derive_scope(track_name)
    track_dir = resolve_track_dir(track_name)
    plan_file = track_dir / f"phase-{phase_num}-task-{task_num}-plan.md" if track_dir else None

    plan_targets = []
    plan_verification_cmds = []

    if plan_file and plan_file.exists():
        content = plan_file.read_text(encoding="utf-8")

        # 1. Extract target files mentioned in the plan
        target_matches = re.findall(
            r"(?:###\s+(?:Target\s+)?File\s+\d+:\s*(?:\[([^\]]+)\]|`([^`]+)`)|- \*\*Path:\*\*\s*`([^`]+)`|####\s+\[(?:MODIFY|NEW|DELETE)\]\s+([^\n\r]+))",
            content,
        )
        for m in target_matches:
            path_str = m[0] or m[1] or m[2] or m[3]
            if path_str:
                path_str = path_str.strip().strip("`")
                # Exclude plan tracking files
                if not path_str.startswith("conductor/"):
                    if path_str not in plan_targets:
                        plan_targets.append(path_str)

        # 2. Extract commands from Execution Verification Protocol / Plan section
        proto_match = re.search(
            r"##\s+(?:\d+\.\s+)?(?:Execution\s+Verification\s+Protocol|(?:Empirical\s+)?Verification\s+Plan|(?:Execution\s+&\s+)?Verification\s+Command)\b.*?\n(.*?)(?=\n##\s|\Z)",
            content,
            re.DOTALL | re.IGNORECASE,
        )
        if proto_match:
            proto_text = proto_match.group(1)
            bash_blocks = re.findall(r"```bash\s*\n(.*?)```", proto_text, re.DOTALL)
            for block in bash_blocks:
                flattened = re.sub(r"\\\s*\n\s*", " ", block)
                for cmd_line in flattened.splitlines():
                    cmd_line = cmd_line.strip()
                    if cmd_line and not cmd_line.startswith("#"):
                        if cmd_line not in plan_verification_cmds:
                            plan_verification_cmds.append(cmd_line)
                        # Extract test files mentioned directly in plan verification commands
                        for tf in re.findall(r"(?:^|\s)([a-zA-Z0-9_\-/\.]+\.(?:test|spec)\.[tj]sx?)(?:\s|$)", cmd_line):
                            if tf not in plan_targets and not tf.startswith("conductor/"):
                                plan_targets.append(tf)

    if subtasks is None:
        subtasks = []

    all_task_text = task_desc + "\n" + "\n".join(subtasks)
    desc_lower = all_task_text.lower()
    task_desc_lower = task_desc.lower()

    is_checkpoint = (mode == "checkpoint") or (mode is None and is_checkpoint_task(task_desc))

    # Determine execution mode: 'checkpoint', 'red', 'green', or 'full' (legacy)
    if mode in ("red", "green", "full", "checkpoint"):
        resolved_mode = mode
    elif is_checkpoint:
        resolved_mode = "checkpoint"
    else:
        # Strict TDD separation: default to red or green, never auto-infer full composite
        if (
            task_desc_lower.startswith("write failing")
            or "red phase" in task_desc_lower
            or "(red)" in task_desc_lower
            or "failing unit test" in task_desc_lower
            or "failing test" in task_desc_lower
            or "failing integration" in task_desc_lower
        ):
            resolved_mode = "red"
        else:
            resolved_mode = "green"

    is_red = (resolved_mode == "red")

    # Only fall back to regex scanning task_desc/subtasks if the task plan did not define any targets
    if not plan_targets and not plan_verification_cmds:
        test_file_matches = re.findall(r"(?:`|'|\")?([a-zA-Z0-9_\-/\.]+\.(?:test|spec)\.[tj]sx?)(?:`|'|\")?", all_task_text)
        for tf in test_file_matches:
            if tf not in plan_targets and not tf.startswith("conductor/"):
                plan_targets.append(tf)

    def clean_test_paths(paths):
        unique_paths = []
        for p in paths:
            if p not in unique_paths:
                unique_paths.append(p)
        # If both a full path ('dir/foo.test.ts') and bare basename ('foo.test.ts') exist, discard bare basename
        refined = []
        for p in unique_paths:
            if "/" not in p and any(other != p and other.endswith("/" + p) for other in unique_paths):
                continue
            refined.append(p)
        return refined

    spec_files = clean_test_paths([t for t in plan_targets if t.endswith(".spec.ts") or t.startswith("e2e/")])
    unit_files = clean_test_paths([t for t in plan_targets if ".test." in t])
    edge_files = clean_test_paths([t for t in plan_targets if "supabase/functions" in t])

    has_spec = len(spec_files) > 0 or "e2e" in desc_lower or "playwright" in desc_lower
    has_unit = len(unit_files) > 0 or "unit test" in desc_lower or ".test." in desc_lower
    has_edge = len(edge_files) > 0 or "edge function" in desc_lower or "deno" in desc_lower
    wants_type_check = "type-check" in desc_lower or "type checking" in desc_lower or "types pass" in desc_lower
    is_full_suite = (
        "full automated" in desc_lower
        or "full test suite" in desc_lower
        or "full regression" in desc_lower
        or "regression test execution" in desc_lower
        or "regression verification" in desc_lower
        or "type verification" in desc_lower
        or "quality gates" in desc_lower
        or "repository-wide verification" in desc_lower
    )

    # Look for explicit executable commands in subtasks (e.g. `npm run db:check-types:local`, `npm run lint`)
    explicit_subtask_cmds = []
    for line in subtasks:
        for m in re.findall(r"`([a-zA-Z0-9_\-:\./\s]+)`", line):
            m = m.strip()
            if any(
                m.startswith(prefix)
                for prefix in ["npm ", "./scripts/", "npx ", "node ", "pytest ", "deno ", "python3", "python "]
            ):
                if m not in explicit_subtask_cmds:
                    explicit_subtask_cmds.append(m)

    has_py_only = bool(plan_targets) and all(t.endswith((".py", ".toml")) for t in plan_targets)
    should_type_check = wants_type_check or (resolved_mode == "green" and not has_py_only)

    is_green_impl = "green phase" in task_desc_lower or task_desc_lower.startswith("implement ")
    default_verb = (
        "test"
        if (
            is_red
            or (
                not is_green_impl
                and (is_full_suite or "regression" in task_desc_lower or "test execution" in task_desc_lower)
            )
        )
        else (
            "refactor"
            if "refactor" in task_desc_lower
            else ("chore" if ("cleanup" in task_desc_lower or "scaffolding" in task_desc_lower) else "feat")
        )
    )

    instruction = "- Run targeted verification commands and confirm all checks pass cleanly."
    checkpoint_ctx: Optional[Dict[str, Any]] = None

    if is_checkpoint:
        checkpoint_ctx = collect_phase_checkpoint_context(track_name, phase_num, task_num)
        commands = list(checkpoint_ctx["commands"])
        instruction = "- Verify phase test coverage and diff-gated verification commands, present domain-appropriate manual verification to user, await confirmation, create checkpoint commit and auditable git notes."
        commit_msg = f"conductor(checkpoint): Checkpoint end of Phase {phase_num}"
    elif is_full_suite:
        # Full automated regression run
        if plan_verification_cmds:
            commands = list(plan_verification_cmds)
            if should_type_check and not any("type-check" in c for c in commands):
                commands.append("npm run type-check")
            instruction = "- Execute the verification protocol from the plan and confirm all checks pass."
        elif explicit_subtask_cmds and not has_unit and not has_spec:
            commands = list(explicit_subtask_cmds)
            if should_type_check and not any("type-check" in c or "check-types" in c for c in commands):
                commands.append("npm run type-check")
            instruction = "- Run targeted verification commands and confirm all checks pass cleanly."
        else:
            target_spec = (" " + " ".join(spec_files)) if spec_files else ""
            commands = [
                "./scripts/containers/run-jest-container.sh",
                "npm run type-check",
            ]
            if has_edge or "edge function" in desc_lower or "deno" in desc_lower:
                commands.append("npm run test:functions")
            if has_spec or spec_files or "e2e" in desc_lower or "playwright" in desc_lower:
                commands.append(f"./scripts/containers/run-e2e-container.sh webkit{target_spec}".strip())
            instruction = "- Verify full test suite and TypeScript types pass cleanly before committing."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Execute full automated test suite for Phase {phase_num} Task {task_num}'}"
    elif is_red:
        # Red phase: failing tests
        if plan_verification_cmds:
            commands = plan_verification_cmds
        elif has_spec and not has_unit:
            target_arg = (" " + " ".join(spec_files)) if spec_files else ""
            commands = [f"./scripts/containers/run-e2e-container.sh webkit{target_arg}".strip()]
        else:
            target_arg = (" " + " ".join(unit_files)) if unit_files else ""
            commands = [f"./scripts/containers/run-jest-container.sh{target_arg}".strip()]
        instruction = "- Confirm new tests fail with expected assertions (Red phase). DO NOT implement application code."
        commit_msg = f"test({scope}): {task_desc or f'Add failing tests for Phase {phase_num} Task {task_num}'}"
    elif has_spec and has_unit:
        # Both unit tests and E2E specs targeted
        if plan_verification_cmds:
            commands = list(plan_verification_cmds)
        else:
            target_spec = (" " + " ".join(spec_files)) if spec_files else ""
            unit_arg = (" " + " ".join(unit_files)) if unit_files else ""
            commands = [
                f"./scripts/containers/run-jest-container.sh{unit_arg}".strip(),
                f"./scripts/containers/run-e2e-container.sh webkit{target_spec}".strip(),
            ]
        if should_type_check and not any("type-check" in c for c in commands):
            commands.append("npm run type-check")
        instruction = "- Verify unit tests and newly created/modified E2E specs pass cleanly before committing."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    elif has_spec and not has_unit:
        # Pure E2E spec task
        if plan_verification_cmds:
            commands = list(plan_verification_cmds)
        else:
            target_arg = (" " + " ".join(spec_files)) if spec_files else ""
            commands = [f"./scripts/containers/run-e2e-container.sh webkit{target_arg}".strip()]
        if should_type_check and not any("type-check" in c for c in commands):
            commands.append("npm run type-check")
        instruction = "- Verify targeted E2E suite passes cleanly in WebKit."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    elif has_edge and not has_unit and not has_spec:
        if plan_verification_cmds:
            commands = list(plan_verification_cmds)
        else:
            commands = ["npm run test:functions"]
        if should_type_check and not any("type-check" in c for c in commands):
            commands.append("npm run type-check")
        instruction = "- Verify edge function tests pass cleanly."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    elif has_unit:
        # Targeted unit tests
        if plan_verification_cmds:
            commands = list(plan_verification_cmds)
            instruction = "- Execute the verification protocol from the plan and confirm all checks pass."
        elif unit_files:
            target_arg = " " + " ".join(unit_files)
            commands = [f"./scripts/containers/run-jest-container.sh{target_arg}".strip()]
            instruction = "- Verify targeted unit/integration tests pass cleanly (Green phase)."
        elif explicit_subtask_cmds:
            commands = list(explicit_subtask_cmds)
            instruction = "- Run targeted verification commands and confirm all checks pass cleanly."
        else:
            commands = ["./scripts/containers/run-jest-container.sh"]
            instruction = "- Verify targeted unit/integration tests pass cleanly (Green phase)."
        if should_type_check and not any("type-check" in c for c in commands):
            commands.append("npm run type-check")
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    elif plan_verification_cmds:
        commands = list(plan_verification_cmds)
        if should_type_check and not any("type-check" in c for c in commands):
            commands.append("npm run type-check")
        instruction = "- Execute the verification protocol from the plan and confirm all checks pass."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    elif explicit_subtask_cmds:
        commands = list(explicit_subtask_cmds)
        if should_type_check and not any("type-check" in c or "check-types" in c for c in commands):
            commands.append("npm run type-check")
        instruction = "- Run targeted verification commands and confirm all checks pass cleanly."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"
    else:
        commands = ["./scripts/containers/run-jest-container.sh"]
        if should_type_check:
            commands.append("npm run type-check")
        instruction = "- Run containerized Jest to verify tests pass (Green phase)."
        commit_msg = f"{default_verb}({scope}): {task_desc or f'Implement Phase {phase_num} Task {task_num}'}"

    # Merge any explicit commands in subtasks that are not already present
    for cmd in explicit_subtask_cmds:
        if cmd not in commands:
            commands.append(cmd)

    return {
        "commands": commands,
        "instruction": instruction,
        "commit_msg": commit_msg,
        "mode": resolved_mode,
        "is_red": is_red,
        "is_checkpoint": is_checkpoint,
        "checkpoint_context": checkpoint_ctx,
    }


def get_preceding_context(track_name: str, phase_num: Optional[int], task_num: Optional[int]) -> str:
    """Gathers link to nearest preceding task plan in the phase for token-efficient progressive disclosure."""
    track_dir = resolve_track_dir(track_name)
    if not track_dir or task_num is None or task_num <= 1:
        return ""

    for prev_k in range(task_num - 1, 0, -1):
        candidate = track_dir / f"phase-{phase_num}-task-{prev_k}-plan.md"
        if candidate.exists():
            rel_p = _rel_to_project(candidate)
            note = f"Immediate Preceding Context: @[{rel_p}]"
            if task_num > 2:
                earlier = [f"Task {i}" for i in range(1, task_num) if i != prev_k]
                phase_label = f"Phase {phase_num}" if phase_num is not None else "this phase"
                note += f" (earlier completed in {phase_label}: {', '.join(earlier)})"
            return note

    return ""


def build_plan_prompt(track_name: str, phase_num: Optional[int], task_num: Optional[int], task_desc: str = "") -> str:
    track_dir = resolve_track_dir(track_name)
    rel_track_dir = _rel_to_project(track_dir) if track_dir else f"conductor/tracks/{track_name}"
    plan_file = f"{rel_track_dir}/phase-{phase_num}-task-{task_num}-plan.md"
    task_focus = f" for '{task_desc}'" if task_desc else ""
    context_hint = get_preceding_context(track_name, phase_num, task_num)
    context_line = f"\n\n{context_hint}" if context_hint else ""

    strategy = infer_verification_strategy(track_name, phase_num, task_num, task_desc)
    if strategy.get("is_checkpoint"):
        return f"""/conductor:implement @[{rel_track_dir}] Plan Phase {phase_num} Task {task_num} only{task_focus}.{context_line}

Gate & Planning Protocol (Phase Completion Verification & Checkpointing):
- Reference the Phase Completion Verification and Checkpointing Protocol in conductor/workflow.md.
- Perform static code inspection focused on the phase scope (no test runs or builds during planning).
- Write the verification plan directly to: {plan_file}
- Plan Blueprint Requirements:
  1. Scope Inspection: Define the git diff range since previous phase checkpoint (`git diff --name-only <prev_sha> HEAD`) and list all changed code files.
  2. Test Coverage Audit: Verify all modified code files have corresponding test files; specify any missing tests to generate.
  3. Automated Verification Commands: Phase-scoped verification commands (`./scripts/containers/run-jest-container.sh`, `npm run type-check`, integration/E2E specs).
  4. Manual Verification Steps: Actionable step-by-step verification plan for the user (Frontend: dev server, localhost:3000, specific visual behaviors; Database/Backend: CLI/SQL/invariant checks).
  5. Post-Execution Protocol: Define checkpoint commit `conductor(checkpoint): Checkpoint end of Phase {phase_num}`, git notes report format, and plan.md update with `[checkpoint: <sha>]`.
- Halt for user approval via modal before proceeding."""

    return f"""/conductor:implement @[{rel_track_dir}] Plan Phase {phase_num} Task {task_num} only{task_focus}.{context_line}

Gate & Planning Protocol:
- Perform static code inspection focused on the target seam (no test runs or builds during planning).
- Write the implementation plan directly to: {plan_file}
- Plan Blueprint Requirements:
  1. Exact target file paths (format as `- **Path:** `filepath``) and semantic insertion anchors.
  2. Full TypeScript interfaces, prop types, and exported function signatures.
  3. Precise behavioral logic (formulas, state transitions, conditions, error handling, edge cases).
  4. Execution Verification Protocol with exact test commands to run (e.g. ./scripts/containers/run-jest-container.sh <test> or ./scripts/containers/run-e2e-container.sh webkit <spec>).
  Omit verbatim multi-page code implementations; the executor will synthesize code directly using the blueprint with compiler and test feedback.
- In the plan's Post-Execution section, format the `git notes add` command using the standard fields: Task, Summary, Files, and Rationale.
- Halt for user approval via modal before modifying any files."""


def extract_post_execution_info(plan_file: Optional[Path]) -> Tuple[Optional[str], Optional[str]]:
    """Extracts the post-execution section reference and any explicit task commit message from the plan file.

    Returns:
        (section_ref, explicit_commit_msg)
    """
    if not plan_file or not plan_file.exists():
        return None, None

    content = plan_file.read_text(encoding="utf-8")
    match = re.search(
        r"^##\s+(?:(\d+)\.\s+)?(.*?Post-Execution.*|.*?Task Completion.*|.*?Commit Protocol.*)$",
        content,
        re.MULTILINE | re.IGNORECASE,
    )
    if not match:
        return None, None

    section_num = match.group(1)
    section_title = match.group(2).strip()
    section_ref = f"Section {section_num} ({section_title})" if section_num else f"the '{section_title}' section"

    # Extract git commit message from the post-execution section if specified
    start_pos = match.start()
    next_heading = re.search(r"^##\s+", content[match.end():], re.MULTILINE)
    post_exec_block = content[start_pos : match.end() + next_heading.start()] if next_heading else content[start_pos:]
    commit_matches = re.findall(
        r"git commit(?:\s+[^\"\x27\n]*)?\s+-m\s+[\"\x27]([^\x27\"]+)[\"\x27]",
        post_exec_block,
    )
    explicit_commit = None
    for c in commit_matches:
        if not c.startswith("conductor(") and not c.startswith("conductor/"):
            explicit_commit = c
            break

    return section_ref, explicit_commit


def build_checkpoint_prompt(
    track_name: str,
    phase_num: Optional[int],
    task_num: Optional[int],
    task_desc: str,
    strategy: Dict[str, Any],
) -> str:
    """Builds a self-contained, diff-gated single-session Phase Checkpoint prompt."""
    track_dir = resolve_track_dir(track_name)
    rel_track_dir = _rel_to_project(track_dir) if track_dir else f"conductor/tracks/{track_name}"
    plan_file = f"{rel_track_dir}/phase-{phase_num}-task-{task_num}-plan.md"

    ctx = strategy.get("checkpoint_context") or collect_phase_checkpoint_context(track_name, phase_num, task_num)
    clean_phase_name = ctx.get("clean_phase_name", f"Phase {phase_num}")
    raw_heading = ctx.get("raw_heading", f"## Phase {phase_num}: {clean_phase_name}")
    baseline_sha = ctx.get("baseline_sha")
    changed_files = ctx.get("changed_files", [])
    domain = ctx.get("domain", "backend_tooling")
    has_checkpoint_plan = ctx.get("has_checkpoint_plan", False)

    plan_ref_clause = f" and @[{plan_file}]" if has_checkpoint_plan else ""
    range_line = f"- Git range: `{baseline_sha}..HEAD`" if baseline_sha else "- Git range: current phase commits (`git status --short`)"
    if changed_files:
        files_block = "\n".join(f"  - `{f}`" for f in changed_files[:20])
    else:
        files_block = "  - *(No code file diffs detected yet; inspect `git status --short`)*"

    cmd_lines = "\n".join(f"     {c}" for c in strategy["commands"])
    diff_check_cmd = f"`git diff --name-only {baseline_sha} HEAD` and `git status --short`" if baseline_sha else "`git status --short`"

    if domain == "ui":
        manual_directive = (
            "UI / Frontend Phase: Present a concise manual verification checklist with exact browser steps "
            "(`http://localhost:3000`, target view/interaction, and expected visual outcome)."
        )
    elif domain == "database":
        manual_directive = (
            "Database / Schema Phase (no UI changes — do NOT invent `localhost:3000` browser steps): "
            "Present a concise verification summary with 1–3 local CLI/SQL/linter spot-checks "
            "(e.g., `npm run db:lint`, `npx supabase db execute ...`, `npm run db:check-types:local`)."
        )
    else:
        manual_directive = (
            "Backend / Service / Tooling Phase (no UI changes — do NOT invent `localhost:3000` browser steps): "
            "Present a concise verification summary with 1–3 targeted CLI/grep/invariant spot-checks."
        )

    effective_task_desc = task_desc or f"Conductor - User Manual Verification 'Phase {phase_num}: {clean_phase_name}' (Protocol in workflow.md)"

    return f"""Execute Phase {phase_num} Checkpoint (Task {task_num}) for 'Phase {phase_num}: {clean_phase_name}' in @[{rel_track_dir}]{plan_ref_clause}.

Pre-Computed Phase Scope:
{range_line}
- Phase touched / targeted files:
{files_block}

Checkpoint Execution Directives (Self-Contained — Zero Extra Doc Reads):
1. Zero-Overhead Scope & Coverage Audit:
   - Do NOT read `conductor/workflow.md`, `product.md`, or `product-guidelines.md`; this prompt contains the complete checkpoint protocol.
   - Run {diff_check_cmd} to confirm working tree cleanliness and verify all modified code files in Phase {phase_num} have corresponding test coverage.
2. Diff-Gated Automated Verification (Warm & Cold Session Safe):
   - **Warm-Session Fast Path:** If this session ALREADY executed and passed verification covering all changed files in Phase {phase_num}, AND zero non-`conductor/` code, SQL, or config files were modified after that passing test run (including during any intervening refactor/cleanup task or uncommitted edits), **SKIP re-running test containers** and cite the passing commands and results from earlier in this session.
   - **Cold-Session / Post-Edit Fallback:** If running in a fresh session OR any non-`conductor/` file changed after the last passing test run, execute ONLY these phase-scoped verification commands (use `BypassSandbox: true` for container/`db:*` runners):
{cmd_lines}
3. Domain-Aware Manual Verification & User Confirmation Gate:
   - {manual_directive}
   - Pause via `ask_question` for explicit user approval (`AGENTS.md` Guardrail #5: `User Skipped` or dismissal is strictly non-affirmative — halt immediately without committing).
4. Verbatim Phase Closure (Execute ONLY After Explicit Affirmative Approval):
   - Create empty checkpoint commit (`BypassSandbox: true`):
     `git commit --allow-empty -m "conductor(checkpoint): Checkpoint end of Phase {phase_num}"`
   - Capture `<full_sha>` (`git rev-parse HEAD`) and `<short_sha>` (`git rev-parse --short HEAD`), then attach verification git note (`BypassSandbox: true`):
     `git notes add -m "Phase: Phase {phase_num}: {clean_phase_name}\\nAutomated Tests:\\n<commands & results>\\nManual Verification:\\n<summary>\\nUser Confirmation: Explicitly approved via interactive modal." <full_sha>`
   - Update `{rel_track_dir}/plan.md` in a single edit:
     a. Append `[checkpoint: <short_sha>]` to heading `{raw_heading}` -> `{raw_heading} [checkpoint: <short_sha>]`
     b. Mark Task {task_num} complete: `- [x] Task: {effective_task_desc} [commit: <short_sha>]`
   - Commit plan update (`BypassSandbox: true`):
     `git add {rel_track_dir}/plan.md && git commit -m "conductor(plan): Mark phase 'Phase {phase_num}: {clean_phase_name}' as complete"`
5. Output a brief completion summary and halt."""


def build_exec_prompt(
    track_name: str,
    phase_num: Optional[int],
    task_num: Optional[int],
    task_desc: str = "",
    subtasks: Optional[List[str]] = None,
    mode: Optional[str] = None,
) -> str:
    track_dir = resolve_track_dir(track_name)
    rel_track_dir = _rel_to_project(track_dir) if track_dir else f"conductor/tracks/{track_name}"
    plan_path = track_dir / f"phase-{phase_num}-task-{task_num}-plan.md" if track_dir else None
    plan_file = f"{rel_track_dir}/phase-{phase_num}-task-{task_num}-plan.md"
    strategy = infer_verification_strategy(track_name, phase_num, task_num, task_desc, subtasks, mode)

    if strategy["mode"] == "checkpoint":
        return build_checkpoint_prompt(track_name, phase_num, task_num, task_desc, strategy)

    post_exec_ref, plan_commit_msg = extract_post_execution_info(plan_path)
    commit_msg = plan_commit_msg or strategy["commit_msg"]

    cmd_lines = "\n".join(f"     {c}" for c in strategy["commands"])

    if strategy["mode"] == "red":
        verification_block = f"""2. Targeted Verification (Red Phase):
   - Run test runner to confirm new tests fail with expected assertions:
{cmd_lines}
   - Verify failure matches expectations. Do not implement production code in this task."""
    elif strategy["mode"] == "full":
        verification_block = f"""2. Targeted Verification (Full TDD Cycle - Note: TDD features should be split into separate Red and Green tasks):
   - Step 2.1 (Red Phase): Run test runner to confirm new tests fail with expected assertions:
{cmd_lines}
   - Step 2.2 (Green Phase): Implement application code in target files and re-run runner with type-check:
{cmd_lines}
   - Confirm all tests pass cleanly before committing."""
    else:
        verification_block = f"""2. Targeted Verification (Green Phase):
   - Run targeted test runner (with BypassSandbox: true for container runners) and type check for created/modified files:
{cmd_lines}
   - If tests fail, diagnose within the target seam, adjust implementation or fixtures, and re-verify until green."""

    if post_exec_ref:
        post_exec_directive = f"Follow {post_exec_ref} of @[{plan_file}]."
    else:
        post_exec_directive = f"Follow the Post-Execution section of @[{plan_file}] if present."

    return f"""Execute Phase {phase_num} Task {task_num} following @[{plan_file}].

Execution Directives:
1. Scope & Blueprint: The plan blueprint in @[{plan_file}] is authoritative. Modify only the planned target files. You may read adjacent files or type definitions as needed to resolve imports, types, or test fixtures.
{verification_block}
3. Post-Execution:
   - {post_exec_directive} Otherwise: commit changes with message "{commit_msg}", record git notes (Task, Summary, Files, Rationale), mark task as complete [x] with appended [commit: <hash>] in {rel_track_dir}/plan.md, and commit plan.md.
4. Output a brief completion summary and halt."""


def build_recovery_prompt(track_name, phase_num, task_num):
    track_dir = resolve_track_dir(track_name)
    rel_track_dir = _rel_to_project(track_dir) if track_dir else f"conductor/tracks/{track_name}"
    return f"""/conductor:implement @[{rel_track_dir}]

Pick up uncommitted changes in git status for Phase {phase_num}, Task {task_num}.
Verify with tests, commit, update plan.md, and halt."""


def main():
    parser = argparse.ArgumentParser(
        description="Generate token-efficient Conductor prompts for Antigravity-CLI.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  python3 scripts/agent/generate-prompt.py                 # Auto-detects track & next pending task
  python3 scripts/agent/generate-prompt.py --checkpoint -c # Copy active phase Checkpoint prompt (task-number agnostic)
  python3 scripts/agent/generate-prompt.py 2 --checkpoint  # Phase 2 Checkpoint prompt for active track
  python3 scripts/agent/generate-prompt.py 3 1             # Phase 3 Task 1 for active track
  python3 scripts/agent/generate-prompt.py 3 1 --plan      # Output only Phase 3 Task 1 Plan prompt
  python3 scripts/agent/generate-prompt.py 3 1 --exec      # Output only Phase 3 Task 1 Exec prompt
  python3 scripts/agent/generate-prompt.py 3 1 --copy-plan # Copy Plan prompt directly to clipboard
  python3 scripts/agent/generate-prompt.py 3 1 --copy-exec # Copy Exec prompt directly to clipboard
  python3 scripts/agent/generate-prompt.py --recovery      # Output recovery prompt for uncommitted changes
"""
    )

    parser.add_argument("args", nargs="*", help="[track] [phase] [task] or [phase] [task]")
    parser.add_argument("--track", "-t", help="Track name (e.g. winery-hours-resilience_20260930)")
    parser.add_argument("--phase", "-p", type=int, help="Phase number (e.g. 2)")
    parser.add_argument("--task", "-k", type=int, help="Task number (e.g. 1)")
    parser.add_argument("--plan-only", "--plan", action="store_true", help="Output only the Plan prompt")
    parser.add_argument("--exec-only", "--exec", action="store_true", help="Output only the Implementation prompt")
    parser.add_argument("--copy", "-c", action="store_true", help="Copy output prompt to clipboard")
    parser.add_argument("--copy-plan", action="store_true", help="Copy the Plan prompt to clipboard")
    parser.add_argument("--copy-exec", action="store_true", help="Copy the Exec prompt to clipboard")
    parser.add_argument("--recovery", "-r", action="store_true", help="Generate recovery prompt for uncommitted work")

    phase_group = parser.add_mutually_exclusive_group()
    phase_group.add_argument("--red", action="store_true", help="Force Red phase prompt (failing tests only, halt after test commit)")
    phase_group.add_argument("--green", action="store_true", help="Force Green phase prompt (implement application code to pass tests)")
    phase_group.add_argument("--full", action="store_true", help="[Deprecated] Force Full TDD prompt (violates TDD Task Granularity Invariant)")
    phase_group.add_argument(
        "--checkpoint",
        action="store_true",
        help="Select the phase's User Manual Verification checkpoint task (task-count agnostic) and output a single diff-gated prompt",
    )

    parsed = parser.parse_args()

    track_name = parsed.track
    phase_num = parsed.phase
    task_num = parsed.task

    # Determine explicit execution mode from CLI flags
    mode = None
    if parsed.red:
        mode = "red"
    elif parsed.green:
        mode = "green"
    elif parsed.checkpoint:
        mode = "checkpoint"
    elif parsed.full:
        print(
            "Warning: --full violates the TDD Task Granularity Invariant (AGENTS.md). "
            "All TDD features must be split into sequential Red and Green tasks.",
            file=sys.stderr,
        )
        mode = "full"

    # Parse positional arguments if provided
    pos_args = parsed.args
    if len(pos_args) == 3:
        track_name, phase_num, task_num = pos_args[0], int(pos_args[1]), int(pos_args[2])
    elif len(pos_args) == 2:
        # e.g., 3 1 -> phase 3, task 1 (track auto-detected)
        if pos_args[0].isdigit() and pos_args[1].isdigit():
            phase_num, task_num = int(pos_args[0]), int(pos_args[1])
        else:
            track_name, phase_num = pos_args[0], int(pos_args[1])
    elif len(pos_args) == 1:
        if pos_args[0].isdigit():
            phase_num = int(pos_args[0])
        else:
            track_name = pos_args[0]

    # Check for invalid non-positive integers
    if (phase_num is not None and phase_num <= 0) or (task_num is not None and task_num <= 0):
        print(
            f"Error: Phase and task numbers must be positive integers >= 1 (got phase: {phase_num}, task: {task_num}).",
            file=sys.stderr,
        )
        sys.exit(1)

    # Resolve active track if not specified
    if not track_name:
        track_name = get_active_track()
        if not track_name:
            print("Error: Could not auto-detect active track. Please specify track name.", file=sys.stderr)
            sys.exit(1)

    phases = parse_plan_tasks(track_name)
    if not phases:
        track_dir = resolve_track_dir(track_name)
        plan_path = track_dir / "plan.md" if track_dir else None
        print(
            f"Error: No phases found in plan for track '{track_name}'. "
            f"Please verify that {plan_path or 'plan.md'} exists and defines phases.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Validate and resolve phase and task numbers
    task_desc = ""
    subtasks = []

    if parsed.checkpoint and task_num is None:
        if phase_num is None:
            auto_p, _, _, _ = find_next_pending_task(phases)
            phase_num = auto_p if auto_p is not None else max(phases.keys())
        if phase_num not in phases:
            valid_phases = ", ".join(str(p) for p in sorted(phases.keys()))
            print(
                f"Error: Phase {phase_num} not found in track '{track_name}'. "
                f"Available phases: {valid_phases}.",
                file=sys.stderr,
            )
            sys.exit(1)
        phase_tasks = phases[phase_num]["tasks"]
        checkpoint_candidates = [
            (idx, t)
            for idx, t in enumerate(phase_tasks, start=1)
            if t.get("is_checkpoint")
        ]
        if not checkpoint_candidates:
            print(
                f"Error: No checkpoint/manual verification task found in Phase {phase_num} ('{phases[phase_num]['name']}').",
                file=sys.stderr,
            )
            sys.exit(1)
        selected_idx, selected_task = next(
            ((idx, t) for idx, t in checkpoint_candidates if t["status"] != "complete"),
            checkpoint_candidates[-1],
        )
        task_num = selected_idx
        task_desc = selected_task["description"]
        subtasks = selected_task.get("subtasks", [])
    elif phase_num is None and task_num is None:
        auto_p, auto_t, auto_desc, auto_subtasks = find_next_pending_task(phases)
        if auto_p is not None:
            phase_num = auto_p
            task_num = auto_t
            task_desc = auto_desc
            subtasks = auto_subtasks
        else:
            phase_num = min(phases.keys())
            if phases[phase_num]["tasks"]:
                task_num = 1
                task_desc = phases[phase_num]["tasks"][0]["description"]
                subtasks = phases[phase_num]["tasks"][0].get("subtasks", [])
            else:
                print(f"Error: Phase {phase_num} has no tasks defined in plan.md.", file=sys.stderr)
                sys.exit(1)
    elif phase_num is not None and task_num is None:
        if phase_num not in phases:
            valid_phases = ", ".join(str(p) for p in sorted(phases.keys()))
            print(
                f"Error: Phase {phase_num} not found in track '{track_name}'. "
                f"Available phases: {valid_phases}.",
                file=sys.stderr,
            )
            sys.exit(1)

        phase_tasks = phases[phase_num]["tasks"]
        if not phase_tasks:
            print(
                f"Error: Phase {phase_num} ('{phases[phase_num]['name']}') has no tasks defined in plan.md.",
                file=sys.stderr,
            )
            sys.exit(1)

        # Find first pending or in_progress task within this phase
        selected_task_idx = None
        for idx, t in enumerate(phase_tasks, start=1):
            if t["status"] in ("pending", "in_progress"):
                selected_task_idx = idx
                task_desc = t["description"]
                subtasks = t.get("subtasks", [])
                break

        if selected_task_idx is None:
            selected_task_idx = 1
            task_desc = phase_tasks[0]["description"]
            subtasks = phase_tasks[0].get("subtasks", [])

        task_num = selected_task_idx
    elif phase_num is None and task_num is not None:
        auto_p, _, _, _ = find_next_pending_task(phases)
        phase_num = auto_p if auto_p is not None else min(phases.keys())
        if phase_num not in phases:
            valid_phases = ", ".join(str(p) for p in sorted(phases.keys()))
            print(
                f"Error: Could not resolve valid phase for track '{track_name}'. Available phases: {valid_phases}.",
                file=sys.stderr,
            )
            sys.exit(1)
        phase_tasks = phases[phase_num]["tasks"]
        if task_num < 1 or task_num > len(phase_tasks):
            total_tasks = len(phase_tasks)
            task_range_str = f"1..{total_tasks}" if total_tasks > 0 else "none"
            print(
                f"Error: Task {task_num} not found in Phase {phase_num} ('{phases[phase_num]['name']}'). "
                f"Valid tasks for Phase {phase_num}: {task_range_str}.",
                file=sys.stderr,
            )
            sys.exit(1)
        task_desc = phase_tasks[task_num - 1]["description"]
        subtasks = phase_tasks[task_num - 1].get("subtasks", [])
    else:
        if phase_num not in phases:
            valid_phases = ", ".join(str(p) for p in sorted(phases.keys()))
            print(
                f"Error: Phase {phase_num} not found in track '{track_name}'. "
                f"Available phases: {valid_phases}.",
                file=sys.stderr,
            )
            sys.exit(1)

        phase_tasks = phases[phase_num]["tasks"]
        if task_num < 1 or task_num > len(phase_tasks):
            total_tasks = len(phase_tasks)
            task_range_str = f"1..{total_tasks}" if total_tasks > 0 else "none"
            print(
                f"Error: Task {task_num} not found in Phase {phase_num} ('{phases[phase_num]['name']}'). "
                f"Valid tasks for Phase {phase_num}: {task_range_str}.",
                file=sys.stderr,
            )
            sys.exit(1)

        task_desc = phase_tasks[task_num - 1]["description"]
        subtasks = phase_tasks[task_num - 1].get("subtasks", [])

    if parsed.recovery:
        rec_prompt = build_recovery_prompt(track_name, phase_num, task_num)
        print(rec_prompt)
        if parsed.copy:
            copied = copy_to_clipboard(rec_prompt)
            if copied:
                print("\n[Copied recovery prompt to clipboard]", file=sys.stderr)
        return

    strategy = infer_verification_strategy(track_name, phase_num, task_num, task_desc, subtasks, mode)

    # Warn if selecting a checkpoint task while earlier tasks in the same phase are still incomplete
    if strategy.get("is_checkpoint") and phase_num in phases and task_num is not None:
        incomplete_prior = [
            f"Task {idx} ('{t['description']}')"
            for idx, t in enumerate(phases[phase_num]["tasks"][: task_num - 1], start=1)
            if t["status"] != "complete"
        ]
        if incomplete_prior:
            print(
                f"Warning: Phase {phase_num} still has incomplete prior tasks: {', '.join(incomplete_prior)}",
                file=sys.stderr,
            )

    plan_prompt = build_plan_prompt(track_name, phase_num, task_num, task_desc)
    exec_prompt = build_exec_prompt(track_name, phase_num, task_num, task_desc, subtasks, mode)

    if parsed.copy_plan or (parsed.copy and parsed.plan_only):
        copied = copy_to_clipboard(plan_prompt)
        print(plan_prompt)
        if copied:
            print("\n[Copied Plan prompt to clipboard]", file=sys.stderr)
        return

    if strategy.get("is_checkpoint") and not parsed.plan_only and not parsed.copy_plan:
        if parsed.copy or parsed.copy_exec:
            copied = copy_to_clipboard(exec_prompt)
            print(exec_prompt)
            if copied:
                print("\n[Copied Checkpoint prompt to clipboard]", file=sys.stderr)
            return

        if parsed.exec_only:
            print(exec_prompt)
            return

        line = "─" * 72
        print(f"\n{line}")
        print(f"  CONDUCTOR CHECKPOINT: {track_name} (Phase {phase_num}, Task {task_num})")
        if task_desc:
            print(f"  Target: {task_desc}")
        print(f"{line}\n")
        print("═══════════════════ PHASE CHECKPOINT (WARM OR COLD SESSION) ═══════════════════\n")
        print(exec_prompt)
        print(f"\n{line}\n")
        print("Tip: Use -c / --copy (or --checkpoint -c) to copy directly to your clipboard.")
        return

    if parsed.copy_exec or (parsed.copy and parsed.exec_only):
        copied = copy_to_clipboard(exec_prompt)
        print(exec_prompt)
        if copied:
            print("\n[Copied Exec prompt to clipboard]", file=sys.stderr)
        return

    if parsed.plan_only:
        print(plan_prompt)
        return

    if parsed.exec_only:
        print(exec_prompt)
        return

    line = "─" * 72
    # Print both with clear headers
    print(f"\n{line}")
    print(f"  CONDUCTOR PROMPTS: {track_name} (Phase {phase_num}, Task {task_num})")
    if task_desc:
        print(f"  Target: {task_desc}")
    print(f"{line}\n")

    print("═══════════════════ PROMPT 1: RESEARCH & PLAN (SESSION 1) ═══════════════════\n")
    print(plan_prompt)
    print("\n═══════════════════ PROMPT 2: IMPLEMENTATION (SESSION 2) ════════════════════\n")
    print(exec_prompt)
    print(f"\n{line}\n")
    print("Tip: Use --copy-plan or --copy-exec to send directly to your clipboard.")


if __name__ == "__main__":
    main()
