#!/usr/bin/env python3
"""
AI Orchestrator - Main Entry Point
Unified script to run backend and frontend servers with comprehensive management.
Includes automatic virtual environment and dependency management.
"""

import argparse
import sys
import os
import signal
import subprocess
import time
import platform
import shutil
import queue
import threading
from pathlib import Path
from typing import Optional, List, Tuple

# Color codes for terminal output
class Colors:
    """ANSI color codes for terminal output."""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

    @staticmethod
    def disable():
        """Disable colors on Windows if not supported."""
        if platform.system() == 'Windows':
            # Enable ANSI colors on Windows 10+
            try:
                import ctypes
                kernel32 = ctypes.windll.kernel32
                kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
            except:
                # Fallback: disable colors
                Colors.HEADER = ''
                Colors.OKBLUE = ''
                Colors.OKCYAN = ''
                Colors.OKGREEN = ''
                Colors.WARNING = ''
                Colors.FAIL = ''
                Colors.ENDC = ''
                Colors.BOLD = ''
                Colors.UNDERLINE = ''


# Initialize colors
Colors.disable()




def print_info(message: str):
    """Print info message."""
    print(f"{Colors.OKBLUE}[INFO]{Colors.ENDC} {message}")


def print_success(message: str):
    """Print success message."""
    print(f"{Colors.OKGREEN}[ OK ]{Colors.ENDC} {message}")


def print_warning(message: str):
    """Print warning message."""
    print(f"{Colors.WARNING}[WARN]{Colors.ENDC} {message}")


def print_error(message: str):
    """Print error message."""
    print(f"{Colors.FAIL}[FAIL]{Colors.ENDC} {message}")


def print_section(title: str):
    """Print section header."""
    print(f"\n{Colors.BOLD}{Colors.OKCYAN}{title}{Colors.ENDC}")
    print(f"{Colors.OKCYAN}{'-' * len(title)}{Colors.ENDC}")


