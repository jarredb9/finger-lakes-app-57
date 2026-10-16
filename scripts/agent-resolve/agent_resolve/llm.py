"""
LLM client initialization, transient error handling, and resilient invocation engine.
"""

from __future__ import annotations

import os
import random
import re
import sys
import time
from typing import Any, List, Optional, Type

from agent_resolve.models import T
from agent_resolve.tracker import TokenTracker


def get_genai_client() -> Any:
    """Initializes and returns Google GenAI client with SDK-level transport retry options."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is missing.")

    try:
        from google import genai
        from google.genai import types

        try:
            http_options = types.HttpOptions(
                retry_options=types.HttpRetryOptions(
                    attempts=5,
                    initial_delay=2.0,
                    max_delay=60.0,
                    http_status_codes=[408, 429, 500, 502, 503, 504],
                )
            )
            return genai.Client(api_key=api_key, http_options=http_options)
        except Exception:
            return genai.Client(api_key=api_key)
    except ImportError:
        raise ImportError(
            "The 'google-genai' package is required. Install with: pip install google-genai"
        )


def is_transient_error(err: Exception) -> bool:
    """Identifies transient rate limits, server errors, and socket/transport disconnects eligible for backoff retry."""
    err_str = str(err).upper()
    transient_indicators = [
        "429",
        "RESOURCE_EXHAUSTED",
        "RATE_LIMIT",
        "RATE LIMIT",
        "QUOTA",
        "500",
        "502",
        "503",
        "504",
        "UNAVAILABLE",
        "OVERLOADED",
        "DEADLINE_EXCEEDED",
        "SERVER DISCONNECTED",
        "CONNECTION RESET",
        "REMOTEDISCONNECTED",
        "REMOTE DISCONNECTED",
        "BROKEN PIPE",
        "BROKENPIPEERROR",
        "CONNECTION TIMED OUT",
        "CONNECTTIMEOUT",
        "READTIMEOUT",
        "TIMEOUT",
        "PROTOCOLERROR",
        "FETCHERROR",
        "NETWORK ERROR",
        "SOCKET",
        "EOF OCCURRED",
    ]
    return any(indicator in err_str for indicator in transient_indicators)


def call_gemini_with_fallback(
    client: Any,
    contents: str,
    models: List[str],
    schema_cls: Optional[Type[T]] = None,
    temperature: float = 0.2,
    token_tracker: Optional[TokenTracker] = None,
    max_retries_per_model: int = 3,
) -> Any:
    """
    Calls Gemini API with exponential backoff + randomized jitter for rate limits (429/503),
    strict hard-stop on error (no model downgrade fallback), and Pydantic validation.
    """
    from google.genai import types

    last_err: Optional[Exception] = None

    for model_name in models:
        for attempt in range(1, max_retries_per_model + 1):
            try:
                config = types.GenerateContentConfig(
                    temperature=temperature,
                )
                if schema_cls:
                    config.response_mime_type = "application/json"
                    config.response_schema = schema_cls

                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=config,
                )

                if token_tracker and hasattr(response, "usage_metadata"):
                    token_tracker.record_usage(response.usage_metadata)

                if schema_cls:
                    if hasattr(response, "parsed") and response.parsed is not None:
                        return response.parsed
                    if response and response.text:
                        clean_text = re.sub(r"^```(?:json)?\s*", "", response.text.strip())
                        clean_text = re.sub(r"\s*```$", "", clean_text.strip())
                        return schema_cls.model_validate_json(clean_text)
                    raise ValueError(f"Empty structured response received from model {model_name}")

                if response and response.text:
                    return response.text

                raise ValueError(f"Empty text response received from model {model_name}")

            except ValueError:
                raise
            except Exception as e:
                if isinstance(e, RuntimeError) and "Token budget exceeded" in str(e):
                    raise
                last_err = e
                if is_transient_error(e) and attempt < max_retries_per_model:
                    base_delay = 2.0 * (2 ** (attempt - 1))
                    jitter = random.uniform(0.5, 1.5)
                    delay = min(60.0, base_delay + jitter)
                    print(
                        f"Transient rate limit / capacity error on {model_name} (attempt {attempt}/{max_retries_per_model}). "
                        f"Backing off for {delay:.2f}s... (Error: {e})",
                        file=sys.stderr,
                    )
                    time.sleep(delay)
                    continue

                print(
                    f"Error: Model {model_name} failed on attempt {attempt}: {e}.",
                    file=sys.stderr,
                )
                break

    raise RuntimeError(f"API call to model {models[0]} failed. Last error: {last_err}")


__all__: list[str] = [
    "get_genai_client",
    "is_transient_error",
    "call_gemini_with_fallback",
]
