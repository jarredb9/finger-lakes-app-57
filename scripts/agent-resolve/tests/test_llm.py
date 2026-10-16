"""
Unit tests for `agent_resolve.llm` (TDD Red Phase).
"""

import os
import re
import sys
import unittest
from unittest.mock import MagicMock, call, patch

import agent_resolve
from agent_resolve import config
from agent_resolve.llm import (
    call_gemini_with_fallback,
    get_genai_client,
    is_transient_error,
)
from agent_resolve.models import DiagnosticAction
from agent_resolve.tracker import TokenTracker


class TestGetGenaiClient(unittest.TestCase):
    def test_raises_runtime_error_when_api_key_missing(self) -> None:
        env = os.environ.copy()
        env.pop("GEMINI_API_KEY", None)
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(RuntimeError) as cm:
                get_genai_client()
            self.assertIn("GEMINI_API_KEY", str(cm.exception))

        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            with self.assertRaises(RuntimeError) as cm:
                get_genai_client()
            self.assertIn("GEMINI_API_KEY", str(cm.exception))

    def test_raises_import_error_when_google_genai_missing(self) -> None:
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), \
             patch.dict(sys.modules, {"google": None, "google.genai": None}):
            with self.assertRaises(ImportError) as cm:
                get_genai_client()
            self.assertIn("google-genai", str(cm.exception))

    def test_returns_client_with_http_retry_options(self) -> None:
        mock_genai = MagicMock()
        mock_types = MagicMock()
        mock_genai.types = mock_types
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), \
             patch.dict(
                 sys.modules,
                 {
                     "google": MagicMock(genai=mock_genai),
                     "google.genai": mock_genai,
                     "google.genai.types": mock_types,
                 },
             ):
            client = get_genai_client()

            mock_types.HttpRetryOptions.assert_called_once_with(
                attempts=5,
                initial_delay=2.0,
                max_delay=60.0,
                http_status_codes=[408, 429, 500, 502, 503, 504],
            )
            mock_types.HttpOptions.assert_called_once_with(
                retry_options=mock_types.HttpRetryOptions.return_value
            )
            mock_genai.Client.assert_called_once_with(
                api_key="test-key",
                http_options=mock_types.HttpOptions.return_value,
            )
            self.assertEqual(client, mock_genai.Client.return_value)

    def test_falls_back_to_client_without_http_options_if_types_fail(self) -> None:
        mock_genai = MagicMock()
        mock_types = MagicMock()
        mock_genai.types = mock_types
        mock_types.HttpOptions.side_effect = Exception("SDK incompatibility")
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), \
             patch.dict(
                 sys.modules,
                 {
                     "google": MagicMock(genai=mock_genai),
                     "google.genai": mock_genai,
                     "google.genai.types": mock_types,
                 },
             ):
            client = get_genai_client()

            mock_genai.Client.assert_called_once_with(api_key="test-key")
            self.assertEqual(client, mock_genai.Client.return_value)


