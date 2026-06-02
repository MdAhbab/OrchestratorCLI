# AI Orchestrator Windows build pipeline (run in PowerShell from repo root)
# Prerequisites: Node.js, Python venv with dev deps (pyinstaller), Inno Setup (ISCC.exe on PATH)
#   cd frontend && npm ci && npm run build
#   pip install pyinstaller pystray pillow
#   pyinstaller release/installer/launcher/ibm-bob-launcher.spec --noconfirm
#   ISCC.exe release/installer/windows/setup.iss

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

function Assert-LastExitCode {
  param([string]$Step)
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE"
  }
}

Write-Host "== Frontend build =="
Push-Location frontend
npm ci
Assert-LastExitCode "npm ci"
npm run build
Assert-LastExitCode "npm run build"
Pop-Location

Write-Host "== Backend build =="
python "release/installer/backend/build_backend.py"
Assert-LastExitCode "backend build"

Write-Host "== PyInstaller launcher =="
# Expect pyinstaller on PATH from active venv
pyinstaller "release/installer/launcher/ibm-bob-launcher.spec" --noconfirm
Assert-LastExitCode "pyinstaller launcher"

$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if (-not $iscc) {
  Write-Warning "ISCC.exe not found — install Inno Setup and add to PATH. Skipping setup.iss"
  exit 0
}

Write-Host "== Inno Setup =="
& ISCC.exe "release/installer/windows/setup.iss"
Assert-LastExitCode "inno setup"

Write-Host "Done. Output under release/installer/dist/windows/"
