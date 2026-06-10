# ./scripts/setup-git-hooks.ps1
<#
.SYNOPSIS
  Point this repo at tracked git hooks that strip Cursor co-author trailers.
.DESCRIPTION
  Sets `core.hooksPath` to `scripts/githooks`.
#>
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    git config core.hooksPath scripts/githooks
    Write-Host "Git hooks path set to scripts/githooks (prepare-commit-msg strips Cursor co-author trailers)."
} finally {
    Pop-Location
}
