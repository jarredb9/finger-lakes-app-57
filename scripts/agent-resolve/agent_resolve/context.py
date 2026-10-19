"""
Repository context discovery and issue suitability evaluation (`agent_resolve.context`).
"""

from __future__ import annotations

from pathlib import Path
import re
from typing import List, Tuple

from agent_resolve import config
from agent_resolve.environment import run_cmd


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
    """Discovers test files that import or reference target source files to prevent unadapted regression collisions."""
    project_root = config.get_project_root()
    discovered: List[str] = []
    for sf in target_src_files:
        stem = Path(sf).stem.lstrip(".")
        if not stem or len(stem) < 3:
            continue
        code, stdout, _ = run_cmd(["git", "grep", "-l", stem, "--", "**/__tests__/*"])
        if code == 0 and stdout:
            for line in stdout.splitlines():
                tf = line.strip()
                if tf and tf not in discovered and (project_root / tf).exists():
                    discovered.append(tf)
    return discovered


def extract_test_suite_names(content: str) -> List[str]:
    """Extracts describe block titles from a test file to detect unintentional test suite deletion."""
    return re.findall(r"describe\s*\(\s*['\"`]([^'\"`]+)['\"`]", content)


def is_issue_suitable_for_headless_agent(issue_title: str, issue_body: str) -> Tuple[bool, str]:
    """
    Evaluates whether an issue is suitable for headless overnight resolution or requires
    interactive Antigravity CLI due to complex UI, external URL schemes, or mobile platform quirks.
    """
    text = f"{issue_title}\n{issue_body}".lower()
    reasons: List[str] = []
    if any(k in text for k in ["dropdownmenu", "dialog", "popover", "accordion", "sheet", "radix"]):
        reasons.append("composite Radix UI / dropdown component redesign")
    if any(k in text for k in ["ios pwa", "standalone pwa", "webkit", "gesture", "safari popup"]):
        reasons.append("mobile WebKit / PWA runtime gesture semantics")
    if any(k in text for k in ["maps://", "waze://", "https://maps.apple.com", "deep link"]):
        reasons.append("external vendor deep-linking scheme")

    if reasons:
        return False, "; ".join(reasons)
    return True, ""


__all__: list[str] = [
    "get_repository_tree",
    "get_project_context",
    "find_related_test_files",
    "extract_test_suite_names",
    "is_issue_suitable_for_headless_agent",
]
