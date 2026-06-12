# ./scripts/build-android.ps1
# Portfolio Sidekick Android local compiler — build debug APK and install to a connected device.
# Uses a writable SDK under %LOCALAPPDATA%\Android\Sdk (API 37) seeded from any existing install.
#
# Prerequisites: Node 26+, Java JDK 21+, Android platform-tools/adb (any existing SDK path).
# Created by: Roy Dawson IV

param(
    [switch]$SkipInstall,
    [switch]$SkipLint,
    [switch]$FreshInstall,
    [string]$DeviceId = ""
)

$AppPackage = "com.imyourboyroy.portfoliosidekick"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    PORTFOLIO SIDEKICK ANDROID LOCAL COMPILER" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$RepoRoot = if ($PSScriptRoot) {
    $parent = Split-Path -Parent $PSScriptRoot
    if (Test-Path (Join-Path $parent "sidekick\package.json")) { $parent }
    elseif (Test-Path (Join-Path $PSScriptRoot "sidekick\package.json")) { $PSScriptRoot }
    else { $parent }
} else {
    (Get-Location).Path
}
Set-Location $RepoRoot
$Sidekick = Join-Path $RepoRoot "sidekick"
Write-Host "Workspace: $RepoRoot" -ForegroundColor Gray

function Test-WritableDirectory {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    try {
        $probe = Join-Path $Path ".sidekick-write-test"
        New-Item -ItemType File -Path $probe -Force | Out-Null
        Remove-Item $probe -Force
        return $true
    } catch {
        return $false
    }
}

function Find-SeedAndroidSdk {
    $legacySdk = Join-Path ${env:ProgramFiles(x86)} "Android\android-sdk"
    $candidates = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        (Join-Path $env:LOCALAPPDATA "Android\Sdk"),
        "C:\Android\Sdk",
        $legacySdk
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

    foreach ($sdk in $candidates) {
        if (Test-Path (Join-Path $sdk "platform-tools\adb.exe")) {
            return $sdk
        }
    }
    return $null
}

function Copy-TreeIfMissing {
    param(
        [string]$Source,
        [string]$Destination
    )
    if (-not (Test-Path $Source)) { return $false }
    if (Test-Path $Destination) { return $true }
    $parent = Split-Path $Destination -Parent
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Write-Host "Seeding $(Split-Path $Destination -Leaf)..." -ForegroundColor Gray
    Copy-Item -Path $Source -Destination $Destination -Recurse -Force
    return $true
}

function Initialize-WritableAndroidSdk {
    param([string]$SeedSdk)

    $userSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    New-Item -ItemType Directory -Path $userSdk -Force | Out-Null

    Copy-TreeIfMissing -Source (Join-Path $SeedSdk "platform-tools") -Destination (Join-Path $userSdk "platform-tools") | Out-Null
    Copy-TreeIfMissing -Source (Join-Path $SeedSdk "cmdline-tools") -Destination (Join-Path $userSdk "cmdline-tools") | Out-Null

    $platformsSrc = Join-Path $SeedSdk "platforms"
    $platformsDest = Join-Path $userSdk "platforms"
    if (Test-Path $platformsSrc) {
        New-Item -ItemType Directory -Path $platformsDest -Force | Out-Null
        Get-ChildItem $platformsSrc -Directory | ForEach-Object {
            $destPlatform = Join-Path $platformsDest $_.Name
            if (-not (Test-Path $destPlatform)) {
                Write-Host "Seeding platform $($_.Name)..." -ForegroundColor Gray
                Copy-Item $_.FullName $destPlatform -Recurse -Force
            }
        }
    }

    $buildToolsSrc = Join-Path $SeedSdk "build-tools"
    $buildToolsDest = Join-Path $userSdk "build-tools"
    if (Test-Path $buildToolsSrc) {
        New-Item -ItemType Directory -Path $buildToolsDest -Force | Out-Null
        Get-ChildItem $buildToolsSrc -Directory | Select-Object -First 1 | ForEach-Object {
            $destBt = Join-Path $buildToolsDest $_.Name
            if (-not (Test-Path $destBt)) {
                Write-Host "Seeding build-tools $($_.Name)..." -ForegroundColor Gray
                Copy-Item $_.FullName $destBt -Recurse -Force
            }
        }
    }

    return $userSdk
}

function Get-SdkManagerPath {
    param([string]$SdkRoot)
    $latest = Join-Path $SdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"
    if (Test-Path $latest) { return $latest }
    Get-ChildItem -Path (Join-Path $SdkRoot "cmdline-tools") -Recurse -Filter "sdkmanager.bat" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}

