# Security

## Reporting

Email security concerns to the repository owner via GitHub Issues (private disclosure preferred for auth/vault topics).

## Known accepted risks

### glib-rs (Linux desktop builds only)

**Advisory:** [GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g) — unsound `VariantStrIter` in `glib` Rust bindings `< 0.20`.

**Context:** Tauri 2 on Linux pulls `gtk` 0.18 → `glib` 0.18.x. gtk3-rs is unmaintained; Tauri v3 will move to GTK4.

**Mitigation:** Dependabot alert dismissed as tolerable risk (Tauri upstream issue). Cargo `[patch.crates-io]` cannot bump registry glib 0.18→0.20 without a git fork.

**Runtime exposure:** Desktop Windows/macOS builds do not link glib. Linux AppImage/deb users are affected only if the unsound iterator path is exercised (low practical risk for this app).

## Secrets hygiene

- `.env` is gitignored — never commit tokens.
- Robinhood OAuth tokens live in per-platform vaults only, not SQLite.
- Git hooks strip accidental `Co-authored-by: Cursor` trailers.
