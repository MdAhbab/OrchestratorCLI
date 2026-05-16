"""
AI CLI Orchestrator - Main Entry Point
Handles server startup and browser launch for packaged application
"""

import sys
import os
import socket
import webbrowser
import json
import threading
import time
from pathlib import Path
from typing import Optional
import io

# Fix Windows console encoding for emoji support
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def get_app_dir() -> Path:
    """
    Get application directory (handles PyInstaller bundle)
    
    When running as a PyInstaller bundle, sys._MEIPASS contains
    the temporary directory where files are extracted.
    """
    if getattr(sys, 'frozen', False):
        # Running as compiled executable
        # type: ignore - _MEIPASS is added by PyInstaller at runtime
        return Path(getattr(sys, '_MEIPASS', '.'))
    # Running as script
    return Path(__file__).parent.parent.parent


def find_available_port(start_port: int = 8000, max_attempts: int = 10) -> int:
    """
    Find an available port starting from start_port
    
    Args:
        start_port: Port to start searching from
        max_attempts: Maximum number of ports to try
        
    Returns:
        Available port number
        
    Raises:
        RuntimeError: If no available ports found
    """
    for port in range(start_port, start_port + max_attempts):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind(('127.0.0.1', port))
            sock.close()
            return port
        except OSError:
            continue
    raise RuntimeError(f"No available ports found in range {start_port}-{start_port + max_attempts}")


def get_config_dir() -> Path:
    """Get or create configuration directory"""
    config_dir = Path.home() / '.orchestrator'
    config_dir.mkdir(exist_ok=True)
    return config_dir


def save_config(port: int) -> None:
    """Save configuration to file"""
    config_path = get_config_dir() / 'config.json'
    config = {
        'port': port,
        'host': '127.0.0.1',
        'auto_launch_browser': True
    }
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)


def load_config() -> Optional[dict]:
    """Load configuration from file"""
    config_path = get_config_dir() / 'config.json'
    if config_path.exists():
        with open(config_path, 'r') as f:
            return json.load(f)
    return None


def open_browser_delayed(url: str, delay: float = 2.0) -> None:
    """
    Open browser after a delay
    
    Args:
        url: URL to open
        delay: Delay in seconds before opening
    """
    time.sleep(delay)
    try:
        webbrowser.open(url)
        print(f"✓ Browser opened: {url}")
    except Exception as e:
        print(f"⚠ Could not open browser automatically: {e}")
        print(f"  Please open manually: {url}")


def setup_logging() -> None:
    """Configure logging for the application"""
    import logging
    
    log_dir = get_config_dir() / 'logs'
    log_dir.mkdir(exist_ok=True)
    
    log_file = log_dir / 'orchestrator.log'
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(sys.stdout)
        ]
    )


def main():
    """Main entry point for the application"""
    
    print("=" * 60)
    print("AI CLI Orchestrator")
    print("=" * 60)
    
    # Setup logging
    setup_logging()
    
    # Find available port
    print("\n[PORT] Finding available port...")
    try:
        port = find_available_port()
        print(f"✓ Port {port} is available")
    except RuntimeError as e:
        print(f"✗ Error: {e}")
        input("Press Enter to exit...")
        return 1
    
    # Save configuration
    save_config(port)
    print(f"✓ Configuration saved")
    
    # Get app directory
    app_dir = get_app_dir()
    print(f"✓ App directory: {app_dir}")
    
    # Import FastAPI app
    print("\n[START] Starting server...")
    try:
        # Add backend to path if needed
        backend_path = app_dir / 'backend'
        if backend_path.exists() and str(backend_path) not in sys.path:
            sys.path.insert(0, str(backend_path))
        
        # Import the FastAPI application
        from app.main import app  # type: ignore
        
        # Check for frontend files
        frontend_dir = app_dir / 'frontend' / 'dist'
        if frontend_dir.exists():
            from fastapi.staticfiles import StaticFiles
            app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
            print(f"✓ Frontend mounted from: {frontend_dir}")
        else:
            print(f"⚠ Frontend not found at: {frontend_dir}")
        
        # Start browser in background thread
        url = f'http://127.0.0.1:{port}'
        browser_thread = threading.Thread(
            target=open_browser_delayed,
            args=(url,),
            daemon=True
        )
        browser_thread.start()
        
        # Start server
        import uvicorn
        print(f"\n✓ Server starting on {url}")
        print("=" * 60)
        print("\n[INFO] Dashboard will open automatically in your browser")
        print("   If it doesn't, please open manually:")
        print(f"   {url}")
        print("\n[INFO] Press Ctrl+C to stop the server")
        print("=" * 60)
        
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=port,
            log_level="info",
            access_log=True
        )
        
    except ImportError as e:
        print(f"\n✗ Error importing application: {e}")
        print("   Please ensure all dependencies are installed")
        input("Press Enter to exit...")
        return 1
    except Exception as e:
        print(f"\n✗ Error starting server: {e}")
        import traceback
        traceback.print_exc()
        input("Press Enter to exit...")
        return 1
    
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\n✓ Server stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        input("Press Enter to exit...")
        sys.exit(1)

# Made with Bob
