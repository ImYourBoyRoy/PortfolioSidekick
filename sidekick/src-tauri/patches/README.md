# Rust dependency patches

Temporary `[patch.crates-io]` overrides for the `time` 0.3.48 coherence break
([time-rs/time#783](https://github.com/time-rs/time/issues/783)).

| Crate | Source | Remove when |
|-------|--------|-------------|
| `cookie` | [rwf2/cookie-rs@33a6c47](https://github.com/rwf2/cookie-rs/pull/254) | `cookie` > 0.18.1 on crates.io |
| `tauri-utils` | Vendored 2.9.2 with narrowed `From` impls | [tauri-apps/tauri#15525](https://github.com/tauri-apps/tauri/issues/15525) ships a release |
| `tauri` | Vendored 2.11.2 with narrowed `From` impls | Same upstream issue |

Refresh vendored crates after bumping semver requirements:

```powershell
# From sidekick/src-tauri — do NOT nest pwsh -Command (outer shell eats $variables)
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\refresh-cargo-patches.ps1
```

`tauri-utils` patches are reapplied automatically. `tauri` still needs manual merge
of `src/event/mod.rs`, `src/ipc/mod.rs`, and `src/ipc/command.rs` after upgrade.
