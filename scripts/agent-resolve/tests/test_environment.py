"""Unit tests for `agent_resolve.environment` (TDD Red Phase)."""

import io
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import agent_resolve
from agent_resolve import config
from agent_resolve.environment import (
    DEFAULT_SUPABASE_TEST_ENV,
    is_docker_available,
    log,
    run_cmd,
    run_isolated_test,
    sanitize_secrets,
)


class TestEnvironment(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_root = config.get_project_root()
        self._orig_env = os.environ.copy()

    def tearDown(self) -> None:
        config.set_project_root(self._orig_root)
        os.environ.clear()
        os.environ.update(self._orig_env)

    def test_log_writes_utc_timestamped_message_to_custom_stream_and_stdout(self) -> None:
        # Custom stream output
        buf = io.StringIO()
        log("Hello CI", file=buf)
        output = buf.getvalue()
        self.assertRegex(output, r"^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\] Hello CI\n$")

        # Default stream (sys.stdout)
        with patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
            log("Default stream")
            stdout_val = mock_stdout.getvalue()
            self.assertRegex(
                stdout_val,
                r"^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\] Default stream\n$",
            )

    def test_sanitize_secrets_handles_empty_and_none_like_strings(self) -> None:
        self.assertEqual(sanitize_secrets(""), "")

    def test_sanitize_secrets_redacts_github_tokens_aiza_keys_and_bearer_tokens(self) -> None:
        # GitHub tokens (classic, installation, fine-grained PAT)
        self.assertEqual(
            sanitize_secrets("Found token ghp_1234567890abcdef1234567890abcdef in header"),
            "Found token [REDACTED_GH_TOKEN] in header",
        )
        self.assertEqual(
            sanitize_secrets("Token: ghs_1234567890abcdef1234567890abcdef"),
            "Token: [REDACTED_GH_TOKEN]",
        )
        self.assertEqual(
            sanitize_secrets("Token: gho_1234567890abcdef1234567890abcdef"),
            "Token: [REDACTED_GH_TOKEN]",
        )
        self.assertEqual(
            sanitize_secrets("Token: ghu_1234567890abcdef1234567890abcdef"),
            "Token: [REDACTED_GH_TOKEN]",
        )
        self.assertEqual(
            sanitize_secrets("Token: ghr_1234567890abcdef1234567890abcdef"),
            "Token: [REDACTED_GH_TOKEN]",
        )
        self.assertEqual(
            sanitize_secrets("PAT: github_pat_11AAAAAAA001234567890abcdef1234567890"),
            "PAT: [REDACTED_GH_TOKEN]",
        )

        # Google AIza API key
        self.assertEqual(
            sanitize_secrets("key=AIzaSyA12345678901234567890123456789012"),
            "key=[REDACTED_AIZA_KEY]",
        )

        # Bearer tokens
        self.assertEqual(
            sanitize_secrets("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sig"),
            "Authorization: Bearer [REDACTED_TOKEN]",
        )

    def test_sanitize_secrets_redacts_sensitive_env_vars_with_min_length_guard(self) -> None:
        sensitive_vars = {
            "GEMINI_API_KEY": "gemini-secret-token-value",
            "GH_TOKEN": "gh-custom-secret-val",
            "GITHUB_TOKEN": "gh-token-secret-val",
            "APP_ID": "12345678",
            "APP_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----abcdef",
            "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.supabase-service-key",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.supabase-anon-key",
            "GOOGLE_MAPS_API_KEY": "custom-maps-api-key-val",
            "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY": "custom-next-maps-api-key-val",
            "SUPABASE_DB_URL": "postgresql://postgres:pass@localhost:5432/db",
            "POSTGRES_PASSWORD": "custom-postgres-password",
            "JWT_SECRET": "custom-jwt-secret-val",
            "VERCEL_TOKEN": "custom-vercel-token-val",
            "SUPABASE_ACCESS_TOKEN": "custom-supabase-access-token-val",
        }
        for k, v in sensitive_vars.items():
            os.environ[k] = v

        text = (
            "Env check: GEMINI=gemini-secret-token-value, GH=gh-custom-secret-val, "
            "GITHUB=gh-token-secret-val, APP_ID=12345678, "
            "APP_KEY=-----BEGIN RSA PRIVATE KEY-----abcdef, "
            "SRV=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.supabase-service-key, "
            "ANON=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.supabase-anon-key, "
            "MAPS=custom-maps-api-key-val, NEXT_MAPS=custom-next-maps-api-key-val, "
            "DB=postgresql://postgres:pass@localhost:5432/db, PG_PASS=custom-postgres-password, "
            "JWT=custom-jwt-secret-val, VERCEL=custom-vercel-token-val, "
            "SB_TOKEN=custom-supabase-access-token-val"
        )
        sanitized = sanitize_secrets(text)
        for k in sensitive_vars:
            self.assertIn(f"[REDACTED_{k}]", sanitized)
            self.assertNotIn(sensitive_vars[k], sanitized)

        # Length guard: length < 6 must NOT be redacted
        os.environ["APP_ID"] = "12345"
        self.assertEqual(
            sanitize_secrets("Issue ID is 12345 in repo"),
            "Issue ID is 12345 in repo",
        )

    def test_sanitize_secrets_redacts_regex_patterns(self) -> None:
        supabase_pat = "sbp_1234567890abcdef1234567890abcdef1234"
        aq_key = "AQ1234567890abcdef123456"
        sb_secret = "sb_secret_abcdef1234567890xyz123"
        pg_url = "postgresql://postgres:mypassword@db.jfsxclrdxmvftxacjuqf.supabase.co:5432/postgres"

        raw = f"Details: token={supabase_pat}, aq={aq_key}, sb={sb_secret}, conn={pg_url}"
        sanitized = sanitize_secrets(raw)

        self.assertNotIn(supabase_pat, sanitized)
        self.assertNotIn(aq_key, sanitized)
        self.assertNotIn(sb_secret, sanitized)
        self.assertNotIn(pg_url, sanitized)
        self.assertIn("[REDACTED_SUPABASE_TOKEN]", sanitized)
        self.assertIn("[REDACTED_AQ_KEY]", sanitized)
        self.assertIn("[REDACTED_SECRET]", sanitized)
        self.assertIn("[REDACTED_DB_URL]", sanitized)

    def test_run_cmd_executes_and_strips_output_using_dynamic_project_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir).resolve()
            config.set_project_root(tmp_path)
            agent_resolve.PROJECT_ROOT = tmp_path

            # Default cwd resolves dynamically to PROJECT_ROOT
            code, stdout, stderr = run_cmd([sys.executable, "-c", "import os; print(os.getcwd())"])
            self.assertEqual(code, 0)
            self.assertEqual(stdout, str(tmp_path))
            self.assertEqual(stderr, "")

        # Explicit cwd override
        with tempfile.TemporaryDirectory() as custom_dir:
            custom_path = Path(custom_dir).resolve()
            code, stdout, stderr = run_cmd(
                [sys.executable, "-c", "import os; print(os.getcwd())"],
                cwd=custom_path,
            )
            self.assertEqual(code, 0)
            self.assertEqual(stdout, str(custom_path))
            self.assertEqual(stderr, "")

    def test_run_cmd_raises_runtime_error_when_check_true_and_nonzero_exit(self) -> None:
        cmd = [sys.executable, "-c", "import sys; sys.stderr.write('fatal boom\\n'); sys.exit(42)"]

        # check=False returns code and does not raise
        code, stdout, stderr = run_cmd(cmd, check=False)
        self.assertEqual(code, 42)
        self.assertEqual(stderr, "fatal boom")

        # check=True raises RuntimeError containing code, stderr, stdout
        with self.assertRaises(RuntimeError) as ctx:
            run_cmd(cmd, check=True)
        self.assertIn("failed (code 42)", str(ctx.exception))
        self.assertIn("fatal boom", str(ctx.exception))

    def test_run_cmd_timeout_returns_124_or_raises_timeout_error_when_checked(self) -> None:
        # check=False -> returns (124, stdout, stderr_with_timeout_msg)
        with patch("subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.communicate.side_effect = [
                subprocess.TimeoutExpired(cmd=["sleep", "10"], timeout=1),
                ("partial out", "partial err"),
            ]
            mock_proc.returncode = None
            mock_popen.return_value = mock_proc

            code, stdout, stderr = run_cmd(["sleep", "10"], check=False, timeout=1)
            self.assertEqual(code, 124)
            self.assertEqual(stdout, "partial out")
            self.assertIn("Command sleep 10 timed out after 1 seconds.", stderr)
            mock_proc.kill.assert_called_once()

        # check=True -> raises TimeoutError
        with patch("subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.communicate.side_effect = [
                subprocess.TimeoutExpired(cmd=["sleep", "10"], timeout=1),
                ("partial out", "partial err"),
            ]
            mock_proc.returncode = None
            mock_popen.return_value = mock_proc

            with self.assertRaises(TimeoutError) as ctx:
                run_cmd(["sleep", "10"], check=True, timeout=1)
            self.assertIn("Command sleep 10 timed out after 1 seconds.", str(ctx.exception))
            mock_proc.kill.assert_called_once()

    def test_is_docker_available_returns_true_on_zero_and_false_on_error_or_exception(self) -> None:
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = SimpleNamespace(returncode=0)
            self.assertTrue(is_docker_available())
            mock_run.assert_called_once_with(
                ["docker", "info"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = SimpleNamespace(returncode=1)
            self.assertFalse(is_docker_available())

        with patch("subprocess.run", side_effect=FileNotFoundError("docker not found")):
            self.assertFalse(is_docker_available())

        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=["docker", "info"], timeout=5)):
            self.assertFalse(is_docker_available())

    def test_run_isolated_test_docker_branch_constructs_hardened_container_cmd(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir).resolve()
            config.set_project_root(tmp_path)
            agent_resolve.PROJECT_ROOT = tmp_path

            test_cmd = ["npm", "test"]
            with patch("agent_resolve.environment.is_docker_available", return_value=True), \
                 patch("os.getuid", return_value=1000), \
                 patch("os.getgid", return_value=1000), \
                 patch("agent_resolve.environment.run_cmd", return_value=(0, "ok", "")) as mock_run_cmd:
                code, out, err = run_isolated_test(test_cmd, timeout=120)
                self.assertEqual(code, 0)
                mock_run_cmd.assert_called_once()
                called_args, called_kwargs = mock_run_cmd.call_args

                docker_cmd = called_args[0]
                expected_prefix = [
                    "docker", "run", "--rm",
                    "--network", "none",
                    "--user", "1000:1000",
                    "-v", f"{tmp_path}:/app:ro",
                    "--tmpfs", "/tmp:rw,exec,size=512m",
                    "-w", "/app",
                ]
                for prefix_token in expected_prefix:
                    self.assertIn(prefix_token, docker_cmd)
                self.assertEqual(docker_cmd[-3:], ["node:24-slim", "npm", "test"])
                self.assertEqual(called_kwargs["cwd"], tmp_path)
                self.assertNotEqual(called_kwargs["env"], {})
                self.assertIn("PATH", called_kwargs["env"])
                for sensitive in ["GEMINI_API_KEY", "GH_TOKEN", "SUPABASE_DB_URL"]:
                    self.assertNotIn(sensitive, called_kwargs["env"])
                self.assertEqual(called_kwargs["check"], False)
                self.assertEqual(called_kwargs["timeout"], 120)

    def test_run_isolated_test_raises_in_ci_when_docker_unavailable(self) -> None:
        with patch("agent_resolve.environment.is_docker_available", return_value=False), \
             patch.dict(os.environ, {"CI": "true"}):
            with self.assertRaises(RuntimeError) as ctx:
                run_isolated_test(["npm", "test"])
            self.assertIn("Docker daemon is unavailable in CI", str(ctx.exception))

    def test_run_cmd_scrubs_sensitive_env_keys_and_patterns_when_env_is_none(self) -> None:
        with patch.dict(os.environ, {
            "GEMINI_API_KEY": "secret_gemini",
            "GH_TOKEN": "secret_gh",
            "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY": "secret_maps",
            "SUPABASE_DB_URL": "postgresql://postgres:secret@localhost:5432/db",
            "POSTGRES_PASSWORD": "secret_postgres",
            "JWT_SECRET": "secret_jwt",
            "VERCEL_TOKEN": "secret_vercel",
            "SUPABASE_ACCESS_TOKEN": "secret_supabase_token",
            "AQ_TEST_KEY": "secret_aq_key",
            "sb_secret_val": "secret_sb_key",
            "SAFE_HOST_VAR": "keep_this_variable",
        }, clear=True), patch("subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.communicate.return_value = ("stdout", "stderr")
            mock_proc.returncode = 0
            mock_popen.return_value = mock_proc

            run_cmd(["echo", "hello"], env=None)
            mock_popen.assert_called_once()
            passed_env = mock_popen.call_args.kwargs["env"]

            self.assertEqual(passed_env.get("SAFE_HOST_VAR"), "keep_this_variable")
            for scrubbed in [
                "GEMINI_API_KEY",
                "GH_TOKEN",
                "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
                "SUPABASE_DB_URL",
                "POSTGRES_PASSWORD",
                "JWT_SECRET",
                "VERCEL_TOKEN",
                "SUPABASE_ACCESS_TOKEN",
                "AQ_TEST_KEY",
                "sb_secret_val",
            ]:
                self.assertNotIn(scrubbed, passed_env)

    def test_run_isolated_test_fallback_branch_scrubs_sensitive_env_vars(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir).resolve()
            config.set_project_root(tmp_path)
            agent_resolve.PROJECT_ROOT = tmp_path

            sensitive_keys = [
                "GEMINI_API_KEY",
                "GH_TOKEN",
                "GITHUB_TOKEN",
                "APP_ID",
                "APP_PRIVATE_KEY",
                "SUPABASE_SERVICE_ROLE_KEY",
                "NEXT_PUBLIC_SUPABASE_ANON_KEY",
                "GOOGLE_MAPS_API_KEY",
            ]
            for key in sensitive_keys:
                os.environ[key] = f"secret_{key}"
            os.environ["SAFE_VAR"] = "keep_me"

            test_cmd = ["npm", "test"]
            with patch("agent_resolve.environment.is_docker_available", return_value=False), \
                 patch("agent_resolve.environment.run_cmd", return_value=(0, "ok", "")) as mock_run_cmd:
                code, out, err = run_isolated_test(test_cmd, timeout=60)
                self.assertEqual(code, 0)
                mock_run_cmd.assert_called_once()
                called_args, called_kwargs = mock_run_cmd.call_args

                self.assertEqual(called_args[0], test_cmd)
                self.assertEqual(called_kwargs["cwd"], tmp_path)
                self.assertEqual(called_kwargs["check"], False)
                self.assertEqual(called_kwargs["timeout"], 60)

                passed_env = called_kwargs["env"]
                self.assertEqual(passed_env.get("SAFE_VAR"), "keep_me")
                for key in [
                    "GEMINI_API_KEY",
                    "GH_TOKEN",
                    "GITHUB_TOKEN",
                    "APP_ID",
                    "APP_PRIVATE_KEY",
                    "GOOGLE_MAPS_API_KEY",
                ]:
                    self.assertNotIn(key, passed_env)

                # Supabase secrets must be scrubbed and replaced with safe fallback values
                self.assertEqual(passed_env.get("NEXT_PUBLIC_SUPABASE_URL"), "http://127.0.0.1:54321")
                self.assertEqual(passed_env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), "test-anon-key")
                self.assertEqual(passed_env.get("SUPABASE_SERVICE_ROLE_KEY"), "test-service-role-key")

    def test_run_isolated_test_docker_branch_injects_supabase_dummy_env_vars(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir).resolve()
            config.set_project_root(tmp_path)
            agent_resolve.PROJECT_ROOT = tmp_path

            test_cmd = ["npm", "test"]
            with patch("agent_resolve.environment.is_docker_available", return_value=True), \
                 patch("os.getuid", return_value=1000), \
                 patch("os.getgid", return_value=1000), \
                 patch("agent_resolve.environment.run_cmd", return_value=(0, "ok", "")) as mock_run_cmd:
                code, out, err = run_isolated_test(test_cmd, timeout=60)
                self.assertEqual(code, 0)
                docker_cmd = mock_run_cmd.call_args[0][0]
                self.assertIn("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321", docker_cmd)
                self.assertIn("NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key", docker_cmd)
                self.assertIn("SUPABASE_SERVICE_ROLE_KEY=test-service-role-key", docker_cmd)

    def test_run_isolated_test_fallback_branch_injects_supabase_dummy_env_vars(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir).resolve()
            config.set_project_root(tmp_path)
            agent_resolve.PROJECT_ROOT = tmp_path

            test_cmd = ["npm", "test"]
            with patch("agent_resolve.environment.is_docker_available", return_value=False), \
                 patch("agent_resolve.environment.run_cmd", return_value=(0, "ok", "")) as mock_run_cmd:
                code, out, err = run_isolated_test(test_cmd, timeout=60)
                self.assertEqual(code, 0)
                passed_env = mock_run_cmd.call_args[1]["env"]
                self.assertEqual(passed_env.get("NEXT_PUBLIC_SUPABASE_URL"), "http://127.0.0.1:54321")
                self.assertEqual(passed_env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), "test-anon-key")
                self.assertEqual(passed_env.get("SUPABASE_SERVICE_ROLE_KEY"), "test-service-role-key")


    def test_default_supabase_test_env_constant_contains_canonical_fallbacks(self) -> None:
        self.assertEqual(
            DEFAULT_SUPABASE_TEST_ENV,
            {
                "NEXT_PUBLIC_SUPABASE_URL": "http://127.0.0.1:54321",
                "NEXT_PUBLIC_SUPABASE_ANON_KEY": "test-anon-key",
                "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key",
            },
        )


if __name__ == "__main__":
    unittest.main()
