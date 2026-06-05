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
    Write-Error "Node.js is not found on your PATH. Install Node.js 24+."
    Exit 1
}

$nodeVersion = (node -v) -replace 'v', ''
$nodeMajor = [int]($nodeVersion.Split('.')[0])
Write-Host "Detected Node.js version $nodeVersion" -ForegroundColor Gray
if ($nodeMajor -lt 22) {
    Write-Error "Node.js >= 22 is required."
    Exit 1
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error "Rust/Cargo is not found. Install from https://rustup.rs for Tauri desktop builds."
    Exit 1
}

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
    Write-Host "Artifacts under: $bundleDir" -ForegroundColor Green
    Write-Host "Windows installer/EXE typically at:" -ForegroundColor Green
    Write-Host "  frontend\src-tauri\target\release\bundle\nsis\*.exe" -ForegroundColor Green
} else {
    Write-Host "`n[ERROR] Tauri build failed." -ForegroundColor Red
    Exit 1
}
