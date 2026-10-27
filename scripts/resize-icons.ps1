Add-Type -AssemblyName System.Drawing

$src = "C:\Users\TOUTENUN\.gemini\antigravity-ide\brain\3fc704c0-0973-4cf9-86b3-4dda43e86d43\lan_chat_icon_1788210444713.jpg"
$baseDir = "c:\Users\TOUTENUN\Desktop\B3\android\app\src\main\res"

if (-not (Test-Path $src)) {
    Write-Error "Source image not found: $src"
    exit 1
}

$srcBmp = [System.Drawing.Image]::FromFile($src)

function Resize-Image($sourceBmp, $destPath, $targetW, $targetH) {
    $destBmp = New-Object System.Drawing.Bitmap($targetW, $targetH)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($sourceBmp, 0, 0, $targetW, $targetH)
    $g.Dispose()

    # Ensure parent dir exists
    $parent = Split-Path -Parent $destPath
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    
    $destBmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBmp.Dispose()
    Write-Host "Created: $destPath ($targetW x $targetH)"
}

# Icon dimensions
$densities = @(
    @{ folder = "mipmap-mdpi"; launcher = 48; fg = 108 },
    @{ folder = "mipmap-hdpi"; launcher = 72; fg = 162 },
    @{ folder = "mipmap-xhdpi"; launcher = 96; fg = 216 },
    @{ folder = "mipmap-xxhdpi"; launcher = 144; fg = 324 },
    @{ folder = "mipmap-xxxhdpi"; launcher = 192; fg = 432 }
)

foreach ($d in $densities) {
    $folder = Join-Path $baseDir $d.folder
    Resize-Image $srcBmp (Join-Path $folder "ic_launcher.png") $d.launcher $d.launcher
    Resize-Image $srcBmp (Join-Path $folder "ic_launcher_round.png") $d.launcher $d.launcher
    Resize-Image $srcBmp (Join-Path $folder "ic_launcher_foreground.png") $d.fg $d.fg
}

# Also copy to public/favicon.png for web/PWA
Resize-Image $srcBmp "c:\Users\TOUTENUN\Desktop\B3\public\favicon.png" 192 192

$srcBmp.Dispose()
Write-Host "All icons generated successfully!"
