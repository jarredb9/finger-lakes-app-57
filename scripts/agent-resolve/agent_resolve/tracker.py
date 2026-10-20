"""Observability and token budget tracking for `agent_resolve`."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from agent_resolve import config


@dataclass
class TokenTracker:
    prompt_tokens: int = 0
    candidate_tokens: int = 0
    total_tokens: int = 0
    cached_tokens: int = 0
    call_count: int = 0
    max_tokens: int | None = None
    effective_tokens: int = 0

    def record_usage(self, usage_metadata: Any) -> None:
        if not usage_metadata:
            return

        def _get_int(attr: str) -> int:
            val = getattr(usage_metadata, attr, 0)
            if isinstance(val, int) and not isinstance(val, bool):
                return val
            return 0

        p_tokens = _get_int("prompt_token_count")
        c_tokens = _get_int("candidates_token_count")
        t_tokens = _get_int("total_token_count")
        cached = _get_int("cached_content_token_count")

        self.prompt_tokens += p_tokens
        self.candidate_tokens += c_tokens
        self.total_tokens += t_tokens
        self.cached_tokens += cached
        self.call_count += 1

        uncached_tokens = max(0, t_tokens - cached)
        effective_call_tokens = uncached_tokens + int(0.25 * cached)
        self.effective_tokens += effective_call_tokens

        self.check_budget()

    def check_budget(self) -> None:
        """
        Verifies effective token budget against max_tokens or config.MAX_TOKENS_PER_ISSUE.
        Raises RuntimeError if self.effective_tokens > limit.
        Permits self.effective_tokens <= limit.
        """
        limit = self.max_tokens if self.max_tokens is not None else config.MAX_TOKENS_PER_ISSUE
        if self.effective_tokens > limit:
            raise RuntimeError(
                f"Token budget exceeded: {self.effective_tokens:,} effective tokens used ({self.total_tokens:,} raw total, limit: {limit:,})"
            )

    def summary(self) -> str:
        return (
            f"{self.effective_tokens:,} effective tokens / {self.total_tokens:,} raw total "
            f"({self.prompt_tokens:,} prompt [{self.cached_tokens:,} cached @ 25%], "
            f"{self.candidate_tokens:,} candidates) across {self.call_count} API call(s)"
        )


__all__ = ["TokenTracker"]
