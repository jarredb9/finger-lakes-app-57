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

    def test_initial_state_effective_tokens_zeroed(self) -> None:
        tracker = TokenTracker()
        self.assertEqual(tracker.effective_tokens, 0)

    def test_record_usage_calculates_effective_tokens_with_25_percent_cached(self) -> None:
        tracker = TokenTracker()
        call_1 = SimpleNamespace(
            prompt_token_count=1200,
            candidates_token_count=300,
            total_token_count=1500,
            cached_content_token_count=400,
        )
        tracker.record_usage(call_1)
        self.assertEqual(tracker.effective_tokens, 1200)
        self.assertEqual(tracker.total_tokens, 1500)

        call_2 = SimpleNamespace(
            prompt_token_count=500,
            candidates_token_count=None,
            total_token_count=500,
            cached_content_token_count=None,
        )
        tracker.record_usage(call_2)
        self.assertEqual(tracker.effective_tokens, 1700)
        self.assertEqual(tracker.total_tokens, 2000)

    def test_record_usage_clamps_negative_uncached_tokens_if_cached_exceeds_total(self) -> None:
        tracker = TokenTracker()
        anomalous_usage = SimpleNamespace(
            prompt_token_count=50,
            candidates_token_count=50,
            total_token_count=100,
            cached_content_token_count=150,
        )
        tracker.record_usage(anomalous_usage)
        self.assertEqual(tracker.effective_tokens, 37)

    def test_check_budget_allows_at_or_below_limit(self) -> None:
        tracker = TokenTracker(max_tokens=1000)
        tracker.effective_tokens = 1000
        tracker.total_tokens = 2000
        self.assertIsNone(tracker.check_budget())

    def test_check_budget_raises_runtime_error_when_effective_tokens_exceed_limit(self) -> None:
        tracker = TokenTracker(max_tokens=1000)
        tracker.effective_tokens = 1001
        tracker.total_tokens = 2500
        with self.assertRaises(RuntimeError) as ctx:
            tracker.check_budget()
        self.assertEqual(
            str(ctx.exception),
            "Token budget exceeded: 1,001 effective tokens used (2,500 raw total, limit: 1,000)",
        )

    def test_record_usage_invokes_check_budget_and_raises_with_dual_metrics(self) -> None:
        tracker = TokenTracker(max_tokens=500_000)
        usage = SimpleNamespace(
            prompt_token_count=500_000,
            candidates_token_count=100_000,
            total_token_count=600_000,
            cached_content_token_count=100_000,
        )
        with self.assertRaises(RuntimeError) as ctx:
            tracker.record_usage(usage)
        self.assertEqual(
            str(ctx.exception),
            "Token budget exceeded: 525,000 effective tokens used (600,000 raw total, limit: 500,000)",
        )

    def test_summary_formats_dual_metrics_with_discounted_cache(self) -> None:
        tracker = TokenTracker()
        call_1 = SimpleNamespace(
            prompt_token_count=1200,
            candidates_token_count=300,
            total_token_count=1500,
            cached_content_token_count=400,
        )
        call_2 = SimpleNamespace(
            prompt_token_count=500,
            candidates_token_count=None,
            total_token_count=500,
            cached_content_token_count=None,
        )
        tracker.record_usage(call_1)
        tracker.record_usage(call_2)
        self.assertEqual(
            tracker.summary(),
            "1,700 effective tokens / 2,000 raw total (1,700 prompt [400 cached @ 25%], 300 candidates) across 2 API call(s)",
        )


if __name__ == "__main__":
    unittest.main()
