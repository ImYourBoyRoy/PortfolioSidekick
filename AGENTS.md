# Local Agent Guidelines & Versioning Standards

This document establishes local execution rules and cutting-edge versioning directives for Portfolio Sidekick agents.

## 1. Floating Latest-Stable Toolchain Policy

We prefer **latest stable at build time** over frozen patch pins, while keeping majors explicit enough to avoid surprise breaking changes.

### Node.js
- **Major line:** `frontend/.node-version` (currently `24`).
- **CI:** `actions/setup-node@v6` with `node-version-file` + `check-latest: true` (latest patch of that major).
- **Local:** Node 24+ required (`package.json` `engines.node`).
- **Refresh:** `npm run toolchain:audit` or `node frontend/scripts/upgrade-ci-toolchain.mjs --sync-node` when bumping the major line.

### Rust / Tauri (desktop)
- **Channel:** `frontend/src-tauri/rust-toolchain.toml` → `channel = "stable"` (no patch pin).
- **CI:** `dtolnay/rust-toolchain@master` with `toolchain: stable` + `swatinem/rust-cache@master`.
- **Local:** `rustup update stable` before Tauri builds (`compile_windows.ps1` does this).
- **Crates:** Tauri/npm deps use semver ranges in `Cargo.toml` / `package.json`. Run `npm run deps:refresh` locally when intentionally upgrading; do **not** blind `cargo update` in CI without a green build.

### GitHub Actions (`.github/workflows/build.yml`)
| Kind | Rule |
|------|------|
| **Official actions** | Latest major tag (`checkout@v6`, `setup-node@v6`, `upload-artifact@v7`, `download-artifact@v8`, `cache@v5`, `setup-java@v5`) |
| **check-latest** | Enable on `setup-node` and `setup-java` where supported |
| **Third-party with `master`** | Pin `@master` (`dtolnay/rust-toolchain`, `swatinem/rust-cache`, `softprops/action-gh-release`) |
| **Third-party without `master`** | Latest version tag only (`android-actions/setup-android@v4` — `@master` fails) |

### Linux desktop (ubuntu-latest apt)
- Install current distro package names for Tauri (`libwebkit2gtk-4.1-dev`, etc.); no version pins unless a package rename requires it.

### Android (Capacitor)
- **Gradle:** `frontend/scripts/upgrade-android-gradle.mjs` resolves latest GA from `services.gradle.org/versions/current` each CI run.
- **JDK:** `actions/setup-java@v5`, `java-version: '24'`, `check-latest: true`.
- **SDK:** `android-actions/setup-android@v4` (no `@master` branch).

### Python (legacy reference only)
- Optional `backend/` verification scripts: Python 3.12+ when run locally; not part of production desktop/mobile runtime.

### CI verification
- Desktop job runs `node frontend/scripts/upgrade-ci-toolchain.mjs --check` after checkout.
- Local equivalent: `npm run toolchain:check` from `frontend/`.

## 2. Maintenance & Continuity
- **Database Migrations:** Keep SQLite databases portable and zero-dependency. Do not introduce database schemas that break multi-platform portability (e.g. Edge WebView2, Android Capacitor, macOS packages).
- **Security Checkpoints:** When testing locally or in CI/CD, scrub and wipe active session tokens cleanly. Never commit or track `.pickle` or `.db` files containing credentials.
