# ./compile_windows.ps1
# Portfolio Sidekick Windows Desktop Compiler (Tauri 2)
# Builds the React frontend and packages a native Windows executable.
# No Python, PyInstaller, or robin_stocks required.
#
# Created by: Roy Dawson IV

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    PORTFOLIO SIDEKICK TAURI WINDOWS COMPILER" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$RepoRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
Set-Location $RepoRoot
Write-Host "Workspace: $RepoRoot" -ForegroundColor Gray

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not found on your PATH. Install Node.js 26+."
    Exit 1
}

$nodeVersion = (node -v) -replace 'v', ''
$nodeMajor = [int]($nodeVersion.Split('.')[0])
Write-Host "Detected Node.js version $nodeVersion" -ForegroundColor Gray
if ($nodeMajor -lt 26) {
    Write-Error "Node.js >= 26 is required (see frontend/.node-version)."
    Exit 1
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error "Rust/Cargo is not found. Install from https://rustup.rs for Tauri desktop builds."
    Exit 1
}

Write-Host "Updating Rust stable toolchain (matches rust-toolchain.toml)..." -ForegroundColor Gray
rustup update stable 2>$null | Out-Null

Write-Host "`n[STEP 1/2] Compiling & linting React frontend..." -ForegroundColor Yellow
Push-Location (Join-Path $RepoRoot "frontend")
$failed = $false

npm install
if ($LASTEXITCODE -ne 0) { $failed = $true }

if (-not $failed) {
    npm run lint
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

if (-not $failed) {
    npm run build
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

Pop-Location
if ($failed) {
    Write-Error "Frontend compilation or linting failed."
    Exit 1
}

Write-Host "`n[STEP 2/2] Building Tauri Windows executable..." -ForegroundColor Yellow
Push-Location (Join-Path $RepoRoot "frontend")
npm run tauri:build
$tauriExit = $LASTEXITCODE
Pop-Location

if ($tauriExit -eq 0) {
    $bundleDir = Join-Path $RepoRoot "frontend\src-tauri\target\release\bundle"
    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "     [SUCCESS] TAURI BUILD COMPLETED!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    $releaseDir = Join-Path $RepoRoot "frontend\src-tauri\target\release"
    $portableExe = Join-Path $releaseDir "portfolio-sidekick.exe"
    $aliasExe = Join-Path $RepoRoot "PortfolioSidekick-Windows.exe"
    Copy-Item -Force $portableExe $aliasExe
    Write-Host "Portable EXE (run this):" -ForegroundColor Green
    Write-Host "  $portableExe" -ForegroundColor Green
    Write-Host "Copied alias:" -ForegroundColor Green
    Write-Host "  $aliasExe" -ForegroundColor Green
    Write-Host "Portable data folder (auth.log must appear here on first launch):" -ForegroundColor Green
    Write-Host "  $releaseDir\data\" -ForegroundColor Green
    Write-Host "Robinhood auth: native Rust HTTP in Tauri (no Python)." -ForegroundColor Green
    Write-Host "If login hangs and auth.log is missing, you are NOT running the exe above." -ForegroundColor Yellow
    Write-Host "Optional bundles (if enabled):" -ForegroundColor Gray
    Write-Host "  $bundleDir" -ForegroundColor Gray
} else {
    Write-Host "`n[ERROR] Tauri build failed." -ForegroundColor Red
    Exit 1
}