function Test-AndroidApiInstalled {
    param(
        [string]$SdkRoot,
        [int]$ApiLevel
    )
    $platformsDir = Join-Path $SdkRoot "platforms"
    if (-not (Test-Path $platformsDir)) { return $false }
    foreach ($dir in Get-ChildItem $platformsDir -Directory) {
        if ($dir.Name -match "^android-$ApiLevel(?:\.\d+)?$") { return $true }
    }
    return $false
}

function Get-InstalledAndroidApiLevels {
    param([string]$SdkRoot)
    $platformsDir = Join-Path $SdkRoot "platforms"
    if (-not (Test-Path $platformsDir)) { return @() }
    Get-ChildItem $platformsDir -Directory |
        ForEach-Object {
            if ($_.Name -match '^android-(\d+)') { [int]$Matches[1] }
        } |
        Sort-Object -Unique -Descending
}

function Accept-AndroidSdkLicenses {
    param(
        [string]$SdkRoot,
        [string]$SdkManager
    )
    $env:ANDROID_HOME = $SdkRoot
    $env:ANDROID_SDK_ROOT = $SdkRoot
    $inputLicenses = ("y`n" * 40)
    $inputLicenses | & $SdkManager --sdk_root=$SdkRoot --licenses 2>&1 | Out-Null
}

function Ensure-AndroidApi37 {
    param([string]$SdkRoot)

    if (Test-AndroidApiInstalled -SdkRoot $SdkRoot -ApiLevel 37) { return $true }

    $sdkmanager = Get-SdkManagerPath -SdkRoot $SdkRoot
    if (-not $sdkmanager) {
        Write-Warning "sdkmanager not found under $SdkRoot"
        return $false
    }

    if (-not (Test-WritableDirectory $SdkRoot)) {
        Write-Warning "SDK root is not writable: $SdkRoot"
        return $false
    }

    $env:ANDROID_HOME = $SdkRoot
    $env:ANDROID_SDK_ROOT = $SdkRoot
    Accept-AndroidSdkLicenses -SdkRoot $SdkRoot -SdkManager $sdkmanager

    Write-Host "Installing API 37 platform into writable SDK..." -ForegroundColor Yellow
    Write-Host "  $sdkmanager --sdk_root=$SdkRoot platforms;android-37.0 build-tools;35.0.0" -ForegroundColor DarkGray
    & $sdkmanager --sdk_root=$SdkRoot "platforms;android-37.0" "build-tools;35.0.0"
    return (Test-AndroidApiInstalled -SdkRoot $SdkRoot -ApiLevel 37)
}

function Set-LocalCompileSdk {
    param([int]$Level)
    $vars = Join-Path $Sidekick "android\variables.gradle"
    if (-not (Test-Path $vars)) { return }
    $content = Get-Content $vars -Raw
    $content = $content -replace 'compileSdkVersion = \d+', "compileSdkVersion = $Level"
    if ($Level -ge 37) {
        $content = $content -replace "androidxCoreVersion = '[^']+'", "androidxCoreVersion = '1.19.0'"
    } else {
        $content = $content -replace "androidxCoreVersion = '[^']+'", "androidxCoreVersion = '1.18.0'"
        Write-Host "androidxCoreVersion -> 1.18.0 (API $Level fallback only)" -ForegroundColor Yellow
    }
    Set-Content -Path $vars -Value $content -NoNewline
    node ./scripts/patch-android-build.mjs
    if ($LASTEXITCODE -ne 0) { throw "patch-android-build.mjs failed after compileSdk=$Level" }
    Write-Host "compileSdkVersion -> $Level" -ForegroundColor Yellow
}

function Find-Adb {
    param([string]$SdkRoot)
    $candidate = Join-Path $SdkRoot "platform-tools\adb.exe"
    if (Test-Path $candidate) { return $candidate }
    $legacy = Join-Path ${env:ProgramFiles(x86)} "Android\android-sdk\platform-tools\adb.exe"
    if (Test-Path $legacy) { return $legacy }
    return $null
}

function Find-Bash {
    $candidates = @(
        "C:\Program Files\Git\bin\bash.exe",
        "C:\Program Files\Git\usr\bin\bash.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    if (Get-Command bash -ErrorAction SilentlyContinue) { return "bash" }
    return $null
}

function Resolve-JavaHome {
    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
        return $env:JAVA_HOME
    }
    $patterns = @(
        (Join-Path ${env:ProgramFiles} "Java\jdk-*"),
        (Join-Path ${env:ProgramFiles} "Java\latest"),
        (Join-Path ${env:ProgramFiles} "Eclipse Adoptium\jdk-*"),
        (Join-Path ${env:ProgramFiles} "Microsoft\jdk-*")
    )
    foreach ($pattern in $patterns) {
        $hits = Get-ChildItem $pattern -ErrorAction SilentlyContinue |
            Where-Object { Test-Path (Join-Path $_.FullName "bin\java.exe") } |
            Sort-Object Name -Descending
        if ($hits) { return $hits[0].FullName }
    }
    $javaExe = (Get-Command java -ErrorAction SilentlyContinue).Source
    if ($javaExe) {
        $candidate = (Resolve-Path (Join-Path (Split-Path $javaExe -Parent) "..")).Path
        if (Test-Path (Join-Path $candidate "bin\java.exe")) { return $candidate }
    }
    return $null
}

