"""
Build script for packaging the backend with PyInstaller
"""

import sys
import subprocess
import shutil
from pathlib import Path
import io

# Fix Windows console encoding for emoji support
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


class BackendBuilder:
    def __init__(self):
        self.script_dir = Path(__file__).parent
        self.project_root = self.script_dir.parent.parent
        self.backend_dir = self.project_root / 'backend'
        self.frontend_dist = self.project_root / 'frontend' / 'dist'
        self.dist_dir = self.script_dir / 'dist'
        self.build_dir = self.script_dir / 'build'
        
    def clean(self):
        """Clean previous build artifacts"""
        print("[CLEAN] Cleaning previous builds...")
        
        if self.dist_dir.exists():
            shutil.rmtree(self.dist_dir)
            print("  [OK] Removed dist/")
            
        if self.build_dir.exists():
            shutil.rmtree(self.build_dir)
            print("  [OK] Removed build/")
    
    def check_prerequisites(self):
        """Check if all prerequisites are met"""
        print("\n[CHECK] Checking prerequisites...")
        
        # Check if backend exists
        if not self.backend_dir.exists():
            print(f"  ✗ Backend directory not found: {self.backend_dir}")
            return False
        print(f"  ✓ Backend found: {self.backend_dir}")
        
        # Check if backend has app module
        app_dir = self.backend_dir / 'app'
        if not app_dir.exists():
            print(f"  ✗ Backend app module not found: {app_dir}")
            return False
        print(f"  ✓ Backend app module found")
        
        # Check if PyInstaller is installed
        try:
            result = subprocess.run(
                [sys.executable, '-m', 'PyInstaller', '--version'],
                capture_output=True,
                text=True,
                check=True
            )
            version = result.stdout.strip()
            print(f"  ✓ PyInstaller {version} installed")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("  ✗ PyInstaller not installed")
            print("    Install with: pip install pyinstaller")
            return False
        
        # Check frontend (warning only)
        if not self.frontend_dist.exists():
            print(f"  ⚠ Frontend dist not found: {self.frontend_dist}")
            print("    Build frontend first with: cd frontend && npm run build")
            print("    Continuing without frontend...")
        else:
            print(f"  ✓ Frontend dist found")
        
        return True
    
    def build(self):
        """Build the backend executable"""
        print("\n[BUILD] Building backend executable...")
        
        spec_file = self.script_dir / 'pyinstaller.spec'
        
        try:
            # Run PyInstaller
            cmd = [
                sys.executable,
                '-m', 'PyInstaller',
                '--clean',
                '--noconfirm',
                str(spec_file)
            ]
            
            print(f"  Running: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                cwd=str(self.script_dir),
                check=True,
                capture_output=False
            )
            
            print("  ✓ Build completed successfully")
            return True
            
        except subprocess.CalledProcessError as e:
            print(f"  ✗ Build failed with exit code {e.returncode}")
            return False
    
    def verify_build(self):
        """Verify the build output"""
        print("\n✅ Verifying build...")
        
        if sys.platform == 'win32':
            exe_name = 'orchestrator-backend.exe'
        elif sys.platform == 'darwin':
            exe_name = 'Orchestrator.app'
        else:
            exe_name = 'orchestrator-backend'
        
        exe_path = self.dist_dir / exe_name
        
        if not exe_path.exists():
            print(f"  ✗ Executable not found: {exe_path}")
            return False
        
        # Get file size
        if exe_path.is_file():
            size_mb = exe_path.stat().st_size / (1024 * 1024)
            print(f"  ✓ Executable created: {exe_path}")
            print(f"  ✓ Size: {size_mb:.1f} MB")
        else:
            print(f"  ✓ App bundle created: {exe_path}")
        
        return True
    
    def run(self):
        """Run the complete build process"""
        print("=" * 60)
        print("AI CLI Orchestrator - Backend Builder")
        print("=" * 60)
        
        # Clean
        self.clean()
        
        # Check prerequisites
        if not self.check_prerequisites():
            print("\n✗ Prerequisites check failed")
            return 1
        
        # Build
        if not self.build():
            print("\n✗ Build failed")
            return 1
        
        # Verify
        if not self.verify_build():
            print("\n✗ Build verification failed")
            return 1
        
        print("\n" + "=" * 60)
        print("✅ Backend build completed successfully!")
        print("=" * 60)
        print(f"\nExecutable location: {self.dist_dir}")
        print("\nNext steps:")
        print("  1. Test the executable")
        print("  2. Build platform installer (Windows/macOS)")
        print("  3. Test the complete installer")
        
        return 0


def main():
    builder = BackendBuilder()
    return builder.run()


if __name__ == '__main__':
    sys.exit(main())

# Made with Bob
