# ./sidekick/src-tauri/scripts/refresh-cargo-patches.ps1
<#
.SYNOPSIS
  Re-copy vendored Tauri crates from the local Cargo registry into patches/.

.DESCRIPTION
  Use after bumping tauri/tauri-utils in Cargo.lock. Copies pristine sources from
  %CARGO_HOME%/registry, then reapplies the time-0.3.48 coherence patches
  documented in patches/README.md.

.PARAMETER Version
  Optional tauri-utils version (default: read from Cargo.lock).

.PARAMETER TauriVersion
  Optional tauri version (default: read from Cargo.lock).

.EXAMPLE
  pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\refresh-cargo-patches.ps1
#>
[CmdletBinding()]
param(
    [string] $Version,
    [string] $TauriVersion
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$SrcTauriDir = Split-Path -Parent $ScriptDir
$PatchesDir = Join-Path $SrcTauriDir 'patches'
$LockFile = Join-Path $SrcTauriDir 'Cargo.lock'
$CargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $HOME '.cargo' }
$RegistryRoot = Join-Path $CargoHome 'registry\src'

function Get-LockCrateVersion {
    param([string] $Name)
    $inPackage = $false
    foreach ($line in Get-Content $LockFile) {
        if ($line -eq "[[package]]") { $inPackage = $false; continue }
        if ($line -eq "name = `"$Name`"") { $inPackage = $true; continue }
        if ($inPackage -and $line -match '^version = "(.+)"$') { return $Matches[1] }
    }
    throw "Could not find $Name in Cargo.lock"
}

function Find-RegistryCrateDir {
    param([string] $CrateName, [string] $CrateVersion)
    $dirs = Get-ChildItem -Path $RegistryRoot -Directory -ErrorAction SilentlyContinue
    foreach ($dir in $dirs) {
        $candidate = Join-Path $dir.FullName "$CrateName-$CrateVersion"
        if (Test-Path $candidate) { return $candidate }
    }
    throw "Registry source not found for $CrateName $CrateVersion. Run: cargo fetch"
}

function Copy-CratePatch {
    param([string] $CrateName, [string] $CrateVersion, [string] $DestName)
    $src = Find-RegistryCrateDir -CrateName $CrateName -CrateVersion $CrateVersion
    $dst = Join-Path $PatchesDir $DestName
    if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
    New-Item -ItemType Directory -Path $PatchesDir -Force | Out-Null
    Copy-Item -Path $src -Destination $dst -Recurse -Force
    Write-Host "Copied $CrateName $CrateVersion -> patches/$DestName"
}

function Apply-TauriUtilsPatches {
    param([string] $Root)
    $valuePath = Join-Path $Root 'src\acl\value.rs'
    $assetsPath = Join-Path $Root 'src\assets.rs'
    $value = Get-Content $valuePath -Raw
    $blanketValueFrom = @'
impl<T: Into<Number>> From<T> for Value {
  #[inline(always)]
  fn from(value: T) -> Self {
    Self::Number(value.into())
  }
}
'@
    $narrowValueFrom = @'
impl From<i64> for Value {
  #[inline(always)]
  fn from(value: i64) -> Self {
    Self::Number(value.into())
  }
}

impl From<f64> for Value {
  #[inline(always)]
  fn from(value: f64) -> Self {
    Self::Number(value.into())
  }
}
'@
    if ($value.Contains($blanketValueFrom)) {
        $value = $value.Replace($blanketValueFrom, $narrowValueFrom)
    } elseif (-not $value.Contains('impl From<i64> for Value')) {
        throw "tauri-utils value.rs: expected blanket From impl not found; merge patches manually"
    }
    Set-Content -Path $valuePath -Value $value -NoNewline

    $assets = Get-Content $assetsPath -Raw
    if ($assets -notmatch 'path::\{Component, Path, PathBuf\}') {
        $assets = $assets -replace 'path::\{Component, Path\}', 'path::{Component, Path, PathBuf}'
    }
    $blanketAssetFrom = @'
impl<P: AsRef<Path>> From<P> for AssetKey {
  fn from(path: P) -> Self {
    // TODO: change this to utilize `Cow` to prevent allocating an intermediate `PathBuf` when not necessary
    let path = path.as_ref().to_owned();

    // add in root to mimic how it is used from a server url
    let path = if path.has_root() {
      path
    } else {
      Path::new(&Component::RootDir).join(path)
    };

    let buf = if cfg!(windows) {
      let mut buf = String::new();
      for component in path.components() {
        match component {
          Component::RootDir => buf.push('/'),
          Component::CurDir => buf.push_str("./"),
          Component::ParentDir => buf.push_str("../"),
          Component::Prefix(prefix) => buf.push_str(&prefix.as_os_str().to_string_lossy()),
          Component::Normal(s) => {
            buf.push_str(&s.to_string_lossy());
            buf.push('/')
          }
        }
      }

      // remove the last slash
      if buf != "/" {
        buf.pop();
      }

      buf
    } else {
      path.to_string_lossy().to_string()
    };

    AssetKey(buf)
  }
}
'@
    $narrowAssetFrom = @'
fn asset_key_from_path(path: &Path) -> AssetKey {
  let path = path.to_owned();
  let path = if path.has_root() { path } else { Path::new(&Component::RootDir).join(path) };
  let buf = if cfg!(windows) {
    let mut buf = String::new();
    for component in path.components() {
      match component {
        Component::RootDir => buf.push('/'),
        Component::CurDir => buf.push_str("./"),
        Component::ParentDir => buf.push_str("../"),
        Component::Prefix(prefix) => buf.push_str(&prefix.as_os_str().to_string_lossy()),
        Component::Normal(s) => { buf.push_str(&s.to_string_lossy()); buf.push('/') }
      }
    }
    if buf != "/" { buf.pop(); }
    buf
  } else {
    path.to_string_lossy().to_string()
  };
  AssetKey(buf)
}

impl From<&Path> for AssetKey {
  fn from(path: &Path) -> Self { asset_key_from_path(path) }
}

impl From<PathBuf> for AssetKey {
  fn from(path: PathBuf) -> Self { asset_key_from_path(&path) }
}

impl From<&str> for AssetKey {
  fn from(path: &str) -> Self { asset_key_from_path(Path::new(path)) }
}

impl From<String> for AssetKey {
  fn from(path: String) -> Self { asset_key_from_path(Path::new(&path)) }
}
'@
    if ($assets.Contains($blanketAssetFrom)) {
        $assets = $assets.Replace($blanketAssetFrom, $narrowAssetFrom)
    } elseif (-not $assets.Contains('fn asset_key_from_path(path: &Path)')) {
        throw "tauri-utils assets.rs: expected blanket From impl not found; merge patches manually"
    }
    Set-Content -Path $assetsPath -Value $assets -NoNewline
    Write-Host 'Reapplied tauri-utils patches (value.rs, assets.rs)'
}

if (-not $Version) { $Version = Get-LockCrateVersion -Name 'tauri-utils' }
if (-not $TauriVersion) { $TauriVersion = Get-LockCrateVersion -Name 'tauri' }

Copy-CratePatch -CrateName 'tauri-utils' -CrateVersion $Version -DestName 'tauri-utils'
Apply-TauriUtilsPatches -Root (Join-Path $PatchesDir 'tauri-utils')

Write-Host ''
Write-Host 'tauri patch tree is not auto-refreshed (custom CommandErrorLike changes).' -ForegroundColor Yellow
Write-Host 'If tauri was upgraded, manually refresh patches/tauri from the registry and merge ipc/event edits.'
