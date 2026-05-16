# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for AI CLI Orchestrator
Packages the FastAPI backend with embedded Python runtime
"""

import sys
from pathlib import Path

# Get paths
spec_root = Path(SPECPATH)
project_root = spec_root.parent.parent
backend_dir = project_root / 'backend'
frontend_dist = project_root / 'frontend' / 'dist'
workspace_templates = spec_root.parent / 'workspace'

block_cipher = None

# Collect all backend files
backend_datas = [
    (str(backend_dir / 'app'), 'app'),
]

# Add frontend if it exists
if frontend_dist.exists():
    backend_datas.append((str(frontend_dist), 'frontend/dist'))
else:
    print("WARNING: Frontend dist not found. Build frontend first with 'npm run build'")

# Add workspace templates
if workspace_templates.exists():
    backend_datas.append((str(workspace_templates / '*.template'), 'workspace'))

a = Analysis(
    ['main.py'],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=backend_datas,
    hiddenimports=[
        # Uvicorn and FastAPI
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        
        # FastAPI dependencies
        'fastapi',
        'fastapi.staticfiles',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'pydantic',
        'pydantic.json',
        
        # Additional dependencies
        'yaml',
        'json',
        'asyncio',
        'websockets',
        
        # App modules (adjust based on your structure)
        'app',
        'app.main',
        'app.api',
        'app.models',
        'app.services',
        'app.utils',
        'app.cli_wrappers',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',
        'scipy',
        'PIL',
        'PyQt5',
        'PyQt6',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='orchestrator-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window (GUI mode)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(spec_root.parent / 'windows' / 'icon.ico') if sys.platform == 'win32' else None,
)

# For macOS, create an app bundle
if sys.platform == 'darwin':
    app = BUNDLE(
        exe,
        name='Orchestrator.app',
        icon=str(spec_root.parent / 'macos' / 'icon.icns'),
        bundle_identifier='com.orchestrator.app',
        info_plist={
            'CFBundleName': 'AI CLI Orchestrator',
            'CFBundleDisplayName': 'AI CLI Orchestrator',
            'CFBundleVersion': '1.0.0',
            'CFBundleShortVersionString': '1.0.0',
            'NSHighResolutionCapable': True,
            'LSMinimumSystemVersion': '10.15.0',
        },
    )