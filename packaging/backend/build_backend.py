"""
Backend venv setup script for AI CLI Orchestrator.
Creates backend/venv and installs requirements.txt.
No PyInstaller — Python source is bundled via electron-builder extraResources.
"""

import sys
import subprocess
import shutil
from pathlib import Path
import io

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


class VenvBuilder:
    def __init__(self):
        # packaging/backend -> project_root
        self.script_dir = Path(__file__).parent.resolve()
        self.project_root = self.script_dir.parents[1]
        self.backend_dir = self.project_root / 'backend'
        self.venv_dir = self.backend_dir / 'venv'
        self.req_file = self.backend_dir / 'requirements.txt'

    def _venv_python(self) -> Path:
        if sys.platform == 'win32':
            return self.venv_dir / 'Scripts' / 'python.exe'
        return self.venv_dir / 'bin' / 'python'

    def check_prerequisites(self) -> bool:
        print("[CHECK] Checking prerequisites...")
        v = sys.version_info
        print(f"  Python {v.major}.{v.minor}.{v.micro}")
        if v < (3, 8):
            print("  ERROR Python 3.8+ is required")
            return False
        if not self.backend_dir.exists():
            print(f"  ERROR backend directory not found: {self.backend_dir}")
            return False
        if not self.req_file.exists():
            print(f"  ERROR requirements.txt not found: {self.req_file}")
            return False
        print(f"  OK  backend at {self.backend_dir}")
        return True

    def create_venv(self) -> bool:
        print(f"\n[VENV] Creating virtual environment at {self.venv_dir} ...")
        if self.venv_dir.exists():
            print("  Removing existing venv...")
            shutil.rmtree(self.venv_dir)
        try:
            subprocess.run(
                [sys.executable, '-m', 'venv', str(self.venv_dir)],
                check=True
            )
            print("  OK  venv created")
            return True
        except subprocess.CalledProcessError as e:
            print(f"  ERROR venv creation failed (exit {e.returncode})")
            return False

    def install_requirements(self) -> bool:
        print(f"\n[PIP] Installing requirements from {self.req_file} ...")
        python = self._venv_python()
        if not python.exists():
            print(f"  ERROR venv python not found: {python}")
            return False
        try:
            # Upgrade pip first
            subprocess.run(
                [str(python), '-m', 'pip', 'install', '--upgrade', 'pip'],
                check=True,
                capture_output=True,
            )
            # Install requirements
            subprocess.run(
                [str(python), '-m', 'pip', 'install', '-r', str(self.req_file)],
                check=True,
            )
            print("  OK  requirements installed")
            return True
        except subprocess.CalledProcessError as e:
            print(f"  ERROR pip install failed (exit {e.returncode})")
            return False

    def run(self) -> int:
        print("=" * 60)
        print("AI CLI Orchestrator — Backend Venv Builder")
        print("=" * 60)

        if not self.check_prerequisites():
            return 1
        if not self.create_venv():
            return 1
        if not self.install_requirements():
            return 1

        print("\n" + "=" * 60)
        print("Backend venv ready.")
        print(f"Python: {self._venv_python()}")
        print("=" * 60)
        return 0


def main():
    builder = VenvBuilder()
    return builder.run()


if __name__ == '__main__':
    sys.exit(main())
