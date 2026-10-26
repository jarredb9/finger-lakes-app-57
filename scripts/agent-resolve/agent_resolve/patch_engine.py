"""
Autonomous Issue Resolver multi-tier patch engine and path resolution (`agent_resolve.patch_engine`).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Sequence

from agent_resolve import config
from agent_resolve.environment import log, run_cmd
from agent_resolve.models import PatchManifest, TestPatchManifest

PROTECTED_PATHS: tuple[str, ...] = (
    ".git",
    ".github",
    ".husky",
    "scripts",
    "supabase/migrations",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "eslint.config.mjs",
    "playwright.config.ts",
    "jest.config.js",
    "jest.config.ts",
    "next.config.ts",
    "next.config.mjs",
    "next.config.js",
    "postcss.config.mjs",
    "requirements-agent.txt",
    ".env",
    ".env.local",
    ".env.local.production",
    ".env.local.example",
)

ALLOWED_SRC_DIRECTORIES: tuple[str, ...] = ("app/", "components/", "hooks/", "lib/", "utils/")
ALLOWED_SRC_EXTENSIONS: tuple[str, ...] = (".ts", ".tsx", ".js", ".jsx", ".css")


def is_valid_target_src_file(path: str) -> bool:
    norm_path = path.replace("\\", "/").lstrip("./")
    if not any(norm_path.startswith(d) for d in ALLOWED_SRC_DIRECTORIES):
        return False
    for prot in PROTECTED_PATHS:
        if norm_path == prot or norm_path.startswith(prot + "/"):
            return False
    if not any(norm_path.endswith(ext) for ext in ALLOWED_SRC_EXTENSIONS):
        return False
    try:
        safe_resolve_repo_path(path)
    except ValueError:
        return False
    return True


def sanitize_target_src_files(target_src_files: Sequence[str]) -> tuple[list[str], list[str]]:
    valid: list[str] = []
    invalid: list[str] = []
    for sf in target_src_files:
        if is_valid_target_src_file(sf):
            valid.append(sf)
        else:
            invalid.append(sf)
            log(f"Warning: Removed invalid target source file: {sf}")
    return valid, invalid


def safe_resolve_repo_path(rel_path_str: str) -> Path:
    """Validates that target file path stays strictly within the repository tree."""
    project_root = config.get_project_root()
    norm_rel = rel_path_str[2:] if rel_path_str.startswith("./") else rel_path_str
    if Path(norm_rel).is_absolute():
        target = Path(norm_rel).resolve()
    else:
        target = (project_root / norm_rel).resolve()

    if target != project_root and project_root not in target.parents:
        raise ValueError(f"Path traversal attempt blocked: {rel_path_str}")

    try:
        rel_posix = target.relative_to(project_root).as_posix()
    except ValueError:
        raise ValueError(f"Path traversal attempt blocked: {rel_path_str}")

    for prot in PROTECTED_PATHS:
        if rel_posix == prot or rel_posix.startswith(prot + "/"):
            raise ValueError(f"Modification of protected file blocked: {rel_path_str}")

    if rel_posix.startswith(".env") or Path(rel_posix).name.startswith(".env"):
        raise ValueError(f"Modification of protected file blocked: {rel_path_str}")

    return target


def reset_target_sources(target_src: Sequence[str], baseline_ref: str = "HEAD") -> None:
    """Resets target source files back to baseline_ref (reverting edits or removing newly created files)."""
    if not target_src:
        return
    files_in_ref: list[str] = []
    for sf in target_src:
        try:
            p = safe_resolve_repo_path(sf)
        except Exception:
            continue
        code, _, _ = run_cmd(["git", "cat-file", "-e", f"{baseline_ref}:{sf}"])
        if code == 0:
            files_in_ref.append(sf)
        else:
            if p.exists():
                p.unlink()
    if files_in_ref:
        run_cmd(["git", "checkout", baseline_ref, "--"] + files_in_ref)


def apply_patch_manifest(
    manifest: PatchManifest | TestPatchManifest,
    new_src_files: Sequence[str] | None = None,
    allowed_files: Sequence[str] | None = None,
    new_files: Sequence[str] | None = None,
) -> tuple[bool, list[str]]:
    """
    Applies search/replace patches to target files using a resilient two-tier engine:
      Tier 1: Exact character sequence match.
      Tier 2: Line-by-line whitespace-trimmed fallback matching (must match uniquely).
    Accepts PatchManifest or TestPatchManifest.
    Permits empty search_block when target_path is specified in new_src_files or new_files,
    or does not exist on disk.
    Restricts applied paths strictly to allowed_files when provided.
    Returns (success, error_diagnostics).
    """
    errors: list[str] = []
    staged_edits: dict[Path, str] = {}

    allowed_targets: set[Path] | None = None
    if allowed_files is not None:
        allowed_targets = set()
        for af in allowed_files:
            try:
                allowed_targets.add(safe_resolve_repo_path(af))
            except Exception:
                allowed_targets.add(Path(af).resolve())

    new_file_targets: set[Path] = set()
    candidate_new_files: list[str] = []
    if new_src_files:
        candidate_new_files.extend(new_src_files)
    if new_files:
        candidate_new_files.extend(new_files)

    for nf in candidate_new_files:
        try:
            new_file_targets.add(safe_resolve_repo_path(nf))
        except Exception:
            new_file_targets.add(Path(nf).resolve())

    for idx, patch in enumerate(manifest.patches, 1):
        try:
            target_path = safe_resolve_repo_path(patch.file_path)
        except Exception as e:
            errors.append(f"Patch #{idx} invalid file path: {e}")
            continue

        if allowed_targets is not None and target_path not in allowed_targets:
            errors.append(
                f"Patch #{idx} for '{patch.file_path}' rejected: file is not in allowed target files {list(allowed_files)}."
            )
            continue

        current_content = staged_edits.get(target_path)
        if current_content is None:
            if target_path.exists():
                current_content = target_path.read_text(encoding="utf-8")
            else:
                current_content = None

        # Normalize line endings to LF
        search_block = patch.search_block.replace("\r\n", "\n")
        replace_block = patch.replace_block.replace("\r\n", "\n")
        if current_content is not None:
            current_content = current_content.replace("\r\n", "\n")

        # Case 1: Creating a brand new file (or replacing stub of a new file)
        if not search_block:
            is_new = bool(target_path in new_file_targets)
            if current_content is not None and target_path.exists() and not is_new:
                errors.append(
                    f"Patch #{idx} specifies empty search_block for '{patch.file_path}', but the file already exists. "
                    "Empty search_block is only allowed when creating brand new files."
                )
                continue
            staged_edits[target_path] = replace_block
            continue

        # Case 2: Modifying an existing file
        if current_content is None:
            errors.append(
                f"Patch #{idx} specifies non-empty search_block for '{patch.file_path}', but the file does not exist on disk."
            )
            continue

        # Tier 1: Exact substring match
        occurrences = current_content.count(search_block)
        if occurrences == 1:
            new_content = current_content.replace(search_block, replace_block, 1)
            staged_edits[target_path] = new_content
            continue
        elif occurrences > 1:
            errors.append(
                f"Patch #{idx} for '{patch.file_path}': search_block matched {occurrences} exact locations. "
                "Include additional surrounding context lines to disambiguate the search block."
            )
            continue

        # Tier 2: Line-by-line whitespace-trimmed fallback matching
        search_lines = search_block.splitlines()
        file_lines = current_content.splitlines(keepends=True)
        file_lines_raw = current_content.splitlines()

        search_stripped = [l.strip() for l in search_lines]
        file_lines_stripped = [l.strip() for l in file_lines_raw]

        k = len(search_stripped)
        matches: list[int] = []
        if k > 0 and k <= len(file_lines_stripped):
            for i in range(len(file_lines_stripped) - k + 1):
                if file_lines_stripped[i : i + k] == search_stripped:
                    matches.append(i)

        if len(matches) == 1:
            start_line = matches[0]
            end_line = start_line + k
            before = "".join(file_lines[:start_line])
            after = "".join(file_lines[end_line:])
            orig_block = "".join(file_lines[start_line:end_line])
            trailing_nl = "\n" if orig_block.endswith("\n") and not replace_block.endswith("\n") else ""
            new_content = before + replace_block + trailing_nl + after
            staged_edits[target_path] = new_content
            log(f"Patch #{idx} for '{patch.file_path}' applied via Tier 2 whitespace-trimmed match at lines {start_line+1}-{end_line}.")
            continue
        elif len(matches) > 1:
            errors.append(
                f"Patch #{idx} for '{patch.file_path}': search_block matched {len(matches)} locations using whitespace-insensitive matching. "
                "Include additional surrounding context lines to uniquely identify the replacement site."
            )
            continue

        # Not found in either Tier 1 or Tier 2
        lines = current_content.splitlines()
        sample_lines = "\n".join(lines[:30])
        errors.append(
            f"Patch #{idx} for '{patch.file_path}': search_block NOT FOUND in file (tested exact and whitespace-trimmed).\n"
            f"Search block attempted:\n```\n{search_block}\n```\n"
            f"Target file snippet for context reference:\n```\n{sample_lines}\n```"
        )

    if errors:
        return False, errors

    for path, content in staged_edits.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    return True, []


__all__: list[str] = [
    "ALLOWED_SRC_DIRECTORIES",
    "ALLOWED_SRC_EXTENSIONS",
    "PROTECTED_PATHS",
    "apply_patch_manifest",
    "is_valid_target_src_file",
    "reset_target_sources",
    "safe_resolve_repo_path",
    "sanitize_target_src_files",
]