function Write-InstallDebugCommands {
    param(
        [string]$AdbPath,
        [string]$ApkPath
    )
    $adbCmd = "`"$AdbPath`""
    $apkCmd = "`"$ApkPath`""
    $logDump = Join-Path $RepoRoot "sidekick\android-debug.log"
    Write-Host ""
    Write-Host "Installed. Copy-paste debug commands:" -ForegroundColor Green
    Write-Host "$adbCmd logcat -c"
    Write-Host "$adbCmd logcat -s RobinhoodAuth Capacitor/Console"
    Write-Host ""
    Write-Host "Full log dump (reproduce bug first, then run):" -ForegroundColor Gray
    Write-Host "pwsh -NoProfile -Command `"`$adb='$AdbPath'; `$out='$logDump'; '=== dump ' + (Get-Date) | Set-Content `$out; & `$adb logcat -d -b all -t 8000 | Add-Content `$out; & `$adb logcat -d -b all | Select-String 'RobinhoodAuth|Capacitor|chromium|Console|portfoliosidekick' | Select-Object -Last 2000 | Add-Content `$out`""
    Write-Host ""
    Write-Host "Reinstall without wiping app data (default):" -ForegroundColor Gray
    Write-Host "$adbCmd install -r $apkCmd"
    Write-Host ""
    Write-Host "Fresh install (wipes vault/login — use when testing auth changes):" -ForegroundColor Gray
    Write-Host "$adbCmd uninstall $AppPackage"
    Write-Host "$adbCmd install $apkCmd"
    Write-Host ""
    Write-Host "Or rebuild with: pwsh -File .\scripts\build-android.ps1 -FreshInstall" -ForegroundColor DarkGray
}

# --- Bootstrap writable SDK (API 37) ---
$seedSdk = Find-SeedAndroidSdk
if (-not $seedSdk) {
    Write-Error "No Android SDK found. Install Android Studio or platform-tools, or set ANDROID_HOME."
    exit 1
}

$AndroidSdk = Initialize-WritableAndroidSdk -SeedSdk $seedSdk
$env:ANDROID_HOME = $AndroidSdk
$env:ANDROID_SDK_ROOT = $AndroidSdk
Write-Host "ANDROID_HOME: $AndroidSdk" -ForegroundColor Gray

