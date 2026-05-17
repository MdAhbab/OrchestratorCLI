# IBM Bob Windows build pipeline (run in PowerShell from repo root)
# Prerequisites: Node.js, Python venv with dev deps (pyinstaller), Inno Setup (ISCC.exe on PATH)
#   cd frontend && npm ci && npm run build
#   pip install pyinstaller pystray pillow
#   pyinstaller release/installer/launcher/ibm-bob-launcher.spec --noconfirm
#   ISCC.exe release/installer/windows/installer.iss

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

Write-Host "== Frontend build =="
Push-Location frontend
npm ci
npm run build
Pop-Location

Write-Host "== PyInstaller launcher =="
# Expect pyinstaller on PATH from active venv
pyinstaller "release/installer/launcher/ibm-bob-launcher.spec" --noconfirm

$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if (-not $iscc) {
  Write-Warning "ISCC.exe not found — install Inno Setup and add to PATH. Skipping installer.iss"
  exit 0
}

Write-Host "== Inno Setup =="
& ISCC.exe "release/installer/windows/installer.iss"

Write-Host "Done. Output under dist-installer/"
