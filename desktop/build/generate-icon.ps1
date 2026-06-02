# Generates desktop/build/icon.png and icon.ico for electron-builder.
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(255, 9, 9, 11))
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 99, 102, 241))
$g.FillEllipse($brush, 48, 48, 160, 160)
$font = New-Object System.Drawing.Font(
  "Segoe UI",
  72,
  [System.Drawing.FontStyle]::Bold,
  [System.Drawing.GraphicsUnit]::Pixel
)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
$g.DrawString("B", $font, [System.Drawing.Brushes]::White, $rect, $sf)
$font.Dispose()
$g.Dispose()

$pngPath = Join-Path $dir "icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Wrote $pngPath"

$icoPath = Join-Path $dir "icon.ico"
# Build a simple multi-size ICO from the PNG
$icon = [System.Drawing.Icon]::FromHandle(([System.Drawing.Bitmap]::FromFile($pngPath)).GetHicon())
$fs = [System.IO.File]::Create($icoPath)
$icon.Save($fs)
$fs.Close()
Write-Host "Wrote $icoPath"
