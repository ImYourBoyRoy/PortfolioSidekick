# ./scripts/purge-old-workflow-runs.ps1
# Deletes old GitHub Actions workflow runs, keeping only the newest N (default: 1).
# Requires: gh auth login (repo scope is enough for your own repo).
#
# Usage:
#   .\scripts\purge-old-workflow-runs.ps1
#   .\scripts\purge-old-workflow-runs.ps1 -Keep 3
#   .\scripts\purge-old-workflow-runs.ps1 -DryRun

param(
    [int]$Keep = 1,
    [int]$FetchLimit = 200,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repo = 'ImYourBoyRoy/PortfolioSidekick'

gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error 'gh is not authenticated. Run: gh auth login'
}

$json = gh run list --repo $repo --limit $FetchLimit --json databaseId,displayTitle,workflowName,createdAt,status
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Failed to list workflow runs.'
}

$runs = $json | ConvertFrom-Json
if (-not $runs -or $runs.Count -le $Keep) {
    Write-Host "Found $($runs.Count) run(s); nothing to delete (keeping $Keep)."
    exit 0
}

$toDelete = $runs | Select-Object -Skip $Keep
Write-Host "Keeping newest $Keep run(s). Deleting $($toDelete.Count) older run(s)..."

foreach ($run in $toDelete) {
    $label = "$($run.workflowName) #$($run.databaseId) ($($run.createdAt)) — $($run.displayTitle)"
    if ($DryRun) {
        Write-Host "[dry-run] would delete: $label"
        continue
    }
    Write-Host "Deleting: $label"
    gh run delete $run.databaseId --repo $repo
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed to delete run $($run.databaseId)"
    }
}

Write-Host 'Done.'