class ProcessManager:
    """Manages backend and frontend processes."""
    
    def __init__(self, skip_install: bool = False, recreate_venv: bool = False, clean_install: bool = False):
        self.backend_process: Optional[subprocess.Popen] = None
        self.frontend_process: Optional[subprocess.Popen] = None
        self.project_root = Path(__file__).parent
        self.backend_dir = self.project_root / "backend"
        self.frontend_dir = self.project_root / "frontend"
        self.venv_dir = self.backend_dir / "venv"
        self.skip_install = skip_install
        self.recreate_venv = recreate_venv
        self.clean_install = clean_install
        self.backend_port = None  # Store the actual port being used
        self.output_queue: "queue.Queue[Tuple[str, str]]" = queue.Queue()
        self._output_readers_started = False
        
        # Determine venv paths based on platform
        if platform.system() == "Windows":
            self.venv_python = self.venv_dir / "Scripts" / "python.exe"
            self.venv_pip = self.venv_dir / "Scripts" / "pip.exe"
        else:
            self.venv_python = self.venv_dir / "bin" / "python"
            self.venv_pip = self.venv_dir / "bin" / "pip"

    def _start_output_reader(self, label: str, pipe) -> None:
        """Continuously drain a subprocess pipe without blocking the monitor loop."""
        if pipe is None:
            return

        def reader() -> None:
            try:
                for line in iter(pipe.readline, ""):
                    if not line:
                        break
                    self.output_queue.put((label, line.rstrip()))
            except Exception as e:
                self.output_queue.put((label, f"[output reader stopped: {e}]"))

        thread = threading.Thread(
            target=reader,
            name=f"{label.lower()}-output-reader",
            daemon=True,
        )
        thread.start()

    def _start_output_readers(self) -> None:
        """Start stdout drainers for child processes once both have launched."""
        if self._output_readers_started:
            return
        if self.backend_process and self.backend_process.stdout:
            self._start_output_reader("Backend", self.backend_process.stdout)
        if self.frontend_process and self.frontend_process.stdout:
            self._start_output_reader("Frontend", self.frontend_process.stdout)
        self._output_readers_started = True
    
    def find_available_port(self, start_port: int = 8000, max_attempts: int = 10) -> Optional[int]:
        """Find an available port starting from start_port.
        
        Args:
            start_port: The port to start searching from
            max_attempts: Maximum number of ports to try
            
        Returns:
            An available port number, or None if no port is available
        """
        import socket
        for port in range(start_port, start_port + max_attempts):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(('0.0.0.0', port))
                    return port
            except OSError:
                continue
        return None

    def wait_for_backend_health(
        self,
        host: str,
        port: int,
        timeout: int = 20,
    ) -> bool:
        """Wait until the backend responds to /health."""
        import urllib.error
        import urllib.request

        health_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
        health_url = f"http://{health_host}:{port}/health"
        deadline = time.time() + timeout
        last_error = ""

        while time.time() < deadline:
            if self.backend_process and self.backend_process.poll() is not None:
                print_error("Backend process exited before health check passed")
                return False
            try:
                with urllib.request.urlopen(health_url, timeout=2) as response:
                    if response.status == 200:
                        print_success(f"Backend health check passed: {health_url}")
                        return True
                    last_error = f"HTTP {response.status}"
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                last_error = str(e)
            time.sleep(0.25)

        print_error(f"Backend did not become healthy at {health_url}: {last_error}")
        return False
        
    def check_python_version(self) -> bool:
        """Check if Python version meets requirements."""
        required_version = (3, 8)
        current_version = sys.version_info[:2]
        
        if current_version < required_version:
            print_error(
                f"Python {required_version[0]}.{required_version[1]}+ required, "
                f"but {current_version[0]}.{current_version[1]} found"
            )
            return False
        
        print_success(f"Python {current_version[0]}.{current_version[1]} detected")
        return True
    
    def check_venv_exists(self) -> bool:
        """Check if virtual environment exists."""
        return self.venv_dir.exists() and self.venv_python.exists()
    
    def create_venv(self) -> bool:
        """Create a virtual environment for the backend."""
        try:
            print_info("Creating virtual environment...")
            
            # Remove existing venv if recreate flag is set
            if self.venv_dir.exists():
                if self.recreate_venv or self.clean_install:
                    print_info("Removing existing virtual environment...")
                    shutil.rmtree(self.venv_dir)
                else:
                    print_success("Virtual environment already exists")
                    return True
            
            # Create new venv
            result = subprocess.run(
                [sys.executable, "-m", "venv", str(self.venv_dir)],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                print_success(f"Virtual environment created at {self.venv_dir}")
                return True
            else:
                print_error(f"Failed to create virtual environment: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            print_error("Virtual environment creation timed out")
            return False
        except Exception as e:
            print_error(f"Error creating virtual environment: {e}")
            return False
    
    def install_backend_dependencies(self) -> bool:
        """Install backend dependencies from requirements.txt using venv pip."""
        try:
            print_info("Installing backend dependencies in virtual environment...")
            requirements_file = self.backend_dir / "requirements.txt"
            
            if not requirements_file.exists():
                print_error(f"Requirements file not found: {requirements_file}")
                return False
            
            if not self.venv_pip.exists():
                print_error(f"Virtual environment pip not found at {self.venv_pip}")
                return False
            
            # Upgrade pip first
            print_info("Upgrading pip...")
            subprocess.run(
                [str(self.venv_python), "-m", "pip", "install", "--upgrade", "pip"],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            # Run pip install with progress output
            print_info("Installing packages (this may take a few minutes)...")
            result = subprocess.run(
                [str(self.venv_pip), "install", "-r", str(requirements_file)],
                capture_output=False,  # Show output in real-time
                text=True,
                timeout=600  # 10 minute timeout
            )
            
            if result.returncode == 0:
                print_success("Backend dependencies installed successfully")
                return True
            else:
                print_error("Failed to install backend dependencies")
                return False
                
        except subprocess.TimeoutExpired:
            print_error("Installation timed out")
            return False
        except Exception as e:
            print_error(f"Error installing dependencies: {e}")
            return False
    
    def check_backend_dependencies(self) -> bool:
        """Check if backend dependencies are installed in venv."""
        if not self.check_venv_exists():
            print_warning("Virtual environment not found")
            
            if not self.skip_install:
                print_info("Creating virtual environment...")
                if not self.create_venv():
                    return False
                
                print_info("Installing dependencies...")
                if not self.install_backend_dependencies():
                    return False
                
                print_success("Virtual environment setup complete")
                return True
            else:
                print_info("Skipping automatic setup (--skip-install flag set)")
                print_info("Create venv manually with:")
                print(f"  python -m venv backend/venv")
                print(f"  backend/venv/Scripts/pip install -r backend/requirements.txt  # Windows")
                print(f"  backend/venv/bin/pip install -r backend/requirements.txt      # Unix")
                return False
        
        # Check if dependencies are installed in venv
        try:
            result = subprocess.run(
                [str(self.venv_python), "-c", "import fastapi, uvicorn, aiosqlite, pydantic"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                print_success("Backend virtual environment ready")
                return True
            else:
                print_warning("Some dependencies missing in virtual environment")
                
                if not self.skip_install:
                    print_info("Installing missing dependencies...")
                    if self.install_backend_dependencies():
                        print_success("Dependencies installed successfully")
                        return True
                    else:
                        return False
                else:
                    print_info("Install them with:")
                    print(f"  {self.venv_pip} install -r backend/requirements.txt")
                    return False
                    
        except Exception as e:
            print_error(f"Error checking dependencies: {e}")
            return False
    
    def install_frontend_dependencies(self) -> bool:
        """Install frontend dependencies using npm."""
        try:
            print_info("Installing frontend dependencies...")
            print_info("This may take a few minutes...")
            
            # Determine npm command based on OS
            is_windows = platform.system() == "Windows"
            npm_cmd = "npm.cmd" if is_windows else "npm"
            
            # Run npm install
            result = subprocess.run(
                [npm_cmd, "install"],
                cwd=self.frontend_dir,
                capture_output=False,  # Show output in real-time
                text=True,
                shell=is_windows,
                timeout=600  # 10 minute timeout
            )
            
            if result.returncode == 0:
                print_success("Frontend dependencies installed successfully")
                return True
            else:
                print_error("Failed to install frontend dependencies")
                return False
                
        except subprocess.TimeoutExpired:
            print_error("Installation timed out")
            return False
        except Exception as e:
            print_error(f"Error installing frontend dependencies: {e}")
            return False
    
    def check_frontend_dependencies(self) -> bool:
        """Check if frontend dependencies are installed."""
        node_modules = self.frontend_dir / "node_modules"
        
        # Remove node_modules if clean install requested
        if self.clean_install and node_modules.exists():
            print_info("Removing existing node_modules...")
            shutil.rmtree(node_modules)
        
        if not node_modules.exists():
            print_warning("Frontend dependencies not installed")
            
            if not self.skip_install:
                print_info("Installing frontend dependencies automatically...")
                if self.install_frontend_dependencies():
                    print_success("Frontend dependencies ready")
                    return True
                else:
                    print_error("Automatic installation failed")
                    print_info("Install them manually with:")
                    print(f"  cd frontend && npm install")
                    return False
            else:
                print_info("Skipping automatic installation (--skip-install flag set)")
                print_info("Install them with:")
                print(f"  cd frontend && npm install")
                return False
        
        print_success("Frontend dependencies installed")
        return True
    
    def check_node_installed(self) -> bool:
        """Check if Node.js is installed."""
        try:
            result = subprocess.run(
                ["node", "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                version = result.stdout.strip()
                print_success(f"Node.js {version} detected")
                return True
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
        
        print_error("Node.js not found")
        print_info("Install Node.js from: https://nodejs.org/")
        return False
    
    def validate_directories(self) -> bool:
        """Validate that required directories exist."""
        if not self.backend_dir.exists():
            print_error(f"Backend directory not found: {self.backend_dir}")
            return False
        
        if not self.frontend_dir.exists():
            print_error(f"Frontend directory not found: {self.frontend_dir}")
            return False
        
        print_success("Project directories validated")
        return True
    
    def create_necessary_directories(self):
        """Create necessary directories if missing."""
        directories = [
            self.project_root / "data",
            self.project_root / "uploads",
            self.project_root / "uploads" / "context",
            self.project_root / "uploads" / "artifacts",
            self.project_root / "runtime",
            self.project_root / "runtime" / "cache",
            self.project_root / "runtime" / "tmp",
            self.project_root / "shared" / "sessions",
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
        
        print_success("Necessary directories created")
    
    def check_environment_variables(self) -> bool:
        """Check for required environment variables."""
        env_file = self.backend_dir / ".env"
        
        if not env_file.exists():
            print_warning(f"No .env file found at {env_file}")
            print_info("Using default configuration")
            print_info("Copy .env.example to .env and configure as needed")
        else:
            print_success(f"Environment file found: {env_file}")
        
        return True
    
    def initialize_database(self, force: bool = False) -> bool:
        """Initialize the database using venv python."""
        try:
            print_info("Initializing database...")
            
            # Use venv python to run database initialization
            init_script = self.backend_dir / "database" / "init_db.py"
            
            if not init_script.exists():
                print_error(f"Database init script not found: {init_script}")
                return False

            db_path = self._resolve_database_path_for_init()
            print_info(f"Using database path: {db_path}")

            init_cmd = [str(self.venv_python), str(init_script), "--db-path", db_path]
            if force:
                init_cmd.append("--force")
             
            # Run initialization script with venv python
            init_env = os.environ.copy()
            p = Path(db_path)
            abs_db = (self.project_root / p).resolve() if not p.is_absolute() else p.resolve()
            init_env["DATABASE_PATH"] = str(abs_db)
            init_env["DATABASE_URL"] = "sqlite+aiosqlite:///" + str(abs_db).replace("\\", "/")

            result = subprocess.run(
                init_cmd,
                cwd=self.project_root,
                env=init_env,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                print_success("Database initialized successfully")
                return True
            else:
                print_error(f"Database initialization failed: {result.stderr}")
                return False
            
        except subprocess.TimeoutExpired:
            print_error("Database initialization timed out")
            return False
        except Exception as e:
            print_error(f"Database initialization failed: {e}")
            return False

    def _resolve_database_path_for_init(self) -> str:
        """Resolve DB path used by init script from env values or defaults."""
        # Explicit environment variable wins.
        env_database_path = os.environ.get("DATABASE_PATH")
        if env_database_path:
            return env_database_path.strip().strip('"').strip("'")

        env_database_url = os.environ.get("DATABASE_URL")
        if env_database_url:
            parsed_from_env = self._parse_sqlite_path_from_url(env_database_url)
            if parsed_from_env:
                return parsed_from_env

        backend_env = self.backend_dir / ".env"
        if backend_env.exists():
            try:
                file_database_path = None
                file_database_url = None
                with open(backend_env, "r", encoding="utf-8") as f:
                    for raw_line in f:
                        line = raw_line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        key, value = line.split("=", 1)
                        normalized_key = key.strip().upper()
                        normalized_value = value.strip().strip('"').strip("'")
                        if normalized_key == "DATABASE_PATH":
                            file_database_path = normalized_value
                        elif normalized_key == "DATABASE_URL":
                            file_database_url = normalized_value

                if file_database_path:
                    return file_database_path
                if file_database_url:
                    parsed_from_file = self._parse_sqlite_path_from_url(file_database_url)
                    if parsed_from_file:
                        return parsed_from_file
            except Exception:
                pass

        return "storage/data/orchestrator.db"

    @staticmethod
    def _parse_sqlite_path_from_url(database_url: str) -> Optional[str]:
        """Extract a path from sqlite URL values used in backend config."""
        for prefix in ("sqlite+aiosqlite:///", "sqlite:///"):
            if database_url.startswith(prefix):
                candidate = database_url[len(prefix):]
                if candidate and candidate != ":memory:":
                    return candidate
        return None
    
    def start_backend(
        self,
        host: str = "0.0.0.0",
        port: int = 8000,
        reload: bool = True
    ) -> bool:
        """Start the backend server."""
        try:
            # Find an available port
            available_port = self.find_available_port(start_port=port, max_attempts=10)
            
            if available_port is None:
                print_error(f"No available ports found in range {port}-{port+9}")
                print_error("Please free up some ports or specify a different port range")
                return False
            
            # Store the actual port being used
            self.backend_port = available_port
            
            # Inform user if we had to use a different port
            if available_port != port:
                print_info(f"Port {port} is in use, trying port {available_port}...")
            
            print_info(f"Starting backend server on {host}:{available_port}...")
            print_success(f"Using backend port: {available_port}")
            print_success(f"Using virtual environment: {self.venv_dir}")

            backend_env = os.environ.copy()
            db_path = self._resolve_database_path_for_init()
            p = Path(db_path)
            db_abs = (self.project_root / p).resolve() if not p.is_absolute() else p.resolve()
            backend_env["DATABASE_PATH"] = str(db_abs)
            backend_env["DATABASE_URL"] = (
                "sqlite+aiosqlite:///" + str(db_abs).replace("\\", "/")
            )
            
            # Sanitize DEBUG in the environment passed to the backend. Some
            # shells/tools set DEBUG=release, which Pydantic cannot parse as a
            # boolean and causes the Uvicorn child process to crash on import.
            debug_value = backend_env.get("DEBUG", "").strip().lower()
            if debug_value and debug_value not in {"true", "false", "1", "0"}:
                backend_env.pop("DEBUG", None)
                print_info("Removed conflicting DEBUG environment variable")
            
            # Prepare command using venv python
            cmd = [
                str(self.venv_python),
                "-m", "uvicorn",
                "backend.main:app",
                "--host", host,
                "--port", str(available_port),
            ]
            
            if reload:
                cmd.append("--reload")
            
            # Start backend process with merged stdout and stderr
            self.backend_process = subprocess.Popen(
                cmd,
                cwd=self.project_root,
                env=backend_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # Merge stderr into stdout
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            
            # Start backend output reader early so we don't block
            self._start_output_reader("Backend", self.backend_process.stdout)
            
            print_info("Waiting for backend to start (timeout: 10 seconds)...")
            
            if not self.wait_for_backend_health(host, self.backend_port, timeout=10):
                print_error("Backend server failed to start or become healthy!")
                poll_result = self.backend_process.poll()
                if poll_result is not None:
                    print_error(f"Exit code: {poll_result}")
                
                # Try to dump any startup errors captured in the queue
                errors = []
                while not self.output_queue.empty():
                    label, line = self.output_queue.get_nowait()
                    if label == "Backend":
                        errors.append(line)
                
                if errors:
                    print_error("\n" + "="*70)
                    print_error("BACKEND ERROR OUTPUT:")
                    print_error("="*70)
                    for err in errors:
                        print(f"{Colors.FAIL}{err}{Colors.ENDC}")
                    print_error("="*70 + "\n")
                return False
                
            print_success(f"Backend server started (PID: {self.backend_process.pid})")
            print_info(f"API Documentation: http://{host}:{self.backend_port}/docs")
            print_info(f"Health Check: http://{host}:{self.backend_port}/health")
            return True
            
        except Exception as e:
            print_error(f"Failed to start backend: {e}")
            import traceback
            print_error(f"Traceback:\n{traceback.format_exc()}")
            return False
    
    def start_frontend(
        self,
        port: int = 5173,
        backend_host: str = "127.0.0.1",
        backend_port: int = 8000
    ) -> bool:
        """Start the frontend development server."""
        try:
            print_info(f"Starting frontend server on port {port}...")
            proxy_host = "127.0.0.1" if backend_host in {"0.0.0.0", "::"} else backend_host
            backend_target = f"http://{proxy_host}:{backend_port}"
            print_info(f"Configuring frontend API proxy -> {backend_target}")
             
            # Determine npm command based on OS
            is_windows = platform.system() == "Windows"
            npm_cmd = "npm.cmd" if is_windows else "npm"

            frontend_env = os.environ.copy()
            frontend_env["VITE_BACKEND_TARGET"] = backend_target
            frontend_env["VITE_API_BASE"] = "/api"
             
            # Start frontend process
            self.frontend_process = subprocess.Popen(
                [npm_cmd, "run", "dev", "--", "--port", str(port), "--host"],
                cwd=self.frontend_dir,
                env=frontend_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                shell=is_windows,
                bufsize=1,
                universal_newlines=True
            )
            
            # Wait a bit and check if process started successfully
            time.sleep(2)
            
            if self.frontend_process.poll() is not None:
                print_error("Frontend server failed to start")
                return False
            
            print_success(f"Frontend server started (PID: {self.frontend_process.pid})")
            print_info(f"Frontend URL: http://localhost:{port}")
            return True
            
        except Exception as e:
            print_error(f"Failed to start frontend: {e}")
            return False
    
    def monitor_processes(self):
        """Monitor and display output from processes."""
        print_section("Server Output")
        print_info("Press Ctrl+C to stop all servers\n")
        self._start_output_readers()
        
        try:
            while True:
                # Print any lines drained by background reader threads.
                try:
                    label, line = self.output_queue.get(timeout=0.25)
                    color = Colors.OKBLUE if label == "Backend" else Colors.OKCYAN
                    print(f"{color}[{label}]{Colors.ENDC} {line}")
                    while True:
                        label, line = self.output_queue.get_nowait()
                        color = Colors.OKBLUE if label == "Backend" else Colors.OKCYAN
                        print(f"{color}[{label}]{Colors.ENDC} {line}")
                except queue.Empty:
                    pass
                
                # Check if processes are still running
                if self.backend_process and self.backend_process.poll() is not None:
                    print_error("Backend process terminated unexpectedly")
                    break
                
                if self.frontend_process and self.frontend_process.poll() is not None:
                    print_error("Frontend process terminated unexpectedly")
                    break
                
                time.sleep(0.05)
                
        except KeyboardInterrupt:
            print("\n")
            print_info("Shutting down gracefully...")
    
    def stop_all(self):
        """Stop all running processes."""
        if self.backend_process:
            print_info("Stopping backend server...")
            try:
                self.backend_process.terminate()
                self.backend_process.wait(timeout=5)
                print_success("Backend server stopped")
            except subprocess.TimeoutExpired:
                print_warning("Force killing backend server...")
                self.backend_process.kill()
            except Exception as e:
                print_error(f"Error stopping backend: {e}")
        
        if self.frontend_process:
            print_info("Stopping frontend server...")
            try:
                self.frontend_process.terminate()
                self.frontend_process.wait(timeout=5)
                print_success("Frontend server stopped")
            except subprocess.TimeoutExpired:
                print_warning("Force killing frontend server...")
                self.frontend_process.kill()
            except Exception as e:
                print_error(f"Error stopping frontend: {e}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="AI Orchestrator - Unified server launcher",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run both backend and frontend
  python run.py

  # Run only backend
  python run.py --backend-only

  # Run only frontend
  python run.py --frontend-only

  # Run with custom ports
  python run.py --port 8080 --frontend-port 3000

  # Initialize database and run
  python run.py --init-db

  # Development mode with backend auto-reload
  python run.py --reload

  # Custom host binding
  python run.py --host 127.0.0.1
        """
    )
    
    parser.add_argument(
        "--backend-only",
        action="store_true",
        help="Run only the backend server"
    )
    
    parser.add_argument(
        "--frontend-only",
        action="store_true",
        help="Run only the frontend server"
    )
    
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Backend host (default: 0.0.0.0)"
    )
    
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Backend port (default: 8000)"
    )
    
    parser.add_argument(
        "--frontend-port",
        type=int,
        default=5173,
        help="Frontend port (default: 5173)"
    )
    
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable backend auto-reload for development"
    )

    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="Compatibility flag; backend auto-reload is disabled by default"
    )
    
    parser.add_argument(
        "--init-db",
        action="store_true",
        help="Initialize/reset the database before starting"
    )
    
    parser.add_argument(
        "--skip-checks",
        action="store_true",
        help="Skip dependency and environment checks"
    )
    
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="Skip automatic dependency installation"
    )
    
    parser.add_argument(
        "--recreate-venv",
        action="store_true",
        help="Delete and recreate the backend virtual environment"
    )
    
    parser.add_argument(
        "--clean-install",
        action="store_true",
        help="Delete node_modules and venv, then reinstall everything"
    )
    
    args = parser.parse_args()
    
    
    
    # Create process manager
    manager = ProcessManager(
        skip_install=args.skip_install,
        recreate_venv=args.recreate_venv,
        clean_install=args.clean_install
    )
    
    # Setup signal handlers for graceful shutdown
    def signal_handler(signum, frame):
        print("\n")
        print_info("Received shutdown signal...")
        manager.stop_all()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Run pre-flight checks
    if not args.skip_checks:
        print_section("Pre-flight Checks")
        
        # Check Python version
        if not manager.check_python_version():
            sys.exit(1)
        
        # Validate directories
        if not manager.validate_directories():
            sys.exit(1)
        
        # Create necessary directories
        manager.create_necessary_directories()
        
        # Check environment variables
        manager.check_environment_variables()
        
        # Check backend dependencies if running backend
        if not args.frontend_only:
            if not manager.check_backend_dependencies():
                sys.exit(1)
        
        # Check frontend dependencies if running frontend
        if not args.backend_only:
            if not manager.check_node_installed():
                sys.exit(1)
            if not manager.check_frontend_dependencies():
                sys.exit(1)
        
        print_success("All checks passed!")
    
    # Initialize database if requested
    if args.init_db and not args.frontend_only:
        print_section("Database Initialization")
        if not manager.initialize_database(force=True):
            sys.exit(1)
    elif not args.frontend_only:
        db_path = Path(manager._resolve_database_path_for_init())
        resolved_db_path = db_path if db_path.is_absolute() else manager.project_root / db_path
        if not resolved_db_path.exists():
            print_section("Database Setup")
            print_info("Database file not found. Initializing with default schema...")
            if not manager.initialize_database(force=False):
                sys.exit(1)
    
    # Start servers
    print_section("Starting Servers")
    
    success = True
    
    # Start backend
    if not args.frontend_only:
        if not manager.start_backend(
            host=args.host,
            port=args.port,
            reload=args.reload and not args.no_reload
        ):
            success = False
    
    # Start frontend
    if not args.backend_only and success:
        resolved_backend_port = manager.backend_port if manager.backend_port else args.port
        if not manager.start_frontend(
            port=args.frontend_port,
            backend_host=args.host,
            backend_port=resolved_backend_port
        ):
            success = False
    
    if not success:
        print_error("Failed to start servers")
        manager.stop_all()
        sys.exit(1)
    
    # Display startup summary
    print_section("Startup Summary")
    
    if not args.frontend_only:
        # Use the actual port that was discovered and used
        actual_port = manager.backend_port if manager.backend_port else args.port
        print_success(f"Backend: http://{args.host}:{actual_port}")
        print_info(f"  - API Docs: http://{args.host}:{actual_port}/docs")
        print_info(f"  - Health: http://{args.host}:{actual_port}/health")
    
    if not args.backend_only:
        print_success(f"Frontend: http://localhost:{args.frontend_port}")
        if manager.backend_port and manager.backend_port != args.port:
            proxy_host = "127.0.0.1" if args.host in {"0.0.0.0", "::"} else args.host
            print_info(f"  - Backend proxy: http://localhost:{args.frontend_port} -> http://{proxy_host}:{manager.backend_port}")
    
    print()
    
    # Monitor processes
    try:
        manager.monitor_processes()
    finally:
        manager.stop_all()
        print_success("Shutdown complete")


if __name__ == "__main__":
    main()
