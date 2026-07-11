"""
Automated smoke test for AI Orchestrator.

Boots the backend on a scratch port, exercises the API surface end to end
(health, providers, quota, sessions, agents, A2A messaging, the git command
sandbox, storage endpoints, and optionally a real PTY terminal), then prints
the manual checklist for everything a script cannot verify.

Usage:
    python smoke_test.py            # boot a fresh backend on port 8199 and test it
    python smoke_test.py --pty      # also spawn + kill a real terminal (needs pywinpty on Windows)
    python smoke_test.py --url http://127.0.0.1:8000    # test an already-running backend
"""

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8199

PASS, FAIL, WARN = "PASS", "FAIL", "WARN"
results: list[tuple[str, str, str]] = []


def record(status: str, name: str, detail: str = "") -> None:
    results.append((status, name, detail))
    pad = " " * max(1, 46 - len(name))
    print(f"  [{status}] {name}{pad}{detail}")


def http(method: str, url: str, body: dict | None = None, timeout: float = 15.0):
    """Return (status_code, parsed_json_or_None). Never raises for HTTP errors."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, None
    except Exception as e:
        return 0, {"error": str(e)}


def wait_for_health(base: str, tries: int = 40) -> bool:
    for _ in range(tries):
        code, body = http("GET", f"{base}/health", timeout=3)
        if code == 200 and isinstance(body, dict) and body.get("status") == "healthy":
            return True
        time.sleep(0.5)
    return False


def run_checks(base: str, with_pty: bool) -> None:
    api = f"{base}/api"

    code, body = http("GET", f"{base}/health")
    if code == 200 and isinstance(body, dict) and body.get("database") == "connected":
        record(PASS, "health + database", f"v{body.get('version', '?')}")
    else:
        record(FAIL, "health + database", f"HTTP {code}: {body}")
        return  # nothing else is meaningful

    code, body = http("GET", f"{api}/providers?enabled_only=false")
    n = len(body.get("providers", [])) if isinstance(body, dict) else 0
    record(PASS if code == 200 and n > 0 else FAIL, "providers list", f"{n} providers")

    code, body = http("GET", f"{api}/orchestrator/quota")
    record(PASS if code == 200 and isinstance(body, list) else FAIL,
           "quota endpoint returns a list", f"HTTP {code}")

    code, _ = http("GET", f"{api}/sessions?limit=5")
    record(PASS if code == 200 else FAIL, "sessions list", f"HTTP {code}")

    code, body = http("GET", f"{api}/agents?limit=5")
    record(PASS if code == 200 and isinstance(body, list) else FAIL, "agents discovery", f"HTTP {code}")

    # Regression: this endpoint used to crash with a NameError (missing import).
    code, body = http("POST", f"{api}/agents/a2a/send", {
        "from_agent": "smoke-test", "to_agent": "claude", "content": "ping",
    })
    ok = code == 200 and isinstance(body, dict) and body.get("status") == "queued"
    record(PASS if ok else FAIL, "a2a send (NameError regression)", f"HTTP {code}")

    if ok:
        code, body = http("GET", f"{api}/agents/a2a/inbox/claude?limit=5")
        got = any(m.get("from") == "smoke-test" for m in body) if isinstance(body, list) else False
        record(PASS if got else FAIL, "a2a inbox receives the message", f"HTTP {code}")

    # Git sandbox: argument-level escapes must be rejected before anything runs.
    for name, cmd in [
        ("git sandbox blocks --upload-pack", "git fetch --upload-pack=calc"),
        ("git sandbox blocks --output", "git log --output=owned.txt"),
        ("git sandbox blocks config writes", "git config core.editor calc"),
        ("git sandbox blocks unlisted subcommands", "git clean -fdx"),
    ]:
        code, _ = http("POST", f"{api}/workspace/git/run", {"command": cmd})
        record(PASS if code == 400 else FAIL, name, f"HTTP {code} (expected 400)")

    code, _ = http("POST", f"{api}/workspace/git/run", {"command": "git push origin main"})
    record(PASS if code == 400 else FAIL, "git write ops require confirmation", f"HTTP {code} (expected 400)")

    code, body = http("GET", f"{api}/settings/storage")
    record(PASS if code == 200 else FAIL, "storage summary (off-loop walk)", f"HTTP {code}")

    code, _ = http("GET", f"{api}/settings/cli-registry")
    record(PASS if code == 200 else FAIL, "CLI registry", f"HTTP {code}")

    if with_pty:
        code, body = http("POST", f"{api}/runtimes/spawn",
                          {"provider_name": "SmokeTest", "cols": 80, "rows": 24}, timeout=30)
        if code in (200, 201) and isinstance(body, dict) and body.get("runtime_id"):
            rid = body["runtime_id"]
            record(PASS, "PTY spawn", f"runtime {rid}, pid {body.get('pid')}")
            code, _ = http("DELETE", f"{api}/runtimes/{rid}")
            record(PASS if code in (200, 204) else FAIL, "PTY kill (tree)", f"HTTP {code}")
        elif code == 429:
            record(WARN, "PTY spawn", "429 — concurrent terminal cap already reached")
        else:
            record(FAIL, "PTY spawn", f"HTTP {code}: {body}")
    else:
        record(WARN, "PTY spawn/kill", "skipped — rerun with --pty")


MANUAL_CHECKLIST = """
======================================================================
MANUAL CHECKLIST — run the app (python compile.py --dir, then launch
desktop/release/win-unpacked/AI Orchestrator.exe, or npm run desktop:dev)
and verify one by one:

  Startup & shell
   1. App opens to the chat view; no blank window; Loader disappears.
   2. Quit the app, then check Task Manager: no leftover python/uvicorn
      process survives (shutdown fix).
   3. Reopen; on macOS also close the window and click the Dock icon —
      the window returns WITHOUT booting a second backend (port 8000
      must not conflict).

  Chat & orchestration
   4. Send a task in chat: tokens stream smoothly; while it streams,
      scroll UP — the view must stay where you put it (no yank-down);
      when the reply finishes it smooth-scrolls only if you were at
      the bottom.
   5. The reply's "Task divisions" panel lists agents; open Processes —
      the same divisions appear on the terminal cards.
   6. In workspace/shared/divisions.md, statuses flip from queued to
      done as agents report (regex fix).
   7. Dispatch with one division naming a bogus agent (or just observe
      logs): the request must NOT 500; valid divisions still delegate.

  Terminals
   8. Open Processes; a terminal connects and stays connected — watch
      for a minute; the status badge must not cycle
      connecting/closed/connecting (reconnect-loop fix).
   9. Type in the terminal; keys echo once. Open the fullscreen
      terminal, close, reopen — still ONE character per keypress
      (doubled-input fix).
  10. Assign a task containing an apostrophe (e.g. "don't break") on
      Mac: the command line the CLI receives keeps the apostrophe.
  11. Spawn more terminals than max_concurrent_processes (default 5):
      the app shows a clear limit error, not a hang.
  12. Kill a terminal running `npm run dev` (or any parent+child):
      Task Manager shows the whole tree gone.

  Settings & UI
  13. Settings > font size sm/md/lg visibly scales the UI immediately.
  14. Settings > accent color applies; theme toggle works both ways.
  15. Any dropdown: open with keyboard (ArrowDown), navigate with
      arrows/Home/End, Escape closes and returns focus.
  16. GitHub + Changelog links in Settings open MdAhbab/OrchestratorCLI
      in the system browser (never inside the app window).
  17. Voice button: with mic denied it shows an error toast — it must
      NEVER type a canned demo sentence.
  18. Leave the app minimized 2+ minutes: CPU near 0% (pollers pause);
      restore — data refreshes within a few seconds.

  Update & packaging (after a real release build)
  19. Install the .exe/.dmg; first launch creates the DB and reaches
      the chat view with the backend healthy.
  20. With an older version installed and a newer GitHub release
      published: the in-app updater finds and downloads it.
======================================================================
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", help="test an already-running backend instead of booting one")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--pty", action="store_true", help="also spawn and kill a real terminal")
    args = parser.parse_args()

    proc = None
    base = args.url.rstrip("/") if args.url else f"http://127.0.0.1:{args.port}"

    print("=" * 70)
    print(f"AI Orchestrator smoke test — {base}")
    print("=" * 70)

    try:
        if not args.url:
            proc = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "backend.main:app",
                 "--host", "127.0.0.1", "--port", str(args.port)],
                cwd=str(ROOT),
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            print(f"  booting backend (pid {proc.pid}) ...")
        if not wait_for_health(base):
            record(FAIL, "backend boot", f"no healthy response from {base}/health")
        else:
            run_checks(base, args.pty)
    finally:
        if proc is not None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()

    failed = sum(1 for s, _, _ in results if s == FAIL)
    passed = sum(1 for s, _, _ in results if s == PASS)
    print("-" * 70)
    print(f"  {passed} passed, {failed} failed, "
          f"{sum(1 for s, _, _ in results if s == WARN)} warnings")
    print(MANUAL_CHECKLIST)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
