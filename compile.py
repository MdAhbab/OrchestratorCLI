"""
Build the desktop installers from the repository root.

Usage:
    python compile.py             # build the installer for THIS machine's OS
    python compile.py --win       # Windows NSIS installer   (must run on Windows)
    python compile.py --mac       # macOS DMG (x64 + arm64)  (must run on macOS)
    python compile.py --dir       # fast unpacked build for local smoke testing
    python compile.py --bundle-python   # embed a relocatable Python first
                                        # (self-contained installer, +40-80 MB)

electron-builder cannot cross-compile: the .exe is produced on Windows and the
.dmg on macOS. Run this script once on each machine to get both artifacts.

Output — everything lands in  desktop/release/ :
    Windows : desktop/release/AI-Orchestrator-Setup-<version>.exe
              desktop/release/win-unpacked/            (unpacked app)
    macOS   : desktop/release/AI-Orchestrator-<version>-arm64.dmg
              desktop/release/AI-Orchestrator-<version>-x64.dmg
              desktop/release/mac-arm64/AI Orchestrator.app
    Linux   : desktop/release/AI-Orchestrator-<version>-<arch>.AppImage / .deb
"""

import argparse
import json
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DESKTOP = ROOT / "desktop"
FRONTEND = ROOT / "frontend"
RELEASE_DIR = DESKTOP / "release"
IS_WINDOWS = platform.system().lower() == "windows"
HOST_TARGET = {"windows": "win", "darwin": "mac", "linux": "linux"}[platform.system().lower()]


def run(cmd, cwd, **kwargs):
    print(f"\n>> {' '.join(cmd)}   (in {cwd.relative_to(ROOT) if cwd != ROOT else '.'})")
    subprocess.run(cmd, cwd=str(cwd), check=True, shell=IS_WINDOWS, **kwargs)


def load_version() -> str:
    return json.loads((ROOT / "packaging" / "version.json").read_text())["version"]


def check_prerequisites() -> None:
    if not shutil.which("npm"):
        sys.exit("ERROR: npm not found on PATH. Install Node.js 18+ first.")
    if sys.version_info < (3, 8):
        sys.exit("ERROR: Python 3.8+ required.")


def ensure_node_modules() -> None:
    for pkg_dir in (FRONTEND, DESKTOP):
        if not (pkg_dir / "node_modules").is_dir():
            run(["npm", "install"], cwd=pkg_dir)


def clean_release_dir() -> None:
    """Kill any running app instance and clear desktop/release for a fresh unpack.

    electron-builder fails with 'Access is denied' when a previous build's exe
    is still running (a locked win-unpacked/AI Orchestrator.exe).
    """
    kill_cmd = (
        ["taskkill", "/IM", "AI Orchestrator.exe", "/F", "/T"]
        if IS_WINDOWS
        else ["pkill", "-f", "AI Orchestrator"]
    )
    subprocess.run(kill_cmd, capture_output=True, shell=False)

    if RELEASE_DIR.is_dir():
        try:
            shutil.rmtree(RELEASE_DIR)
            print(f">> cleared {RELEASE_DIR.relative_to(ROOT)}")
        except PermissionError:
            sys.exit(
                f"ERROR: cannot clear {RELEASE_DIR} — close any running "
                "'AI Orchestrator' window (or File Explorer inside that folder) and retry."
            )


def bundle_python() -> None:
    run([sys.executable, str(ROOT / "packaging" / "fetch_python.py")], cwd=ROOT)


def list_artifacts(version: str) -> list[Path]:
    if not RELEASE_DIR.is_dir():
        return []
    found = [
        p for p in RELEASE_DIR.rglob("*")
        if p.is_file() and p.suffix in (".exe", ".dmg", ".AppImage", ".deb") and version in p.name
    ]
    found += [d for d in RELEASE_DIR.glob("*-unpacked") if d.is_dir()]
    found += list(RELEASE_DIR.glob("mac*/AI Orchestrator.app"))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    target_group = parser.add_mutually_exclusive_group()
    target_group.add_argument("--win", action="store_true", help="build the Windows NSIS installer")
    target_group.add_argument("--mac", action="store_true", help="build the macOS DMGs")
    target_group.add_argument("--linux", action="store_true", help="build the Linux AppImage/deb")
    target_group.add_argument("--dir", action="store_true", help="unpacked build only (fast smoke test)")
    parser.add_argument("--bundle-python", action="store_true",
                        help="download a relocatable Python into the app so end users don't need Python")
    args = parser.parse_args()

    requested = "win" if args.win else "mac" if args.mac else "linux" if args.linux else HOST_TARGET
    if requested != HOST_TARGET and not args.dir:
        other = {"win": "a Windows machine", "mac": "a Mac", "linux": "a Linux machine"}[requested]
        sys.exit(
            f"ERROR: the --{requested} installer can only be built on {other} "
            f"(this machine is {HOST_TARGET}; electron-builder does not cross-compile "
            f"NSIS/DMG). Clone the repo there and run:  python compile.py --{requested}"
        )

    check_prerequisites()
    version = load_version()
    print("=" * 70)
    print(f"AI Orchestrator build v{version} — target: {'unpacked dir' if args.dir else requested}")
    print("=" * 70)

    ensure_node_modules()
    clean_release_dir()
    if args.bundle_python:
        bundle_python()

    if args.dir:
        # Fast path: skips the venv/bundled-python steps, produces only the
        # unpacked app under desktop/release/*-unpacked for local testing.
        run(["npm", "run", "dist:dir"], cwd=DESKTOP)
    else:
        # Full pipeline (single source of truth): backend venv check, frontend
        # build, bundled-Python deps if present, then the platform installer.
        run([sys.executable, str(ROOT / "packaging" / "build.py")], cwd=ROOT)

    artifacts = list_artifacts(version)
    print("\n" + "=" * 70)
    print(f"Artifacts (in {RELEASE_DIR}):")
    if artifacts:
        for a in sorted(artifacts):
            size = f" ({a.stat().st_size / 1024 / 1024:.1f} MB)" if a.is_file() else "  (folder)"
            print(f"  {a.relative_to(ROOT)}{size}")
    else:
        print("  (none found — check the build log above)")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except subprocess.CalledProcessError as e:
        sys.exit(f"\nBuild step failed with exit code {e.returncode} — see output above.")
