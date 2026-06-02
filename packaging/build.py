"""
Main build orchestration script for AI CLI Orchestrator v0.8.0
Builds installers for all platforms using electron-builder.
No PyInstaller required — Python source is bundled via extraResources.
"""

import sys
import subprocess
import json
import platform
from pathlib import Path
from datetime import datetime
import io

# Fix Windows console encoding for emoji support
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


class InstallerBuilder:
    def __init__(self):
        self.root_dir = Path(__file__).parent
        self.project_root = self.root_dir.parent
        self.desktop_dir = self.project_root / 'desktop'
        self.frontend_dir = self.project_root / 'frontend'
        self.backend_dir = self.project_root / 'backend'
        self.version = self.load_version()
        self.build_timestamp = datetime.now().isoformat()
        self.current_platform = platform.system().lower()

    def load_version(self):
        """Load version from version.json"""
        version_file = self.root_dir / "version.json"
        with open(version_file, 'r') as f:
            return json.load(f)['version']

    def print_header(self):
        print("=" * 70)
        print(f"AI CLI Orchestrator — Installer Builder v{self.version}")
        print("=" * 70)
        print(f"Platform:   {self.current_platform}")
        print(f"Build time: {self.build_timestamp}")
        print(f"Project:    {self.project_root}")
        print("=" * 70)

    def setup_backend_venv(self):
        """Create / refresh backend venv and install requirements."""
        print("\n[1/3] Setting up Python backend venv")
        print("-" * 70)
        script = self.root_dir / "backend" / "build_backend.py"
        if not script.exists():
            print(f"  ERROR build script not found: {script}")
            return False
        try:
            subprocess.run(
                [sys.executable, str(script)],
                cwd=str(self.project_root),
                check=True,
            )
            print("  OK  backend venv ready")
            return True
        except subprocess.CalledProcessError as e:
            print(f"  ERROR backend venv setup failed (exit {e.returncode})")
            return False

    def build_frontend(self):
        """Build the Vite frontend."""
        print("\n[2/3] Building frontend")
        print("-" * 70)
        try:
            subprocess.run(
                ["npm", "run", "build"],
                cwd=str(self.frontend_dir),
                check=True,
                shell=(self.current_platform == 'windows'),
            )
            print("  OK  frontend built")
            return True
        except subprocess.CalledProcessError as e:
            print(f"  ERROR frontend build failed (exit {e.returncode})")
            return False

    def build_desktop(self):
        """Build the Electron desktop app with electron-builder."""
        print("\n[3/3] Building desktop installer")
        print("-" * 70)
        if self.current_platform == 'windows':
            target_flag = ['--win']
        elif self.current_platform == 'darwin':
            target_flag = ['--mac']
        else:
            target_flag = ['--linux']

        try:
            subprocess.run(
                ["npm", "run", "dist", "--", *target_flag],
                cwd=str(self.desktop_dir),
                check=True,
                shell=(self.current_platform == 'windows'),
            )
            print("  OK  desktop installer built")
            return True
        except subprocess.CalledProcessError as e:
            print(f"  ERROR desktop build failed (exit {e.returncode})")
            return False

    def print_summary(self, venv_ok, frontend_ok, desktop_ok):
        print("\n" + "=" * 70)
        print("Build Summary")
        print("=" * 70)
        print(f"  Backend venv:      {'OK' if venv_ok else 'FAILED'}")
        print(f"  Frontend build:    {'OK' if frontend_ok else 'FAILED'}")
        print(f"  Desktop installer: {'OK' if desktop_ok else 'FAILED'}")

        success = venv_ok and frontend_ok and desktop_ok
        if success:
            print("\nBuild completed successfully!")
            # List artifacts
            out_dir = self.desktop_dir / 'release'
            if out_dir.exists():
                for item in out_dir.rglob("*"):
                    if item.is_file() and item.suffix in ['.exe', '.dmg', '.AppImage', '.deb']:
                        size_mb = item.stat().st_size / (1024 * 1024)
                        print(f"  {item.relative_to(self.desktop_dir)} ({size_mb:.1f} MB)")
            print("\nNext steps:")
            print("  1. Tag release: git tag v" + self.version)
            print("  2. Push to GitHub: git push origin main --tags")
            print("  3. electron-builder publish will upload to GitHub Releases")
            return 0
        else:
            print("\nBuild FAILED — check errors above.")
            return 1

    def build_all(self):
        self.print_header()
        venv_ok = self.setup_backend_venv()
        if not venv_ok:
            print("\nERROR Cannot continue without backend venv.")
            return 1
        frontend_ok = self.build_frontend()
        desktop_ok = self.build_desktop()
        return self.print_summary(venv_ok, frontend_ok, desktop_ok)


def main():
    builder = InstallerBuilder()
    return builder.build_all()


if __name__ == "__main__":
    sys.exit(main())
