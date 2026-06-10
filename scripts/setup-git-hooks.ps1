# ./scripts/setup-git-hooks.ps1
<#
.SYNOPSIS
  Point this repo at tracked git hooks that strip Cursor co-author trailers.
.DESCRIPTION
  Sets `core.hooksPath` to `.githooks` and marks hook scripts executable for Git Bash.
#>
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    git config core.hooksPath .githooks
    Write-Host "Git hooks path set to .githooks (prepare-commit-msg strips Cursor co-author trailers)."
} finally {
    Pop-Location
}
