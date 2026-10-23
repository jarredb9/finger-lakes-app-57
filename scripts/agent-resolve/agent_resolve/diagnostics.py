"""
Read-only repository exploration and diagnostic parsing tools (`agent_resolve.diagnostics`).
"""

from __future__ import annotations

import re
from typing import Final, List, Pattern, Tuple

from agent_resolve.environment import run_cmd
from agent_resolve.patch_engine import safe_resolve_repo_path


def grep_search(query: str, path_prefix: str = "") -> str:
    """Searches text across repository files using git grep."""
    q = query.strip()
    if not q:
        return "No search query provided."
    cmd = ["git", "grep", "-n", "-I", "-F", "-e", q]
    if path_prefix.strip():
        norm_prefix = path_prefix.strip().lstrip("./")
        cmd.extend(["--", norm_prefix])
    code, stdout, _ = run_cmd(cmd)
    if code != 0 or not stdout.strip():
        # Case-insensitive fallback
        cmd_i = ["git", "grep", "-n", "-I", "-i", "-F", "-e", q]
        if path_prefix.strip():
            cmd_i.extend(["--", norm_prefix])
        code_i, stdout_i, _ = run_cmd(cmd_i)
        if code_i == 0 and stdout_i.strip():
            stdout = stdout_i
        else:
            return f"No matches found for query '{query}'."
    lines = stdout.strip().splitlines()
    if len(lines) > 60:
        return "\n".join(lines[:60]) + f"\n... ({len(lines) - 60} more matches truncated)"
    return "\n".join(lines)


def find_files(pattern: str) -> str:
    """Locates repository files matching a glob or pattern."""
    pat = pattern.strip()
    if not pat:
        return "No pattern provided."
    glob_pat = pat if any(c in pat for c in ["*", "?", "["]) else f"*{pat}*"
    code, stdout, _ = run_cmd(["git", "ls-files", glob_pat])
    if code != 0 or not stdout.strip():
        code_all, out_all, _ = run_cmd(["git", "ls-files"])
        if code_all == 0 and out_all.strip():
            matches = [f for f in out_all.splitlines() if pat.lower() in f.lower()]
            if matches:
                if len(matches) > 60:
                    return "\n".join(matches[:60]) + f"\n... ({len(matches) - 60} more matches truncated)"
                return "\n".join(matches)
        return f"No files found matching pattern '{pattern}'."
    lines = stdout.strip().splitlines()
    if len(lines) > 60:
        return "\n".join(lines[:60]) + f"\n... ({len(lines) - 60} more matches truncated)"
    return "\n".join(lines)


def read_file_snippet(file_path: str, start_line: int = 1, end_line: int = 80) -> str:
    """Reads a line range from a repository file."""
    try:
        target_path = safe_resolve_repo_path(file_path)
    except Exception as e:
        return f"Error resolving path '{file_path}': {e}"
    if not target_path.exists() or not target_path.is_file():
        return f"File '{file_path}' does not exist on disk."
    try:
        content = target_path.read_text(encoding="utf-8", errors="replace")
        lines = content.splitlines()
        total_lines = len(lines)
        start = max(1, start_line)
        end = min(total_lines, max(start, end_line))
        if end - start > 150:
            end = start + 150
        snippet_lines = [f"{i}: {lines[i - 1]}" for i in range(start, end + 1)]
        header = f"=== File: {file_path} (Lines {start}-{end} of {total_lines}) ==="
        return header + "\n" + "\n".join(snippet_lines)
    except Exception as e:
        return f"Error reading file '{file_path}': {e}"


