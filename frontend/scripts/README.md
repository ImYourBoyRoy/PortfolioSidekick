# Frontend maintenance scripts

**Created by:** Roy Dawson IV

One-off tooling for the App.jsx modularization migration. Obsolete split scripts were removed after the `frontend/src/app/` layout landed.

## Safe to run

| Script | Purpose |
|--------|---------|
| `fix-mojibake.mjs` | Repairs UTF-8 mojibake (`ΓÇö` → `—`, broken emoji) in source files after bad encodings. |
| `inject-android-native.sh` | Android Capacitor native hook injection for portable builds. |

## Removed (do not restore without review)

Split automation (`split-*.mjs`, `extract-hook.mjs`, `fix-split-modules.mjs`, etc.) corrupted identifiers and strings (e.g. `s.holdings` inside class names). The app now uses hand-maintained modules under `src/app/`.
