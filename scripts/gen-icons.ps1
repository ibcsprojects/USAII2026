# Generates GreenPages PNG assets from logo.jpeg (the green "GP printer" mark).
# Keys the white background out to transparency (luminance -> alpha with unpremultiply
# so edges don't leave a white halo), then rescales to each target size.
#
#   Outputs: public/icons/icon{16,48,128}.png  — extension loader + web-accessible
#            src/assets/logo.png                — side panel header / injected button
#
# Run:  powershell -ExecutionPolicy Bypass -File scripts/gen-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = [System.Drawing.Image]::FromFile((Join-Path $root 'logo.jpeg'))

function Save-Logo([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  # The logo art already carries its own whitespace margin, so draw it full-bleed.
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()

  # White -> transparent. alpha = 255 - min(r,g,b); recover the true colour by
  # unpremultiplying the "over white" composite so anti-aliased edges fade cleanly.
  for ($y = 0; $y -lt $size; $y++) {
    for ($x = 0; $x -lt $size; $x++) {
      $p = $bmp.GetPixel($x, $y)
      $m = [Math]::Min([Math]::Min($p.R, $p.G), $p.B)
      $a = 255 - $m
      if ($a -le 0) {
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        continue
      }
      $af = $a / 255.0
      $r = [Math]::Max(0, [Math]::Min(255, [int][Math]::Round(($p.R - 255 * (1 - $af)) / $af)))
      $gr = [Math]::Max(0, [Math]::Min(255, [int][Math]::Round(($p.G - 255 * (1 - $af)) / $af)))
      $b = [Math]::Max(0, [Math]::Min(255, [int][Math]::Round(($p.B - 255 * (1 - $af)) / $af)))
      $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, $r, $gr, $b))
    }
  }
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $path"
}

Save-Logo 16 (Join-Path $root 'public/icons/icon16.png')
Save-Logo 48 (Join-Path $root 'public/icons/icon48.png')
Save-Logo 128 (Join-Path $root 'public/icons/icon128.png')
Save-Logo 256 (Join-Path $root 'src/assets/logo.png')

$src.Dispose()
