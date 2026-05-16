"""
Main build orchestration script for AI CLI Orchestrator
Builds installers for all platforms
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
        self.version = self.load_version()
        self.build_timestamp = datetime.now().isoformat()
        self.current_platform = platform.system().lower()
    
    def load_version(self):
        """Load version from version.json"""
        version_file = self.root_dir / "version.json"
        with open(version_file, 'r') as f:
            return json.load(f)['version']
    
    def print_header(self):
        """Print build header"""
        print("=" * 70)
        print(f"AI CLI Orchestrator - Installer Builder v{self.version}")
        print("=" * 70)
        print(f"Platform: {self.current_platform}")
        print(f"Build time: {self.build_timestamp}")
        print("=" * 70)
    
    def build_backend(self):
        """Build backend with PyInstaller"""
        print("\n[BUILD] Step 1: Building Backend")
        print("-" * 70)
        
        backend_dir = self.root_dir / "backend"
        build_script = backend_dir / "build_backend.py"
        
        if not build_script.exists():
            print(f"❌ Build script not found: {build_script}")
            return False
        
        try:
            result = subprocess.run(
                [sys.executable, str(build_script)],
                cwd=str(backend_dir),
                check=True
            )
            print("✅ Backend built successfully")
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ Backend build failed with exit code {e.returncode}")
            return False
    
    def build_windows(self):
        """Build Windows installer"""
        print("\n🪟 Step 2: Building Windows Installer")
        print("-" * 70)
        
        if self.current_platform != "windows":
            print("⚠️  Skipping Windows build (not on Windows)")
            return True
        
        windows_dir = self.root_dir / "windows"
        build_script = windows_dir / "build_windows.py"
        
        if not build_script.exists():
            print(f"❌ Build script not found: {build_script}")
            return False
        
        try:
            result = subprocess.run(
                [sys.executable, str(build_script)],
                cwd=str(windows_dir),
                check=True
            )
            print("✅ Windows installer built successfully")
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ Windows build failed with exit code {e.returncode}")
            return False
    
    def build_macos(self):
        """Build macOS installer"""
        print("\n🍎 Step 3: Building macOS Installer")
        print("-" * 70)
        
        if self.current_platform != "darwin":
            print("⚠️  Skipping macOS build (not on macOS)")
            return True
        
        macos_dir = self.root_dir / "macos"
        build_script = macos_dir / "create_dmg.sh"
        
        if not build_script.exists():
            print(f"❌ Build script not found: {build_script}")
            return False
        
        # Make script executable
        build_script.chmod(0o755)
        
        try:
            result = subprocess.run(
                ["bash", str(build_script)],
                cwd=str(macos_dir),
                check=True
            )
            print("✅ macOS installer built successfully")
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ macOS build failed with exit code {e.returncode}")
            return False
    
    def print_summary(self, backend_ok, windows_ok, macos_ok):
        """Print build summary"""
        print("\n" + "=" * 70)
        print("📊 Build Summary")
        print("=" * 70)
        
        print(f"\n✅ Backend: {'Success' if backend_ok else 'Failed'}")
        
        if self.current_platform == "windows":
            print(f"✅ Windows Installer: {'Success' if windows_ok else 'Failed'}")
        else:
            print(f"⚠️  Windows Installer: Skipped (not on Windows)")
        
        if self.current_platform == "darwin":
            print(f"✅ macOS Installer: {'Success' if macos_ok else 'Failed'}")
        else:
            print(f"⚠️  macOS Installer: Skipped (not on macOS)")
        
        print("\n" + "=" * 70)
        
        if backend_ok and (windows_ok or macos_ok):
            print("✅ Build completed successfully!")
            print("=" * 70)
            print("\n📦 Build Artifacts:")
            
            dist_dir = self.root_dir / "dist"
            if dist_dir.exists():
                for item in dist_dir.rglob("*"):
                    if item.is_file() and item.suffix in ['.exe', '.dmg', '.app']:
                        size_mb = item.stat().st_size / (1024 * 1024)
                        print(f"  • {item.relative_to(self.root_dir)} ({size_mb:.1f} MB)")
            
            print("\n🚀 Next Steps:")
            print("  1. Test installers on clean VMs")
            print("  2. Sign installers (if applicable)")
            print("  3. Upload to download server")
            print("  4. Update downloader page with links")
            print("  5. Announce release!")
            
            return 0
        else:
            print("❌ Build failed!")
            print("=" * 70)
            print("\nCheck the error messages above for details.")
            return 1
    
    def build_all(self):
        """Build all components"""
        self.print_header()
        
        # Build backend
        backend_ok = self.build_backend()
        if not backend_ok:
            print("\n❌ Backend build failed. Cannot continue.")
            return 1
        
        # Build platform installers
        windows_ok = self.build_windows()
        macos_ok = self.build_macos()
        
        # Print summary
        return self.print_summary(backend_ok, windows_ok, macos_ok)


def main():
    """Main entry point"""
    builder = InstallerBuilder()
    return builder.build_all()


if __name__ == "__main__":
    sys.exit(main())

# Made with Bob
