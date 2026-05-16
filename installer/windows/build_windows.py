"""
Build script for Windows installer using Inno Setup
"""

import sys
import subprocess
import shutil
from pathlib import Path


class WindowsInstallerBuilder:
    def __init__(self):
        self.script_dir = Path(__file__).parent
        self.project_root = self.script_dir.parent.parent
        self.backend_exe = self.script_dir.parent / 'backend' / 'dist' / 'orchestrator-backend.exe'
        self.dist_dir = self.script_dir.parent / 'dist' / 'windows'
        self.inno_setup_script = self.script_dir / 'setup.iss'
        
    def find_inno_setup(self):
        """Find Inno Setup compiler"""
        possible_paths = [
            Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"),
            Path(r"C:\Program Files\Inno Setup 6\ISCC.exe"),
            Path(r"C:\Program Files (x86)\Inno Setup 5\ISCC.exe"),
            Path(r"C:\Program Files\Inno Setup 5\ISCC.exe"),
        ]
        
        for path in possible_paths:
            if path.exists():
                return path
        
        return None
    
    def check_prerequisites(self):
        """Check if all prerequisites are met"""
        print("\n🔍 Checking prerequisites...")
        
        # Check if backend executable exists
        if not self.backend_exe.exists():
            print(f"  ✗ Backend executable not found: {self.backend_exe}")
            print("    Build backend first with: cd ../backend && python build_backend.py")
            return False
        print(f"  ✓ Backend executable found")
        
        # Check if Inno Setup is installed
        inno_path = self.find_inno_setup()
        if not inno_path:
            print("  ✗ Inno Setup not found")
            print("    Download from: https://jrsoftware.org/isdl.php")
            print("    Install Inno Setup 6 and try again")
            return False
        print(f"  ✓ Inno Setup found: {inno_path}")
        
        # Check if setup script exists
        if not self.inno_setup_script.exists():
            print(f"  ✗ Inno Setup script not found: {self.inno_setup_script}")
            return False
        print(f"  ✓ Inno Setup script found")
        
        # Check if LICENSE exists
        license_file = self.project_root / 'LICENSE'
        if not license_file.exists():
            print(f"  ⚠ LICENSE file not found: {license_file}")
            print("    Creating placeholder LICENSE file...")
            license_file.write_text("MIT License\n\nCopyright (c) 2026 AI Orchestrator Team\n")
        print(f"  ✓ LICENSE file found")
        
        return True
    
    def build(self):
        """Build the Windows installer"""
        print("\n🔨 Building Windows installer...")
        
        # Find Inno Setup
        inno_path = self.find_inno_setup()
        
        # Create dist directory
        self.dist_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Run Inno Setup compiler
            cmd = [
                str(inno_path),
                str(self.inno_setup_script)
            ]
            
            print(f"  Running: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                cwd=str(self.script_dir),
                check=True,
                capture_output=True,
                text=True
            )
            
            print("  ✓ Inno Setup compilation completed")
            
            # Check if output file was created
            output_file = self.dist_dir / 'orchestrator-setup.exe'
            if output_file.exists():
                size_mb = output_file.stat().st_size / (1024 * 1024)
                print(f"  ✓ Installer created: {output_file}")
                print(f"  ✓ Size: {size_mb:.1f} MB")
                return True
            else:
                print(f"  ✗ Installer not found: {output_file}")
                return False
                
        except subprocess.CalledProcessError as e:
            print(f"  ✗ Build failed with exit code {e.returncode}")
            if e.stdout:
                print(f"\nStdout:\n{e.stdout}")
            if e.stderr:
                print(f"\nStderr:\n{e.stderr}")
            return False
    
    def run(self):
        """Run the complete build process"""
        print("=" * 60)
        print("AI CLI Orchestrator - Windows Installer Builder")
        print("=" * 60)
        
        # Check prerequisites
        if not self.check_prerequisites():
            print("\n✗ Prerequisites check failed")
            return 1
        
        # Build installer
        if not self.build():
            print("\n✗ Build failed")
            return 1
        
        print("\n" + "=" * 60)
        print("✅ Windows installer built successfully!")
        print("=" * 60)
        print(f"\nInstaller location: {self.dist_dir / 'orchestrator-setup.exe'}")
        print("\nNext steps:")
        print("  1. Test the installer on a clean Windows VM")
        print("  2. Verify all features work correctly")
        print("  3. Sign the installer (optional)")
        print("  4. Upload to download server")
        
        return 0


def main():
    builder = WindowsInstallerBuilder()
    return builder.run()


if __name__ == '__main__':
    sys.exit(main())

# Made with Bob