class TestIsTransientError(unittest.TestCase):
    def test_identifies_http_status_codes(self) -> None:
        for code in ["429", "500", "502", "503", "504"]:
            with self.subTest(code=code):
                self.assertTrue(is_transient_error(Exception(f"HTTP {code} error")))

    def test_identifies_rate_limit_and_quota_keywords(self) -> None:
        keywords = [
            "RESOURCE_EXHAUSTED",
            "RATE_LIMIT",
            "RATE LIMIT",
            "QUOTA",
            "UNAVAILABLE",
            "OVERLOADED",
            "DEADLINE_EXCEEDED",
        ]
        for kw in keywords:
            with self.subTest(keyword=kw):
                self.assertTrue(is_transient_error(Exception(f"API Error: {kw}")))

    def test_identifies_transport_and_socket_disconnects(self) -> None:
        indicators = [
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
        for ind in indicators:
            with self.subTest(indicator=ind):
                self.assertTrue(is_transient_error(Exception(f"Transport failure: {ind}")))

    def test_case_insensitivity(self) -> None:
        self.assertTrue(is_transient_error(Exception("resource_exhausted: quota exceeded")))
        self.assertTrue(is_transient_error(Exception("rate limit exceeded (429)")))
        self.assertTrue(is_transient_error(Exception("connection reset by peer")))
        self.assertTrue(is_transient_error(Exception("Server Disconnected unexpectedly")))

    def test_rejects_non_transient_errors(self) -> None:
        non_transient = [
            Exception("400 Bad Request: INVALID_ARGUMENT"),
            Exception("401 Unauthorized: Invalid API key"),
            Exception("403 Forbidden: PERMISSION_DENIED"),
            Exception("404 Not Found: Model not found"),
            ValueError("Invalid parameters passed"),
            KeyError("missing_key"),
            TypeError("unsupported operand type"),
            SyntaxError("invalid syntax"),
        ]
        for err in non_transient:
            with self.subTest(error=str(err)):
                self.assertFalse(is_transient_error(err))


class TestCallGeminiWithFallback(unittest.TestCase):
    def setUp(self) -> None:
        self.client = MagicMock()

    def test_successful_text_generation(self) -> None:
        response = MagicMock(text="Generated text response", usage_metadata=None)
        self.client.models.generate_content.return_value = response

        result = call_gemini_with_fallback(
            self.client,
            contents="Hello Gemini",
            models=["gemini-3.8-flash"],
        )

        self.assertEqual(result, "Generated text response")
        self.client.models.generate_content.assert_called_once()
        _, kwargs = self.client.models.generate_content.call_args
        self.assertEqual(kwargs.get("model"), "gemini-3.8-flash")
        self.assertEqual(kwargs.get("contents"), "Hello Gemini")
        self.assertEqual(kwargs.get("config").temperature, 0.2)

    def test_successful_structured_generation_with_parsed_field(self) -> None:
        expected_obj = DiagnosticAction(action="find_files", reasoning="locate dependencies")
        response = MagicMock(parsed=expected_obj, text="", usage_metadata=None)
        self.client.models.generate_content.return_value = response

        result = call_gemini_with_fallback(
            self.client,
            contents="Diagnose issue",
            models=["gemini-3.8-flash"],
            schema_cls=DiagnosticAction,
        )

        self.assertEqual(result, expected_obj)
        _, kwargs = self.client.models.generate_content.call_args
        config_obj = kwargs.get("config")
        self.assertEqual(config_obj.response_mime_type, "application/json")
        self.assertEqual(config_obj.response_schema, DiagnosticAction)

    def test_successful_structured_generation_json_parsing_fallback(self) -> None:
        expected_obj = DiagnosticAction(action="find_files", reasoning="locate dependencies")
        raw_json_in_markdown = (
            "```json\n"
            '{"action": "find_files", "reasoning": "locate dependencies"}\n'
            "```"
        )
        response = MagicMock(parsed=None, text=raw_json_in_markdown, usage_metadata=None)
        self.client.models.generate_content.return_value = response

        result = call_gemini_with_fallback(
            self.client,
            contents="Diagnose issue",
            models=["gemini-3.8-flash"],
            schema_cls=DiagnosticAction,
        )

        self.assertEqual(result, expected_obj)

    def test_records_token_usage_when_tracker_provided(self) -> None:
        tracker = TokenTracker(max_tokens=100000)
        mock_usage = MagicMock(
            prompt_token_count=120,
            candidates_token_count=80,
            total_token_count=200,
        )
        response = MagicMock(text="OK", usage_metadata=mock_usage)
        self.client.models.generate_content.return_value = response

        call_gemini_with_fallback(
            self.client,
            contents="Track my tokens",
            models=["gemini-3.8-flash"],
            token_tracker=tracker,
        )

        self.assertEqual(tracker.total_tokens, 200)
        self.assertEqual(tracker.prompt_tokens, 120)
        self.assertEqual(tracker.candidate_tokens, 80)

    def test_raises_when_token_tracker_budget_exceeded(self) -> None:
        tracker = TokenTracker(max_tokens=100)
        mock_usage = MagicMock(
            prompt_token_count=80,
            candidates_token_count=50,
            total_token_count=130,
        )
        response = MagicMock(text="Exceeded", usage_metadata=mock_usage)
        self.client.models.generate_content.return_value = response

        with self.assertRaises(RuntimeError) as cm:
            call_gemini_with_fallback(
                self.client,
                contents="Over budget",
                models=["gemini-3.8-flash"],
                token_tracker=tracker,
            )
        self.assertIn("Token budget exceeded", str(cm.exception))

    def test_retries_on_transient_error_and_succeeds(self) -> None:
        err = Exception("503 Service Unavailable: OVERLOADED")
        success_response = MagicMock(text="Succeeded after backoff", usage_metadata=None)
        self.client.models.generate_content.side_effect = [err, success_response]

        with patch("time.sleep") as mock_sleep, patch("random.uniform", return_value=1.0):
            result = call_gemini_with_fallback(
                self.client,
                contents="Retry test",
                models=["gemini-3.8-flash"],
                max_retries_per_model=3,
            )

        self.assertEqual(result, "Succeeded after backoff")
        self.assertEqual(self.client.models.generate_content.call_count, 2)
        mock_sleep.assert_called_once_with(3.0)  # base_delay = 2.0 * (2**0) = 2.0; + 1.0 jitter = 3.0

    def test_exhausts_retries_and_raises_runtime_error(self) -> None:
        err = Exception("429 RESOURCE_EXHAUSTED: Rate limit reached")
        self.client.models.generate_content.side_effect = err

        with patch("time.sleep") as mock_sleep:
            with self.assertRaises(RuntimeError) as cm:
                call_gemini_with_fallback(
                    self.client,
                    contents="Retry exhaustion",
                    models=["gemini-3.8-flash"],
                    max_retries_per_model=3,
                )

        self.assertIn("gemini-3.8-flash", str(cm.exception))
        self.assertIn("RESOURCE_EXHAUSTED", str(cm.exception))
        self.assertEqual(self.client.models.generate_content.call_count, 3)
        self.assertEqual(mock_sleep.call_count, 2)

    def test_non_transient_error_aborts_immediately_without_retry(self) -> None:
        err = Exception("400 Bad Request: INVALID_ARGUMENT")
        self.client.models.generate_content.side_effect = err

        with patch("time.sleep") as mock_sleep:
            with self.assertRaises(RuntimeError) as cm:
                call_gemini_with_fallback(
                    self.client,
                    contents="Immediate abort",
                    models=["gemini-3.8-flash"],
                    max_retries_per_model=3,
                )

        self.assertIn("INVALID_ARGUMENT", str(cm.exception))
        self.assertEqual(self.client.models.generate_content.call_count, 1)
        mock_sleep.assert_not_called()

    def test_strict_gemini_38_flash_policy_no_downgrade(self) -> None:
        err = Exception("503 UNAVAILABLE: Model capacity reached")
        self.client.models.generate_content.side_effect = err

        with patch("time.sleep"):
            with self.assertRaises(RuntimeError) as cm:
                call_gemini_with_fallback(
                    self.client,
                    contents="No downgrade policy",
                    models=["gemini-3.8-flash"],
                    max_retries_per_model=1,
                )

        self.assertIn("API call to model gemini-3.8-flash failed", str(cm.exception))
        self.assertIn("UNAVAILABLE", str(cm.exception))

    def test_multi_model_fallback_if_configured(self) -> None:
        def side_effect(*args, **kwargs):
            model = kwargs.get("model")
            if model == "primary-model":
                raise Exception("400 Bad Request")
            return MagicMock(text="Success from secondary-model", usage_metadata=None)

        self.client.models.generate_content.side_effect = side_effect

        result = call_gemini_with_fallback(
            self.client,
            contents="Multi-model fallback",
            models=["primary-model", "secondary-model"],
        )

        self.assertEqual(result, "Success from secondary-model")

    def test_empty_response_text_raises_value_error(self) -> None:
        self.client.models.generate_content.return_value = MagicMock(text="", usage_metadata=None)

        with self.assertRaises(ValueError) as cm:
            call_gemini_with_fallback(
                self.client,
                contents="Empty test",
                models=["gemini-3.8-flash"],
            )
        self.assertIn("Empty text response received from model gemini-3.8-flash", str(cm.exception))

    def test_empty_structured_response_raises_value_error(self) -> None:
        self.client.models.generate_content.return_value = MagicMock(
            parsed=None,
            text="",
            usage_metadata=None,
        )

        with self.assertRaises(ValueError) as cm:
            call_gemini_with_fallback(
                self.client,
                contents="Empty structured test",
                models=["gemini-3.8-flash"],
                schema_cls=DiagnosticAction,
            )
        self.assertIn("Empty structured response received from model gemini-3.8-flash", str(cm.exception))

    def test_custom_temperature_passed_to_config(self) -> None:
        self.client.models.generate_content.return_value = MagicMock(text="OK", usage_metadata=None)

        call_gemini_with_fallback(
            self.client,
            contents="Custom temperature",
            models=["gemini-3.8-flash"],
            temperature=0.85,
        )

        _, kwargs = self.client.models.generate_content.call_args
        config_obj = kwargs.get("config")
        self.assertEqual(config_obj.temperature, 0.85)


if __name__ == "__main__":
    unittest.main()
