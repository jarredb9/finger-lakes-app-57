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
        }
        for k, v in sensitive_vars.items():
            os.environ[k] = v

        text = (
            "Env check: GEMINI=gemini-secret-token-value, GH=gh-custom-secret-val, "
            "GITHUB=gh-token-secret-val, APP_ID=12345678, "
            "APP_KEY=-----BEGIN RSA PRIVATE KEY-----abcdef, "
            "SRV=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.supabase-service-key, "
            "ANON=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.supabase-anon-key, "
            "MAPS=custom-maps-api-key-val"
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
                self.assertEqual(called_kwargs["env"], {})
                self.assertEqual(called_kwargs["check"], False)
                self.assertEqual(called_kwargs["timeout"], 120)

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
                for key in sensitive_keys:
                    self.assertNotIn(key, passed_env)


if __name__ == "__main__":
    unittest.main()
