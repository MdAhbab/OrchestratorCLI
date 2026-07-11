"""Tests for backend.services.cli_usage.parse_usage_from_text.

The exhaustion decision was tightened in Phase E3: a single weak signal is no
longer enough to mark a CLI as exhausted. The CLI must either hit an explicit
>=100% numeric threshold OR produce at least two corroborating match
categories (HARD_LIMIT, RATE_LIMIT, USED_AT_LIMIT).
"""

from __future__ import annotations

import unittest

from backend.services.cli_usage import parse_usage_from_text


class ParseUsageFromTextTests(unittest.TestCase):
    # ---- Empty / no signal -------------------------------------------------

    def test_empty_text_returns_none(self):
        self.assertIsNone(parse_usage_from_text(""))

    def test_no_quota_signal_returns_none(self):
        # Note: avoid the word "quota" entirely — it's a weak signal that
        # legitimately produces a non-None result with exhausted=False.
        self.assertIsNone(parse_usage_from_text("hello world, just a normal log"))

    # ---- Bare weak signals are non-exhausting ------------------------------

    def test_bare_quota_keyword_not_exhausted(self):
        out = parse_usage_from_text("your quota is being checked")
        self.assertIsNotNone(out)
        self.assertFalse(out["exhausted"])

    def test_single_hard_limit_alone_not_exhausted(self):
        # Only one corroborating category — should NOT auto-exhaust.
        out = parse_usage_from_text("usage limit reached")
        self.assertIsNotNone(out)
        self.assertFalse(out["exhausted"])

    def test_single_rate_limit_alone_not_exhausted(self):
        out = parse_usage_from_text("rate limit encountered")
        self.assertIsNotNone(out)
        self.assertFalse(out["exhausted"])

    # ---- Corroboration: two categories -------------------------------------

    def test_hard_limit_plus_rate_limit_exhausts(self):
        out = parse_usage_from_text("usage limit reached (429 too many requests)")
        self.assertIsNotNone(out)
        self.assertTrue(out["exhausted"])

    def test_rate_limit_plus_pct_at_limit_exhausts(self):
        # 100% triggers numeric_override which is authoritative on its own.
        out = parse_usage_from_text(
            "rate limit hit, currently at 100% of daily limit"
        )
        self.assertIsNotNone(out)
        self.assertTrue(out["exhausted"])

    def test_hard_limit_plus_used_at_limit_exhausts(self):
        out = parse_usage_from_text("quota exceeded. used 1000 / 1000")
        self.assertIsNotNone(out)
        self.assertTrue(out["exhausted"])

    # ---- Numeric override is authoritative ---------------------------------

    def test_pct_100_alone_exhausts(self):
        out = parse_usage_from_text("you are at 100% of monthly limit")
        self.assertIsNotNone(out)
        self.assertTrue(out["exhausted"])
        self.assertEqual(out["pct"], 1.0)
        self.assertEqual(out["quota_window"], "monthly")

    def test_pct_over_100_alone_exhausts(self):
        out = parse_usage_from_text("currently at 105% of weekly quota")
        self.assertIsNotNone(out)
        self.assertTrue(out["exhausted"])

    def test_used_equals_limit_alone_exhausts(self):
        out = parse_usage_from_text("used 10000 / 10000 tokens")
        self.assertIsNotNone(out)
        self.assertTrue(out["exhausted"])
        self.assertEqual(out["used"], 10000)
        self.assertEqual(out["limit"], 10000)
        self.assertEqual(out["pct"], 1.0)

    def test_used_exceeds_limit_alone_exhausts(self):
        # The parser recognises two phrasings: "used N / M" and "N tokens/requests
        # of M". Use the slash form which it parses unambiguously.
        out = parse_usage_from_text("used 10500 / 10000 requests")
        self.assertIsNotNone(out)
        self.assertTrue(out["exhausted"])
        self.assertEqual(out["used"], 10500)
        self.assertEqual(out["limit"], 10000)

    # ---- Sub-threshold numeric values stay non-exhausting ------------------

    def test_pct_under_100_not_exhausted(self):
        out = parse_usage_from_text("you are at 87% of daily limit")
        self.assertIsNotNone(out)
        self.assertFalse(out["exhausted"])
        self.assertEqual(out["pct"], 0.87)
        self.assertEqual(out["quota_window"], "daily")

    def test_used_under_limit_not_exhausted(self):
        out = parse_usage_from_text("used 8000 / 10000 requests")
        self.assertIsNotNone(out)
        self.assertFalse(out["exhausted"])
        self.assertEqual(out["pct"], 0.8)

    # ---- Reset time extraction ---------------------------------------------

    def test_reset_time_iso(self):
        out = parse_usage_from_text("rate limit reached. resets at 2026-02-15T14:30")
        self.assertIsNotNone(out)
        self.assertIn("2026-02-15", out["reset_at"])

    # ---- Mixed signals -----------------------------------------------------

    def test_full_mixed_signal_exhausts(self):
        text = (
            "quota exceeded (forbidden). rate limit hit. "
            "you are at 100% of monthly limit. used 10000 / 10000. "
            "resets at 2026-03-01T00:00"
        )
        out = parse_usage_from_text(text)
        self.assertIsNotNone(out)
        self.assertTrue(out["exhausted"])
        self.assertEqual(out["pct"], 1.0)
        self.assertEqual(out["used"], 10000)
        self.assertEqual(out["limit"], 10000)
        self.assertEqual(out["quota_window"], "monthly")
        self.assertIsNotNone(out["reset_at"])


if __name__ == "__main__":
    unittest.main()