def parse_issue_diagnostics(issue_body: str) -> Tuple[List[str], str]:
    """
    Extracts explicit target files/suspected components and root cause analysis
    from the issue body (handling Model 1 template format and markdown headings).
    Returns (suspected_files, root_cause).
    """
    suspected_files: List[str] = []
    root_cause: str = ""

    # Look for Target Files / Suspected Components section
    target_files_match = re.search(
        r"(?:###?|\*\*)\s*(?:Target Files|Suspected Components|Target Files & Suspected Components)\s*(?:\*\*)?[\s\S]*?(?=(?:\n\s*(?:###?|\*\*)|$))",
        issue_body,
        re.IGNORECASE,
    )
    if target_files_match:
        section_text = target_files_match.group(0)
        file_candidates = re.findall(
            r"[-*]\s*[`'\"]?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`'\"]?",
            section_text,
        )
        file_candidates += re.findall(
            r"[`'\"]([a-zA-Z0-9_./-]+\.(?:ts|tsx|js|jsx|json|sql|ya?ml|css))[`'\"]",
            section_text,
        )
        file_candidates += re.findall(
            r"((?:lib|components|app|pages|supabase|types|src|scripts)/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)",
            section_text,
        )
        for f in file_candidates:
            clean_f = f.strip().strip("`'\",")
            if clean_f and clean_f not in suspected_files:
                suspected_files.append(clean_f)

    # Look for Root Cause section
    root_cause_match = re.search(
        r"(?:###?|\*\*)\s*Root Cause\s*(?:\*\*)?[\s\S]*?(?=(?:\n\s*(?:###?|\*\*)|$))",
        issue_body,
        re.IGNORECASE,
    )
    if root_cause_match:
        root_cause = root_cause_match.group(0).strip()

    # Fallback: scan whole issue body for candidate source files if no explicit section matched
    if not suspected_files:
        all_paths = re.findall(
            r"[`'\"]([a-zA-Z0-9_./-]+\.(?:ts|tsx|js|jsx|json|sql|ya?ml|css))[`'\"]",
            issue_body,
        )
        all_paths += re.findall(
            r"((?:lib|components|app|pages|supabase|types|src|scripts)/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)",
            issue_body,
        )
        for p in all_paths:
            clean_p = p.strip().strip("`'\",")
            if clean_p and clean_p not in suspected_files:
                suspected_files.append(clean_p)

    return suspected_files, root_cause


# Stack frame detection: lines beginning with optional leading whitespace followed by 'at '
STACK_FRAME_PATTERN: Final[Pattern[str]] = re.compile(r"^\s*at\s+")

# Internal framework path indicators within stack frames:
# - node_modules/ (including /app/node_modules/ and Windows \ paths)
# - node:internal/
# - internal/ (following parenthesis, slash, backslash, or directly after 'at ')
INTERNAL_FRAME_INDICATOR_PATTERN: Final[Pattern[str]] = re.compile(
    r"(?:node_modules[/\\]|node:internal[/\\]|(?:\(|^|\s|[/\\])internal[/\\])"
)

# Consecutive newline collapsing pattern: matches 3 or more newlines
CONSECUTIVE_NEWLINES_PATTERN: Final[Pattern[str]] = re.compile(r"\n{3,}")

ANSI_ESCAPE_PATTERN: Final[Pattern[str]] = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")


def strip_ansi(text: str) -> str:
    """Removes all ANSI escape sequences (colors, cursor navigation, terminal control) from text."""
    if not text:
        return ""
    return ANSI_ESCAPE_PATTERN.sub("", text)


def truncate_error_context(text: str, max_chars: int = 4000) -> str:
    """
    Sanitizes and bounds verification error output for LLM prompts:
    1. Strips ANSI escape sequences.
    2. Prunes internal framework stack frames (matching node_modules/, node:internal/, internal/)
       while strictly preserving user-space frames, code snippets, TypeScript compiler errors,
       ESLint diagnostics, and multi-line assertion diffs.
    3. Collapses 3+ consecutive newlines down to 2 (\\n\\n).
    4. Enforces a maximum character cap (default 4,000 chars: 2,000 head / 2,000 tail)
       joined by '\\n\\n... [TRUNCATED {truncated_count} CHARS OF VERIFICATION OUTPUT] ...\\n\\n'.

    Parameters:
        text: Raw compiler or test runner standard output/error.
        max_chars: Character ceiling for truncated context. Defaults to 4000.

    Returns:
        str: Sanitized, pruned, and bounded error context.
    """
    clean = strip_ansi(text)
    if not clean:
        return ""

    lines = clean.splitlines()
    surviving_lines: list[str] = []
    for line in lines:
        is_stack_frame = bool(STACK_FRAME_PATTERN.match(line))
        is_internal = bool(INTERNAL_FRAME_INDICATOR_PATTERN.search(line))
        if is_stack_frame and is_internal:
            continue
        surviving_lines.append(line)

    filtered_text = "\n".join(surviving_lines)
    normalized = CONSECUTIVE_NEWLINES_PATTERN.sub("\n\n", filtered_text)

    total = len(normalized)
    if total <= max_chars:
        return normalized

    half = max_chars // 2
    head = normalized[:half]
    tail = normalized[-half:]
    truncated_count = total - (half * 2)
    marker = f"\n\n... [TRUNCATED {truncated_count} CHARS OF VERIFICATION OUTPUT] ...\n\n"
    return f"{head}{marker}{tail}"


__all__: list[str] = [
    "grep_search",
    "find_files",
    "read_file_snippet",
    "parse_issue_diagnostics",
    "strip_ansi",
    "truncate_error_context",
]
