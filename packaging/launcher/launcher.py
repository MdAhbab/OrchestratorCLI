"""
Orchestrator desktop launcher: tray icon, local FastAPI (bundled static UI), opens browser.

When frozen with PyInstaller, expects layout:
  <install>/
    Orchestrator.exe
    backend/
    frontend/dist/
    python/   (optional embeddable interpreter)

Per-user data: %LOCALAPPDATA%\\Orchestrator\\
"""

from __future__ import annotations

import atexit
import os
import socket
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path


def _find_repo_root() -> Path:
    here = Path(__file__).resolve()
    for p in list(here.parents)[:8]:
        if (p / "backend" / "main.py").is_file():
            return p
    return here.parent


def install_root() -> Path:
    env = (
        os.environ.get("ORCHESTRATOR_INSTALL_ROOT")
        or os.environ.get("BOB_INSTALL_ROOT", "")
    ).strip()
    if env:
        return Path(env)
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return _find_repo_root()


def user_data_dir() -> Path:
    override = (
        os.environ.get("ORCHESTRATOR_USER_DATA")
        or os.environ.get("IBMBOB_USER_DATA", "")
    ).strip()
    if override:
        d = Path(override)
    else:
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        d = Path(base) / "Orchestrator"
    (d / "data").mkdir(parents=True, exist_ok=True)
    (d / "logs").mkdir(parents=True, exist_ok=True)
    return d


def pick_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def python_exe(root: Path) -> Path:
    bundled = root / "python" / "python.exe"
    if bundled.is_file():
        return bundled
    return Path(sys.executable)


def ensure_user_env(udata: Path, root: Path) -> None:
    env_file = udata / ".env"
    example = root / "backend" / ".env.example"
    if not env_file.is_file() and example.is_file():
        try:
            env_file.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
        except OSError:
            pass
    db = udata / "data" / "bob.db"
    os.environ["DATABASE_PATH"] = str(db)
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///" + str(db).replace("\\", "/")
    os.environ["ORCHESTRATOR_BUNDLED"] = "1"
    os.environ.setdefault("BOB_BUNDLED", "1")
    os.environ["ORCHESTRATOR_USER_DATA"] = str(udata)
    os.environ.setdefault("IBMBOB_USER_DATA", str(udata))
    if env_file.is_file():
        os.environ["DOTENV_PATH"] = str(env_file)


def run_init_db(py: Path, root: Path) -> None:
    init_script = root / "backend" / "database" / "init_db.py"
    if not init_script.is_file():
        return
    subprocess.run(
        [str(py), str(init_script), "--db-path", os.environ["DATABASE_PATH"]],
        cwd=str(root),
        check=False,
    )


def start_backend(py: Path, root: Path, port: int) -> subprocess.Popen:
    cmd = [
        str(py),
        "-m",
        "uvicorn",
        "backend.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
    ]
    log_dir = user_data_dir() / "logs"
    logf = open(log_dir / "backend.log", "a", encoding="utf-8")
    return subprocess.Popen(
        cmd,
        cwd=str(root),
        stdout=logf,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )


def main() -> None:
    root = install_root()
    udata = user_data_dir()
    ensure_user_env(udata, root)
    py = python_exe(root)
    if not (udata / "data" / "bob.db").is_file():
        run_init_db(py, root)

    port = pick_port()
    proc = start_backend(py, root, port)
    atexit.register(lambda: proc.terminate())

    url = f"http://127.0.0.1:{port}"
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    try:
        import pystray
        from PIL import Image, ImageDraw

        def icon_image():
            img = Image.new("RGB", (64, 64), color=(15, 15, 20))
            d = ImageDraw.Draw(img)
            d.rounded_rectangle((8, 8, 56, 56), radius=12, fill=(99, 102, 241))
            return img

        def on_open(_icon, _item):
            webbrowser.open(url)

        def on_quit(_icon, _item):
            proc.terminate()
            _icon.stop()

        icon = pystray.Icon(
            "orchestrator",
            icon_image(),
            "Orchestrator",
            menu=pystray.Menu(
                pystray.MenuItem("Open", on_open),
                pystray.MenuItem("Quit", on_quit),
            ),
        )
        icon.run()
    except ImportError:
        print(f"Orchestrator running at {url} (install pystray + pillow for tray)")
        try:
            proc.wait()
        except KeyboardInterrupt:
            proc.terminate()


if __name__ == "__main__":
    main()
