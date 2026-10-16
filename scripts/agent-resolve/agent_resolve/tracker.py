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

    def record_usage(self, usage_metadata: Any) -> None:
        if not usage_metadata:
            return
        p_tokens = getattr(usage_metadata, "prompt_token_count", 0) or 0
        c_tokens = getattr(usage_metadata, "candidates_token_count", 0) or 0
        t_tokens = getattr(usage_metadata, "total_token_count", 0) or 0
        cached = getattr(usage_metadata, "cached_content_token_count", 0) or 0

        self.prompt_tokens += p_tokens
        self.candidate_tokens += c_tokens
        self.total_tokens += t_tokens
        self.cached_tokens += cached
        self.call_count += 1

        if self.total_tokens > config.MAX_TOKENS_PER_ISSUE:
            raise RuntimeError(
                f"Token budget exceeded: {self.total_tokens:,} tokens used (limit: {config.MAX_TOKENS_PER_ISSUE:,})"
            )

    def summary(self) -> str:
        return (
            f"{self.total_tokens:,} total tokens "
            f"({self.prompt_tokens:,} prompt, {self.candidate_tokens:,} candidates, "
            f"{self.cached_tokens:,} cached) across {self.call_count} API call(s)"
        )


__all__ = ["TokenTracker"]
