"""
Repository context discovery and issue suitability evaluation (`agent_resolve.context`).
"""

from __future__ import annotations

import os
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from agent_resolve import config
from agent_resolve.environment import run_cmd

GENERIC_STEMS: frozenset[str] = frozenset({"index", "types", "constants", "utils", "helpers"})
JEST_PATHSPECS: tuple[str, ...] = ("*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx")
JEST_EXTENSIONS: tuple[str, ...] = (".test.tsx", ".spec.tsx", ".test.ts", ".spec.ts")

DENO_ENTRYPOINT_PATTERNS: tuple[str, ...] = (
    "deno.serve",
    "jsr:",
    "https://deno.land",
    "deno.json",
)

EDGE_FUNCTION_UNSUITABLE_REASON: str = "Edge Function modification (supabase/functions/) requires Deno runtime"
EDGE_FUNCTION_PATH_REGEX: re.Pattern[str] = re.compile(r"supabase/functions(?:/|\b)", re.IGNORECASE)

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

        regex_pattern = rf"/({ident})(\.[a-zA-Z]+)?['\"]|from\s*['\"][^'\"]*{ident}"
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


def extract_test_component_stem(path: str) -> tuple[str, str]:
    """
    Extracts (grouping_key, specialization) from a Jest test path.

    Parameters:
        path: Relative or normalized path to a Jest test file.

    Returns:
        tuple[str, str]:
            - grouping_key: Normalized directory path combined with base component stem
              (e.g., 'lib/stores/__tests__/wineryStore').
            - specialization: Component specialization sub-extension
              (e.g., 'persist', 'enrichment', 'variant'), or '' for generic fallback suites.
    """
    norm_path = path.replace("\\", "/").lstrip("./")
    dir_name = os.path.dirname(norm_path)
    filename = os.path.basename(norm_path)
    base_name = filename
    for ext in JEST_EXTENSIONS:
        if filename.endswith(ext):
            base_name = filename[:-len(ext)]
            break

    if "." in base_name:
        stem, specialization = base_name.split(".", 1)
    else:
        stem = base_name
        specialization = ""

    grouping_key = f"{dir_name}/{stem}" if dir_name else stem
    return grouping_key, specialization


def deduplicate_target_test_files(
    target_test_files: Sequence[str],
) -> tuple[list[str], list[str]]:
    """
    Deduplicates candidate target test files by architectural component stem.

    For each unique component stem:
    - Retains only the single most specialized suite (e.g., .persist.test.ts, .enrichment.test.ts)
      in primary target test files.
    - Demotes unselected generic fallback suites (e.g., .test.ts) and extra specialized suites
      into demoted test files for downstream blast radius regression coverage.
    - Retains generic suites when no specialized suite exists for that component stem.
    - Preserves distinct directory namespaces (e.g., lib/utils vs components).

    Parameters:
        target_test_files: Sequence of candidate test file paths.

    Returns:
        tuple[list[str], list[str]]: (primary_target_tests, demoted_tests)
    """
    unique_inputs: list[str] = []
    seen_inputs: set[str] = set()
    for tf in target_test_files:
        if tf not in seen_inputs:
            seen_inputs.add(tf)
            unique_inputs.append(tf)

    grouped: dict[str, list[tuple[str, str]]] = {}
    for tf in unique_inputs:
        grouping_key, spec = extract_test_component_stem(tf)
        if grouping_key not in grouped:
            grouped[grouping_key] = []
        grouped[grouping_key].append((tf, spec))

    primary_target_tests: list[str] = []
    demoted_tests: list[str] = []

    for _grouping_key, items in grouped.items():
        specialized = [tf for tf, spec in items if spec != ""]
        generic = [tf for tf, spec in items if spec == ""]
        if specialized:
            chosen = specialized[0]
            primary_target_tests.append(chosen)
            for tf, _ in items:
                if tf != chosen:
                    demoted_tests.append(tf)
        else:
            chosen = generic[0]
            primary_target_tests.append(chosen)
            for tf in generic[1:]:
                demoted_tests.append(tf)

    return primary_target_tests, demoted_tests


def extract_test_suite_names(content: str) -> List[str]:
    """Extracts describe block titles from a test file to detect unintentional test suite deletion."""
    return re.findall(r"describe\s*\(\s*['\"`]([^'\"`]+)['\"`]", content)


def is_issue_suitable_for_headless_agent(issue_title: str, issue_body: str) -> Tuple[bool, str]:
    """
    Evaluates whether an issue is suitable for headless overnight resolution or requires
    interactive Antigravity CLI due to complex UI, external URL schemes, mobile platform quirks,
    or Edge Function modifications touching supabase/functions/ (including _shared/).
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
    if EDGE_FUNCTION_PATH_REGEX.search(text):
        reasons.append(EDGE_FUNCTION_UNSUITABLE_REASON)

    if reasons:
        return False, "; ".join(reasons)
    return True, ""


def extract_agent_brief(issue_data: Dict[str, Any]) -> Optional[str]:
    """
    Extracts authoritative maintainer '## Agent Brief' comment from issue comments if present.

    Filters comments strictly authored by '@jarredb9' containing '## Agent Brief'.
    If multiple brief comments are found, returns the latest one.
    Returns None if no matching brief exists or comments is empty/absent.
    """
    comments = issue_data.get("comments")
    if not isinstance(comments, list):
        return None

    matching_brief: Optional[str] = None
    for comment in comments:
        if not isinstance(comment, dict):
            continue
        author = comment.get("author")
        if not isinstance(author, dict):
            continue
        if author.get("login") != "jarredb9":
            continue
        body = comment.get("body")
        if isinstance(body, str) and "## Agent Brief" in body:
            matching_brief = body.strip()

    return matching_brief


__all__: list[str] = [
    "DENO_ENTRYPOINT_PATTERNS",
    "EDGE_FUNCTION_PATH_REGEX",
    "EDGE_FUNCTION_UNSUITABLE_REASON",
    "GENERIC_STEMS",
    "JEST_EXTENSIONS",
    "JEST_PATHSPECS",
    "NON_SHARED_EDGE_FUNCTION_REGEX",
    "deduplicate_target_test_files",
    "extract_agent_brief",
    "extract_test_component_stem",
    "get_repository_tree",
    "get_project_context",
    "find_related_test_files",
    "extract_test_suite_names",
    "is_issue_suitable_for_headless_agent",
]
