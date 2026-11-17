#!/usr/bin/env python3
"""
Shared Shell Verification Command Parser (shell_cmd_parser.py)

Provides quote-aware '&&' splitting, leading POSIX KEY=VALUE environment
assignment extraction/filtering, and safe shell=False command parsing for
generate-prompt.py and conductor-auto.py.
"""

from pathlib import Path
import re
import shlex
from typing import Dict, List, Tuple, Union


ENV_ASSIGNMENT_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", re.DOTALL)
BLOCKED_ENV_VARS = frozenset(
    {
        "LD_PRELOAD",
        "LD_LIBRARY_PATH",
        "LD_AUDIT",
        "DYLD_INSERT_LIBRARIES",
        "DYLD_LIBRARY_PATH",
        "DYLD_FRAMEWORK_PATH",
        "BASH_ENV",
        "ENV",
        "PYTHONINSPECT",
    }
)


def split_unquoted_and_chains(cmd: str, *, reject_shell_ops: bool = True) -> List[str]:
    """Splits a shell command on unquoted '&&' operators, honoring quotes, escapes, and comments."""
    segments: List[str] = []
    buf: List[str] = []
    in_single = False
    in_double = False
    escaped = False
    at_token_boundary = True
    saw_and_operator = False
    i = 0
    n = len(cmd)

    while i < n:
        ch = cmd[i]
        if escaped:
            buf.append(ch)
            escaped = False
            at_token_boundary = False
            i += 1
            continue

        if in_single:
            buf.append(ch)
            if ch == "'":
                in_single = False
            i += 1
            continue

        if ch == "\\":
            buf.append(ch)
            escaped = True
            at_token_boundary = False
            i += 1
            continue

        if in_double:
            if reject_shell_ops:
                if ch == "`":
                    raise ValueError("Unsupported subshell backtick operator in verification command")
                if ch == "$" and i + 1 < n and cmd[i + 1] == "(":
                    raise ValueError("Unsupported subshell '$(...)' operator in verification command")
            buf.append(ch)
            if ch == '"':
                in_double = False
            i += 1
            continue

        if ch == "'":
            in_single = True
            buf.append(ch)
            at_token_boundary = False
            i += 1
            continue

        if ch == '"':
            in_double = True
            buf.append(ch)
            at_token_boundary = False
            i += 1
            continue

        if ch == "#" and at_token_boundary:
            while i < n and cmd[i] != "\n":
                i += 1
            at_token_boundary = True
            continue

        if ch == "&" and i + 1 < n and cmd[i + 1] == "&":
            seg = "".join(buf).strip()
            if seg:
                segments.append(seg)
            elif reject_shell_ops:
                raise ValueError("Invalid empty command segment before '&&' in verification command")
            buf = []
            at_token_boundary = True
            saw_and_operator = True
            i += 2
            continue

        if reject_shell_ops:
            if ch in ("\n", "\r"):
                raise ValueError("Unsupported newline in verification command")
            if ch == "`":
                raise ValueError("Unsupported subshell backtick operator in verification command")
            if ch == "$" and i + 1 < n and cmd[i + 1] == "(":
                raise ValueError("Unsupported subshell '$(...)' operator in verification command")
            if ch == "|" and i + 1 < n and cmd[i + 1] == "|":
                raise ValueError("Unsupported shell operator '||' in verification command")
            if ch in (";", "|", ">", "<", "&"):
                raise ValueError(f"Unsupported shell operator '{ch}' in verification command")

        buf.append(ch)
        at_token_boundary = ch.isspace()
        i += 1

    tail = "".join(buf).strip()
    if tail:
        segments.append(tail)
    elif saw_and_operator and reject_shell_ops:
        raise ValueError("Trailing '&&' without a following command in verification command")
    return segments


def _split_tokens_with_env_prefix_count(seg: str) -> Tuple[List[str], int]:
    """Tokenizes a segment and returns (tokens, leading_env_assignment_count)."""
    try:
        tokens = shlex.split(seg, comments=True)
    except ValueError:
        tokens = seg.strip().split()
    idx = 0
    while idx < len(tokens) and ENV_ASSIGNMENT_RE.match(tokens[idx]):
        idx += 1
    return tokens, idx


def has_leading_env_assignment(seg: str) -> bool:
    """Returns True when a command segment starts with one or more KEY=VALUE assignments."""
    _, idx = _split_tokens_with_env_prefix_count(seg)
    return idx > 0


def strip_leading_env_assignments(seg: str) -> str:
    """Strips leading KEY=VALUE tokens from a command segment for prefix/safety inspection."""
    tokens, idx = _split_tokens_with_env_prefix_count(seg)
    return " ".join(tokens[idx:])


def is_cd_segment(seg: str) -> bool:
    """Returns True when a command segment (after any env prefix) invokes 'cd'."""
    core = strip_leading_env_assignments(seg)
    return core == "cd" or core.startswith("cd ")


def parse_verification_commands(
    cmd_input: Union[str, List[str]],
    work_dir: Path,
    *,
    check_cd_exists: bool = True,
) -> List[Tuple[List[str], Dict[str, str], Path]]:
    """Parses verification commands into runnable (argv, env_overrides, cwd) tuples without shell=True."""
    if isinstance(cmd_input, list):
        if not cmd_input:
            raise ValueError("Empty verification command list")
        return [(cmd_input, {}, work_dir)]

    segments = split_unquoted_and_chains(cmd_input, reject_shell_ops=True)
    if not segments:
        raise ValueError(f"Empty verification command: {cmd_input!r}")

    repo_root_resolved = work_dir.resolve()
    seg_cwd = repo_root_resolved
    parsed: List[Tuple[List[str], Dict[str, str], Path]] = []

    for seg in segments:
        tokens = shlex.split(seg, comments=True)
        if not tokens:
            continue

        env_overrides: Dict[str, str] = {}
        idx = 0
        while idx < len(tokens):
            match = ENV_ASSIGNMENT_RE.match(tokens[idx])
            if not match:
                break
            key, val = match.group(1), match.group(2)
            if key in BLOCKED_ENV_VARS or key.startswith(("LD_", "DYLD_")):
                raise ValueError(f"Disallowed environment variable override '{key}' in verification command")
            env_overrides[key] = val
            idx += 1

        remaining = tokens[idx:]
        if not remaining:
            raise ValueError("Verification command segment sets environment variable(s) without an executable")
        if remaining[0] == "export":
            raise ValueError("Unsupported shell builtin 'export' in verification command")

        if remaining[0] == "cd":
            if env_overrides:
                raise ValueError("Environment variable prefixes are not supported on 'cd' segments")
            if (
                len(remaining) != 2
                or not remaining[1]
                or remaining[1].startswith("-")
                or remaining[1].startswith("~")
            ):
                raise ValueError(f"Unsupported 'cd' syntax in verification command: {seg!r}")
            target_dir = (seg_cwd / remaining[1]).resolve()
            if not target_dir.is_relative_to(repo_root_resolved):
                raise ValueError(
                    f"Verification 'cd {remaining[1]}' escapes repository root {repo_root_resolved}"
                )
            if check_cd_exists and not target_dir.is_dir():
                raise ValueError(f"Verification 'cd' target directory does not exist: {target_dir}")
            seg_cwd = target_dir
            continue

        parsed.append((remaining, env_overrides, seg_cwd))

    if not parsed:
        raise ValueError(f"Verification command has no executable command: {cmd_input!r}")
    return parsed
