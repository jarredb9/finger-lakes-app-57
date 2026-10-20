"""
Repository context discovery and issue suitability evaluation (`agent_resolve.context`).
"""

from __future__ import annotations

import os
from pathlib import Path
import re
from typing import List, Tuple

from agent_resolve import config
from agent_resolve.environment import run_cmd

GENERIC_STEMS: frozenset[str] = frozenset({"index", "types", "constants", "utils", "helpers"})
JEST_PATHSPECS: tuple[str, ...] = ("*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx")

DENO_ENTRYPOINT_PATTERNS: tuple[str, ...] = (
    "deno.serve",
    "jsr:",
    "https://deno.land",
    "deno.json",
)

NON_SHARED_EDGE_FUNCTION_REGEX: re.Pattern[str] = re.compile(
    r"supabase/functions/(?!_shared(?:/|$|\.))[\w.-]+"
)


def _compute_ancestor_proximity(sf: str, tf: str) -> int:
    """Computes directory proximity score as length of common ancestor path between source and test file."""
    try:
        sf_dir = os.path.dirname(sf)
        tf_dir = os.path.dirname(tf)
        return len(os.path.commonpath([sf_dir, tf_dir])) if (sf_dir and tf_dir) else 0
    except (ValueError, Exception):
        return 0


def get_repository_tree() -> str:
    """Extracts a compact inventory of existing repository source files to anchor architectural planning."""
    code, stdout, _ = run_cmd(["git", "ls-files", "lib/", "components/", "app/", "supabase/functions/"])
    if code != 0 or not stdout:
        return ""
    relevant_exts = (".ts", ".tsx", ".js", ".jsx", ".sql", ".json")
    files = [f for f in stdout.splitlines() if f.endswith(relevant_exts)]
    if not files:
        return ""
    return "### EXISTING REPOSITORY SOURCE FILES:\n" + "\n".join(f"- {f}" for f in files)


def get_project_context() -> str:
    """Extracts essential project standards, architecture guidelines, and repository file inventory."""
    project_root = config.get_project_root()
    context_md = ""
    agents_md = ""

    c_path = project_root / "CONTEXT.md"
    if c_path.exists():
        context_md = c_path.read_text(encoding="utf-8")

    a_path = project_root / "AGENTS.md"
    if a_path.exists():
        agents_md = a_path.read_text(encoding="utf-8")

    repo_tree = get_repository_tree()

    return f"""### REPOSITORY DOMAIN MODEL (CONTEXT.md):
{context_md}

### ARCHITECTURAL RULES & STANDARDS (AGENTS.md):
{agents_md}

{repo_tree}
"""


def find_related_test_files(target_src_files: List[str]) -> List[str]:
    """
    Discovers test files that import target source files.
    Restricts pathspecs to Jest patterns outside supabase/ and e2e/, qualifies generic stems,
    sorts candidates by descending common ancestor depth, and caps results at 8 suites.
    """
    project_root = config.get_project_root()
    candidates: List[str] = []
    for sf in target_src_files:
        stem = Path(sf).stem.lstrip(".")
        if not stem or len(stem) < 3:
            continue
        if stem in GENERIC_STEMS:
            ident = (Path(sf).parent / stem).as_posix().lstrip("./")
        else:
            ident = stem

        regex_pattern = rf"/(?:{ident})(\.[a-zA-Z]+)?['\"]|from\s*['\"][^'\"]*{ident}"
        code, stdout, _ = run_cmd(["git", "grep", "-E", "-l", regex_pattern, "--", *JEST_PATHSPECS])
        if code == 0 and stdout:
            for line in stdout.splitlines():
                tf = line.strip()
                if (
                    tf
                    and tf.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))
                    and not tf.startswith(("supabase/", "e2e/"))
                    and "/supabase/" not in tf
                    and "/e2e/" not in tf
                    and (project_root / tf).exists()
                ):
                    if tf not in candidates:
                        candidates.append(tf)

    def _proximity(tf: str) -> int:
        return max((_compute_ancestor_proximity(sf, tf) for sf in target_src_files), default=0)

    candidates.sort(key=_proximity, reverse=True)
    return candidates[:8]


def extract_test_suite_names(content: str) -> List[str]:
    """Extracts describe block titles from a test file to detect unintentional test suite deletion."""
    return re.findall(r"describe\s*\(\s*['\"`]([^'\"`]+)['\"`]", content)


def is_issue_suitable_for_headless_agent(issue_title: str, issue_body: str) -> Tuple[bool, str]:
    """
    Evaluates whether an issue is suitable for headless overnight resolution or requires
    interactive Antigravity CLI due to complex UI, external URL schemes, mobile platform quirks,
    or Deno runtime entrypoints/non-shared Edge Function handlers.
    """
    text = f"{issue_title}\n{issue_body}".lower()
    reasons: List[str] = []
    if any(k in text for k in ["dropdownmenu", "dialog", "popover", "accordion", "sheet", "radix"]):
        reasons.append("composite Radix UI / dropdown component redesign")
    if any(k in text for k in ["ios pwa", "standalone pwa", "webkit", "gesture", "safari popup"]):
        reasons.append("mobile WebKit / PWA runtime gesture semantics")
    if any(k in text for k in ["maps://", "waze://", "https://maps.apple.com", "deep link"]):
        reasons.append("external vendor deep-linking scheme")
    if any(p in text for p in DENO_ENTRYPOINT_PATTERNS):
        reasons.append("Deno runtime entrypoint")
    if NON_SHARED_EDGE_FUNCTION_REGEX.search(text):
        reasons.append("non-shared Edge Function path")

    if reasons:
        return False, "; ".join(reasons)
    return True, ""


__all__: list[str] = [
    "DENO_ENTRYPOINT_PATTERNS",
    "GENERIC_STEMS",
    "JEST_PATHSPECS",
    "NON_SHARED_EDGE_FUNCTION_REGEX",
    "get_repository_tree",
    "get_project_context",
    "find_related_test_files",
    "extract_test_suite_names",
    "is_issue_suitable_for_headless_agent",
]
