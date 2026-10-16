"""Custom exception classes for `agent_resolve`."""

from __future__ import annotations


class Stage2CompilationError(RuntimeError):
    """Raised when Stage 2 test authoring fails TypeScript compilation repeatedly."""


__all__ = ["Stage2CompilationError"]
