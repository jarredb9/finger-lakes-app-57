"""Unit tests for `agent_resolve.tracker.TokenTracker`."""

from types import SimpleNamespace
import unittest

from agent_resolve.tracker import TokenTracker


class TestTokenTracker(unittest.TestCase):
    def test_initial_state_zeroed(self) -> None:
        tracker = TokenTracker()
        self.assertEqual(tracker.prompt_tokens, 0)
        self.assertEqual(tracker.candidate_tokens, 0)
        self.assertEqual(tracker.total_tokens, 0)
        self.assertEqual(tracker.cached_tokens, 0)
        self.assertEqual(tracker.call_count, 0)

    def test_record_usage_none_is_noop(self) -> None:
        tracker = TokenTracker()
        tracker.record_usage(None)
        self.assertEqual(tracker.prompt_tokens, 0)
        self.assertEqual(tracker.candidate_tokens, 0)
        self.assertEqual(tracker.total_tokens, 0)
        self.assertEqual(tracker.cached_tokens, 0)
        self.assertEqual(tracker.call_count, 0)

    def test_record_usage_accumulates_counts_and_handles_none_fields(self) -> None:
        tracker = TokenTracker()
        first_usage = SimpleNamespace(
            prompt_token_count=1200,
            candidates_token_count=300,
            total_token_count=1500,
            cached_content_token_count=400,
        )
        second_usage = SimpleNamespace(
            prompt_token_count=500,
            candidates_token_count=None,
            total_token_count=500,
            cached_content_token_count=None,
        )

        tracker.record_usage(first_usage)
        tracker.record_usage(second_usage)

        self.assertEqual(tracker.prompt_tokens, 1700)
        self.assertEqual(tracker.candidate_tokens, 300)
        self.assertEqual(tracker.total_tokens, 2000)
        self.assertEqual(tracker.cached_tokens, 400)
        self.assertEqual(tracker.call_count, 2)

    def test_record_usage_allows_exact_budget_boundary(self) -> None:
        tracker = TokenTracker()
        boundary_usage = SimpleNamespace(
            prompt_token_count=400_000,
            candidates_token_count=100_000,
            total_token_count=500_000,
            cached_content_token_count=0,
        )
        tracker.record_usage(boundary_usage)
        self.assertEqual(tracker.total_tokens, 500_000)
        self.assertEqual(tracker.call_count, 1)

    def test_record_usage_raises_runtime_error_when_budget_exceeded(self) -> None:
        tracker = TokenTracker()
        over_budget_usage = SimpleNamespace(
            prompt_token_count=400_001,
            candidates_token_count=100_000,
            total_token_count=500_001,
            cached_content_token_count=0,
        )
        with self.assertRaises(RuntimeError) as ctx:
            tracker.record_usage(over_budget_usage)
        self.assertIn(
            "Token budget exceeded: 500,001 tokens used (limit: 500,000)",
            str(ctx.exception),
        )

    def test_summary_formats_comma_separated_metrics(self) -> None:
        tracker = TokenTracker()
        tracker.record_usage(
            SimpleNamespace(
                prompt_token_count=1200,
                candidates_token_count=300,
                total_token_count=1500,
                cached_content_token_count=400,
            )
        )
        tracker.record_usage(
            SimpleNamespace(
                prompt_token_count=500,
                candidates_token_count=None,
                total_token_count=500,
                cached_content_token_count=None,
            )
        )
        self.assertEqual(
            tracker.summary(),
            "2,000 total tokens (1,700 prompt, 300 candidates, 400 cached) across 2 API call(s)",
        )


if __name__ == "__main__":
    unittest.main()
