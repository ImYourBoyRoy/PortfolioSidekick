# ./scripts/generate-android-icons.ps1
# Generates Android launcher + adaptive foreground PNGs from the canonical brain icon.
# Source: sidekick/src-tauri/icons/icon.png
# Outputs: assets/android/* and sidekick/src-tauri/icons/android/mipmap-*

param(
    [string]$SourceIcon = ""
)

$RepoRoot = if ($PSScriptRoot) {
    $parent = Split-Path -Parent $PSScriptRoot
    if (Test-Path (Join-Path $parent "sidekick\package.json")) { $parent }
    else { $PSScriptRoot }
} else {
    (Get-Location).Path
}

if (-not $SourceIcon) {
    $SourceIcon = Join-Path $RepoRoot "sidekick\src-tauri\icons\icon.png"
}
if (-not (Test-Path $SourceIcon)) {
    Write-Error "Source icon not found: $SourceIcon"
    exit 1
}

Add-Type -AssemblyName System.Drawing

function Resize-Png {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [int]$Size
    )
    $dir = Split-Path $OutputPath -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $src = [System.Drawing.Image]::FromFile($InputPath)
    try {
        $bmp = New-Object System.Drawing.Bitmap $Size, $Size
        $graphics = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($src, 0, 0, $Size, $Size)
        } finally {
            $graphics.Dispose()
        }
        $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
    } finally {
        $src.Dispose()
    }
}

$launcherSizes = @{
    mdpi    = 48
    hdpi    = 72
    xhdpi   = 96
    xxhdpi  = 144
    xxxhdpi = 192
}
$foregroundSizes = @{
    mdpi    = 108
    hdpi    = 162
    xhdpi   = 216
    xxhdpi  = 324
    xxxhdpi = 432
}

$assetsRoot = Join-Path $RepoRoot "assets\android"
$tauriAndroid = Join-Path $RepoRoot "sidekick\src-tauri\icons\android"

Write-Host "Generating Android icons from $SourceIcon" -ForegroundColor Cyan

foreach ($density in $launcherSizes.Keys) {
    $px = $launcherSizes[$density]
    $assetOut = Join-Path $assetsRoot "icon-$density.png"
    Resize-Png -InputPath $SourceIcon -OutputPath $assetOut -Size $px

    $mipmapDir = Join-Path $tauriAndroid "mipmap-$density"
    Resize-Png -InputPath $SourceIcon -OutputPath (Join-Path $mipmapDir "ic_launcher.png") -Size $px
    Resize-Png -InputPath $SourceIcon -OutputPath (Join-Path $mipmapDir "ic_launcher_round.png") -Size $px

    $fgPx = $foregroundSizes[$density]
    $fgAsset = Join-Path $assetsRoot "icon-foreground-$density.png"
    Resize-Png -InputPath $SourceIcon -OutputPath $fgAsset -Size $fgPx
    Resize-Png -InputPath $SourceIcon -OutputPath (Join-Path $mipmapDir "ic_launcher_foreground.png") -Size $fgPx
}

$bgXml = Join-Path $tauriAndroid "values\ic_launcher_background.xml"
if (Test-Path (Split-Path $bgXml -Parent)) {
    @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#070c12</color>
</resources>
"@ | Set-Content -Path $bgXml -Encoding UTF8
}

Write-Host "Done. assets/android and sidekick/src-tauri/icons/android updated." -ForegroundColor Green
