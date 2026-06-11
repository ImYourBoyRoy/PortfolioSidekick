# ./sidekick/scripts/copy-android-icons.ps1
# Copies generated assets/android launcher icons into the Capacitor android res tree.

$SidekickRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent $SidekickRoot
$Assets = Join-Path $RepoRoot "assets\android"
$AndroidRes = Join-Path $SidekickRoot "android\app\src\main\res"

if (-not (Test-Path $Assets)) {
    Write-Error "Missing $Assets — run scripts/generate-android-icons.ps1 first."
    exit 1
}
if (-not (Test-Path $AndroidRes)) {
    Write-Error "Missing $AndroidRes — run npx cap add android first."
    exit 1
}

$densityMap = @{
    mdpi    = "mipmap-mdpi"
    hdpi    = "mipmap-hdpi"
    xhdpi   = "mipmap-xhdpi"
    xxhdpi  = "mipmap-xxhdpi"
    xxxhdpi = "mipmap-xxxhdpi"
}

foreach ($density in $densityMap.Keys) {
    $folder = Join-Path $AndroidRes $densityMap[$density]
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    Copy-Item (Join-Path $Assets "icon-$density.png") (Join-Path $folder "ic_launcher.png") -Force
    Copy-Item (Join-Path $Assets "icon-$density.png") (Join-Path $folder "ic_launcher_round.png") -Force
    Copy-Item (Join-Path $Assets "icon-foreground-$density.png") (Join-Path $folder "ic_launcher_foreground.png") -Force
}

$anydpi = Join-Path $AndroidRes "mipmap-anydpi-v26"
New-Item -ItemType Directory -Path $anydpi -Force | Out-Null
$values = Join-Path $AndroidRes "values"
New-Item -ItemType Directory -Path $values -Force | Out-Null

@'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'@ | Set-Content (Join-Path $anydpi "ic_launcher.xml") -Encoding UTF8

@'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'@ | Set-Content (Join-Path $anydpi "ic_launcher_round.xml") -Encoding UTF8

@'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#070c12</color>
</resources>
'@ | Set-Content (Join-Path $values "ic_launcher_background.xml") -Encoding UTF8

Write-Host "Android launcher icons copied from assets/android." -ForegroundColor Green
