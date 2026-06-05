# ./compile_windows.ps1
# Portfolio Sidekick Windows Standalone Compiler Script
# Automatically builds static frontend assets and bundles the complete application 
# into a single-file executable ('dist/PortfolioSidekick.exe') with zero runtime console windows.
#
# Created by: Roy Dawson IV
#

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         PORTFOLIO SIDEKICK WINDOWS COMPILER" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Always run from the repository root (script directory), regardless of caller cwd.
$RepoRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
Set-Location $RepoRoot
Write-Host "Workspace: $RepoRoot" -ForegroundColor Gray

# 1. Verify Prerequisites
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not found on your PATH. Please install Node.js (v24+) to compile the React frontend."
    Exit 1
}

# Enforce Node version >= 22.0.0
$nodeVersion = (node -v) -replace 'v', ''
$nodeMajor = [int]($nodeVersion.Split('.')[0])
Write-Host "Detected Node.js version $nodeVersion (Major: $nodeMajor)" -ForegroundColor Gray
if ($nodeMajor -lt 22) {
    Write-Error "Capacitor requires Node.js >= 22.0.0. Please upgrade to Node 22 or 24+."
    Exit 1
}

# Verify Java JDK >= 21 (optional locally for Windows builds, but warns if target targets Android)
if (Get-Command java -ErrorAction SilentlyContinue) {
    $javaVersionStr = (java -version 2>&1 | Out-String)
    if ($javaVersionStr -match '"(\d+)(?:\.\d+)*.*"') {
        $javaMajor = [int]$Matches[1]
        Write-Host "Detected Java version $javaMajor" -ForegroundColor Gray
        if ($javaMajor -lt 21) {
            Write-Warning "Capacitor mandates Java 21+ for Android compilations. Your local Java version is $javaMajor. Please upgrade before mobile packaging."
        }
    }
}

# Find Python executable
$pythonExe = "python"
$backendVenv = Join-Path $RepoRoot "backend\.venv\Scripts\python.exe"
$rootVenv = Join-Path $RepoRoot ".venv\Scripts\python.exe"
if (Test-Path $backendVenv) {
    $pythonExe = $backendVenv
    Write-Host "Detected local virtual environment at 'backend/.venv'. Using it." -ForegroundColor Green
} elseif (Test-Path $rootVenv) {
    $pythonExe = $rootVenv
    Write-Host "Detected local virtual environment at '.venv'. Using it." -ForegroundColor Green
}

if (-not (Get-Command $pythonExe -ErrorAction SilentlyContinue)) {
    Write-Error "Python is not found. Please install Python 3.10+ to run backend scripts."
    Exit 1
}

# 2. Build Frontend Assets
Write-Host "`n[STEP 1/3] Compiling & Linting React Frontend Assets..." -ForegroundColor Yellow
Push-Location (Join-Path $RepoRoot "frontend")
try {
    Write-Host "Running npm install..." -ForegroundColor Gray
    npm install
    Write-Host "Running ESLint verification (smoke checks)..." -ForegroundColor Gray
    npm run lint
    Write-Host "Running npm run build..." -ForegroundColor Gray
    npm run build
} catch {
    Write-Error "Frontend compilation or linting failed."
    Pop-Location
    Exit 1
}
Pop-Location

# 3. Setup Python Dependencies
Write-Host "`n[STEP 2/3] Preparing Python Packaging Dependencies..." -ForegroundColor Yellow
Write-Host "Installing standard backend libraries..." -ForegroundColor Gray
& $pythonExe -m pip install -r (Join-Path $RepoRoot "backend\requirements.txt")
Write-Host "Installing PyInstaller & Pillow packagers..." -ForegroundColor Gray
& $pythonExe -m pip install pyinstaller Pillow

# 4. Compile Standalone Desktop App
Write-Host "`n[STEP 3/3] Compiling Single-File Windows Executable..." -ForegroundColor Yellow
& $pythonExe -m PyInstaller --clean (Join-Path $RepoRoot "PortfolioSidekick.spec")

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "     [SUCCESS] COMPILATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "Target Binary: $(Join-Path $RepoRoot 'dist\PortfolioSidekick.exe')" -ForegroundColor Green
    Write-Host "You can run this file directly to launch Portfolio Sidekick offline!" -ForegroundColor Green
} else {
    Write-Host "`n==========================================================" -ForegroundColor Red
    Write-Host "             [ERROR] COMPILATION FAILED!" -ForegroundColor Red
    Write-Host "==========================================================" -ForegroundColor Red
    Exit 1
}
