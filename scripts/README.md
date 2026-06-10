# Repository scripts

Dev and release utilities for the monorepo root (not app runtime).

| Script | Purpose |
|--------|---------|
| `build-windows.ps1` | Windows Tauri release build (`npm run tauri:build`) |
| `setup-git-hooks.ps1` | Points `core.hooksPath` at `scripts/githooks/` |
| `purge-old-workflow-runs.ps1` | Prune old GitHub Actions runs (uses `GITHUB_TOKEN` from `.env`) |
| `githooks/prepare-commit-msg` | Strips Cursor co-author trailers from commits |

Android/CI maintenance scripts live in `sidekick/scripts/` (see that README).