$script:Api37Ready = Ensure-AndroidApi37 -SdkRoot $AndroidSdk
if (-not $script:Api37Ready) {
    $installed = Get-InstalledAndroidApiLevels -SdkRoot $AndroidSdk
    $fallback = ($installed | Select-Object -First 1)
    if (-not $fallback) {
        Write-Error @"
Could not install Android API 37 platform.
Install Android Studio (recommended) or run manually:
  sdkmanager --sdk_root=$AndroidSdk `"platforms;android-37.0`" `"build-tools;35.0.0`"
"@
        exit 1
    }
    Write-Warning "API 37 install failed; falling back to compileSdk $fallback (CI uses API 37)."
} else {
    Write-Host "API 37 platform ready." -ForegroundColor Green
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not on PATH. Install Node.js 26+."
    exit 1
}

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Error "Java JDK not found. Install JDK 21+ and ensure java is on PATH."
    exit 1
}

$resolvedJavaHome = Resolve-JavaHome
if (-not $resolvedJavaHome) {
    Write-Error "Could not resolve JDK home. Install JDK 21+ or set JAVA_HOME to a full JDK path."
    exit 1
}
$env:JAVA_HOME = $resolvedJavaHome
Write-Host "JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Gray

$bash = Find-Bash
if (-not $bash) {
    Write-Error "Git Bash not found. Install Git for Windows (needed for inject-android-native.sh)."
    exit 1
}

Push-Location $Sidekick
try {
    Write-Host "`n[1/8] npm install" -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    if (-not $SkipLint) {
        Write-Host "`n[2/8] lint" -ForegroundColor Yellow
        npm run lint
        if ($LASTEXITCODE -ne 0) { throw "lint failed" }
        Write-Host "`n[2b/8] unit tests" -ForegroundColor Yellow
        npm run test
        if ($LASTEXITCODE -ne 0) { throw "unit tests failed" }
    } else {
        Write-Host "`n[2/8] lint skipped" -ForegroundColor Gray
    }

    Write-Host "`n[3/8] vite build" -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "vite build failed" }

    Write-Host "`n[4/8] cap sync / add android" -ForegroundColor Yellow
    npx cap sync
    if ($LASTEXITCODE -ne 0) { throw "cap sync failed" }
    if (-not (Test-Path "android")) {
        npx cap add android
        if ($LASTEXITCODE -ne 0) { throw "cap add android failed" }
    }
    npx cap sync android
    if ($LASTEXITCODE -ne 0) { throw "cap sync android failed" }

    Write-Host "`n[5/8] generate + copy launcher icons" -ForegroundColor Yellow
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\generate-android-icons.ps1")
    if ($LASTEXITCODE -ne 0) { throw "generate-android-icons.ps1 failed" }
    pwsh -NoProfile -ExecutionPolicy Bypass -File "./scripts/copy-android-icons.ps1"
    if ($LASTEXITCODE -ne 0) { throw "copy-android-icons.ps1 failed" }

    Write-Host "`n[6/8] inject native Kotlin plugin" -ForegroundColor Yellow
    & $bash "./scripts/inject-android-native.sh"
    if ($LASTEXITCODE -ne 0) { throw "inject-android-native.sh failed" }

    Write-Host "`n[7/8] patch + upgrade Android deps" -ForegroundColor Yellow
    node ./scripts/patch-android-build.mjs
    if ($LASTEXITCODE -ne 0) { throw "patch-android-build.mjs failed" }
    node ./scripts/upgrade-android-build-deps.mjs
    if ($LASTEXITCODE -ne 0) { throw "upgrade-android-build-deps.mjs failed" }

    if ($script:Api37Ready -or (Get-InstalledAndroidApiLevels -SdkRoot $AndroidSdk) -contains 37) {
        Set-LocalCompileSdk -Level 37
    } else {
        $installed = Get-InstalledAndroidApiLevels -SdkRoot $AndroidSdk
        if ($installed.Count -gt 0) {
            Set-LocalCompileSdk -Level ($installed | Select-Object -First 1)
        }
    }

    $localProps = Join-Path $Sidekick "android\local.properties"
    $sdkDirProp = $AndroidSdk -replace '\\', '/'
    "sdk.dir=$sdkDirProp" | Set-Content -Path $localProps -Encoding ASCII

    Write-Host "`n[8/8] gradle assembleDebug" -ForegroundColor Yellow
    Push-Location android
    if ($IsWindows -or $env:OS -match "Windows") {
        .\gradlew.bat assembleDebug --no-daemon
    } else {
        chmod +x gradlew
        ./gradlew assembleDebug --no-daemon
    }
    if ($LASTEXITCODE -ne 0) { throw "gradle assembleDebug failed" }
    Pop-Location

    $apk = Join-Path $Sidekick "android\app\build\outputs\apk\debug\app-debug.apk"
    if (-not (Test-Path $apk)) {
        throw "Debug APK not found at $apk"
    }

    $outApk = Join-Path $RepoRoot "PortfolioSidekick-Android-debug.apk"
    Copy-Item $apk $outApk -Force
    Write-Host "`nBuilt: $outApk" -ForegroundColor Green

    if ($SkipInstall) {
        Write-Host "SkipInstall set — APK ready, not pushed to device." -ForegroundColor Gray
        exit 0
    }

    $adb = Find-Adb -SdkRoot $AndroidSdk
    if (-not $adb) {
        Write-Warning "adb not found. APK built but not installed."
        exit 0
    }

    $deviceArgs = @("devices")
    if ($DeviceId) { $deviceArgs = @("-s", $DeviceId) + $deviceArgs }
    Write-Host (& $adb @deviceArgs 2>&1 | Out-String) -ForegroundColor Gray

    if ($FreshInstall) {
        Write-Host "FreshInstall: uninstalling $AppPackage ..." -ForegroundColor Yellow
        $uninstallArgs = @("uninstall", $AppPackage)
        if ($DeviceId) { $uninstallArgs = @("-s", $DeviceId) + $uninstallArgs }
        & $adb @uninstallArgs 2>&1 | Out-Null
    }

    $installArgs = @("install")
    if (-not $FreshInstall) { $installArgs += "-r" }
    $installArgs += $apk
    if ($DeviceId) { $installArgs = @("-s", $DeviceId) + $installArgs }
    Write-Host "Installing to device..." -ForegroundColor Yellow
    & $adb @installArgs
    if ($LASTEXITCODE -ne 0) { throw "adb install failed" }

    Write-InstallDebugCommands -AdbPath $adb -ApkPath $apk
}
catch {
    Write-Error $_
    exit 1
}
finally {
    Pop-Location
}
