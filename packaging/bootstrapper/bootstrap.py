"""
CLI Bootstrapper - Downloads and configures AI CLI tools
Handles automatic installation of AI CLI dependencies on first run
"""

import json
import subprocess
import sys
import asyncio
from pathlib import Path
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass
from datetime import datetime


@dataclass
class CLITool:
    """Represents an AI CLI tool"""
    name: str
    slug: str
    package: str
    install_command: str
    verify_command: str
    required: bool
    priority: int
    description: str
    specialties: List[str]
    rate_limits: Dict[str, int]
    installed: bool = False
    install_error: Optional[str] = None


class CLIBootstrapper:
    """Manages installation and verification of AI CLI tools"""
    
    def __init__(self, registry_path: Optional[str] = None):
        """
        Initialize the bootstrapper
        
        Args:
            registry_path: Path to CLI registry JSON file
        """
        if registry_path is None:
            self.registry_path = Path(__file__).parent / "cli_registry.json"
        else:
            self.registry_path = Path(registry_path)
        
        self.clis: List[CLITool] = []
        self.load_registry()
    
    def load_registry(self) -> None:
        """Load CLI registry from JSON file"""
        try:
            with open(self.registry_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            for cli_data in data['clis']:
                self.clis.append(CLITool(
                    name=cli_data['name'],
                    slug=cli_data['slug'],
                    package=cli_data['package'],
                    install_command=cli_data['install_command'],
                    verify_command=cli_data['verify_command'],
                    required=cli_data['required'],
                    priority=cli_data['priority'],
                    description=cli_data['description'],
                    specialties=cli_data['specialties'],
                    rate_limits=cli_data['rate_limits']
                ))
        except Exception as e:
            raise RuntimeError(f"Failed to load CLI registry: {e}")
    
    def check_node_npm(self) -> tuple[bool, Optional[str]]:
        """
        Check if Node.js and npm are installed
        
        Returns:
            Tuple of (success, version_info)
        """
        try:
            # Check Node.js
            node_result = subprocess.run(
                ['node', '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            # Check npm
            npm_result = subprocess.run(
                ['npm', '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if node_result.returncode == 0 and npm_result.returncode == 0:
                node_version = node_result.stdout.strip()
                npm_version = npm_result.stdout.strip()
                return True, f"Node.js {node_version}, npm {npm_version}"
            
            return False, None
            
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            return False, None
    
    def verify_cli(self, cli: CLITool) -> bool:
        """
        Verify if a CLI tool is installed and working
        
        Args:
            cli: CLI tool to verify
            
        Returns:
            True if installed and working, False otherwise
        """
        try:
            result = subprocess.run(
                cli.verify_command.split(),
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except Exception:
            return False
    
    async def install_cli(
        self, 
        cli: CLITool, 
        progress_callback: Optional[Callable[[str], None]] = None
    ) -> bool:
        """
        Install a single CLI tool
        
        Args:
            cli: CLI tool to install
            progress_callback: Optional callback for progress updates
            
        Returns:
            True if installation successful, False otherwise
        """
        try:
            if progress_callback:
                progress_callback(f"Installing {cli.name}...")
            
            # Run installation command
            process = await asyncio.create_subprocess_shell(
                cli.install_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                # Verify installation
                if self.verify_cli(cli):
                    cli.installed = True
                    if progress_callback:
                        progress_callback(f"✓ {cli.name} installed successfully")
                    return True
                else:
                    cli.install_error = "Installation completed but verification failed"
                    if progress_callback:
                        progress_callback(f"⚠ {cli.name} installed but verification failed")
                    return False
            else:
                error_msg = stderr.decode() if stderr else "Unknown error"
                cli.install_error = error_msg
                if progress_callback:
                    progress_callback(f"✗ Failed to install {cli.name}")
                return False
                
        except Exception as e:
            cli.install_error = str(e)
            if progress_callback:
                progress_callback(f"✗ Error installing {cli.name}: {str(e)}")
            return False
    
    async def bootstrap_all(
        self,
        progress_callback: Optional[Callable[[str], None]] = None,
        install_optional: bool = True
    ) -> Dict[str, Any]:
        """
        Bootstrap all CLI tools
        
        Args:
            progress_callback: Optional callback for progress updates
            install_optional: Whether to install optional CLIs
            
        Returns:
            Dictionary with installation results
        """
        results = {
            'success': False,
            'required_installed': 0,
            'optional_installed': 0,
            'failed': [],
            'skipped': [],
            'total_time': 0
        }
        
        start_time = datetime.now()
        
        # Check Node.js/npm
        if progress_callback:
            progress_callback("Checking Node.js and npm...")
        
        node_ok, node_info = self.check_node_npm()
        if not node_ok:
            if progress_callback:
                progress_callback("✗ Node.js and npm are required but not found")
                progress_callback("  Please install Node.js from https://nodejs.org/")
            results['failed'].append({
                'name': 'Node.js/npm',
                'error': 'Not installed'
            })
            return results
        
        if progress_callback:
            progress_callback(f"✓ {node_info}")
        
        # Sort by priority
        self.clis.sort(key=lambda x: x.priority)
        
        # Separate required and optional
        required_clis = [cli for cli in self.clis if cli.required]
        optional_clis = [cli for cli in self.clis if not cli.required]
        
        # Install required CLIs
        if progress_callback:
            progress_callback(f"\nInstalling {len(required_clis)} required CLI(s)...")
        
        for cli in required_clis:
            # Check if already installed
            if self.verify_cli(cli):
                cli.installed = True
                results['required_installed'] += 1
                if progress_callback:
                    progress_callback(f"✓ {cli.name} already installed")
                continue
            
            # Install
            success = await self.install_cli(cli, progress_callback)
            if success:
                results['required_installed'] += 1
            else:
                results['failed'].append({
                    'name': cli.name,
                    'error': cli.install_error or 'Unknown error',
                    'required': True
                })
                if progress_callback:
                    progress_callback(f"✗ Failed to install required CLI: {cli.name}")
        
        # Check if all required CLIs are installed
        if results['required_installed'] < len(required_clis):
            if progress_callback:
                progress_callback("\n✗ Not all required CLIs could be installed")
            results['success'] = False
            results['total_time'] = (datetime.now() - start_time).total_seconds()
            return results
        
        # Install optional CLIs (best effort)
        if install_optional and optional_clis:
            if progress_callback:
                progress_callback(f"\nInstalling {len(optional_clis)} optional CLI(s)...")
            
            for cli in optional_clis:
                # Check if already installed
                if self.verify_cli(cli):
                    cli.installed = True
                    results['optional_installed'] += 1
                    if progress_callback:
                        progress_callback(f"✓ {cli.name} already installed")
                    continue
                
                # Install (don't fail on errors)
                success = await self.install_cli(cli, progress_callback)
                if success:
                    results['optional_installed'] += 1
                else:
                    results['skipped'].append({
                        'name': cli.name,
                        'error': cli.install_error or 'Installation failed',
                        'required': False
                    })
        
        results['success'] = True
        results['total_time'] = (datetime.now() - start_time).total_seconds()
        
        return results
    
    def get_installation_summary(self) -> Dict:
        """
        Get summary of installed CLIs
        
        Returns:
            Dictionary with installation summary
        """
        return {
            'total': len(self.clis),
            'installed': sum(1 for cli in self.clis if cli.installed),
            'required_installed': sum(
                1 for cli in self.clis if cli.required and cli.installed
            ),
            'optional_installed': sum(
                1 for cli in self.clis if not cli.required and cli.installed
            ),
            'failed': [
                {
                    'name': cli.name,
                    'slug': cli.slug,
                    'error': cli.install_error,
                    'required': cli.required
                }
                for cli in self.clis if not cli.installed and cli.install_error
            ],
            'clis': [
                {
                    'name': cli.name,
                    'slug': cli.slug,
                    'installed': cli.installed,
                    'required': cli.required,
                    'description': cli.description,
                    'specialties': cli.specialties
                }
                for cli in self.clis
            ]
        }
    
    def save_config(self, output_path: Optional[Path] = None) -> None:
        """
        Save installed CLI configuration
        
        Args:
            output_path: Path to save configuration (default: ~/.orchestrator/clis.json)
        """
        if output_path is None:
            output_path = Path.home() / '.orchestrator' / 'clis.json'
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        config = {
            'last_updated': datetime.now().isoformat(),
            'clis': [
                {
                    'name': cli.name,
                    'slug': cli.slug,
                    'installed': cli.installed,
                    'required': cli.required,
                    'specialties': cli.specialties,
                    'rate_limits': cli.rate_limits
                }
                for cli in self.clis
            ]
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)


async def main():
    """Main entry point for CLI bootstrapper"""
    
    def progress(msg: str):
        """Print progress message"""
        print(msg)
    
    print("=" * 60)
    print("AI CLI Orchestrator - Bootstrapper")
    print("=" * 60)
    print()
    
    # Create bootstrapper
    bootstrapper = CLIBootstrapper()
    
    # Run bootstrap
    results = await bootstrapper.bootstrap_all(progress)
    
    # Print summary
    print()
    print("=" * 60)
    print("Installation Summary")
    print("=" * 60)
    
    summary = bootstrapper.get_installation_summary()
    
    print(f"\nTotal CLIs: {summary['total']}")
    print(f"Installed: {summary['installed']}")
    print(f"  Required: {summary['required_installed']}")
    print(f"  Optional: {summary['optional_installed']}")
    
    if summary['failed']:
        print(f"\nFailed installations:")
        for failed in summary['failed']:
            print(f"  ✗ {failed['name']}: {failed['error']}")
    
    print(f"\nTotal time: {results['total_time']:.1f} seconds")
    
    # Save configuration
    bootstrapper.save_config()
    print(f"\n✓ Configuration saved to ~/.orchestrator/clis.json")
    
    if results['success']:
        print("\n✅ Bootstrap completed successfully!")
        return 0
    else:
        print("\n✗ Bootstrap failed - not all required CLIs installed")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

# Made with Bob
