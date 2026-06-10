# Sidekick maintenance scripts

**Created by:** Roy Dawson IV

Build and maintenance tooling for Tauri desktop and Capacitor Android.

## Safe to run

| Script | Purpose |
|--------|---------|
| `fix-mojibake.mjs` | Repairs UTF-8 mojibake (`ΓÇö` → `—`, broken emoji) in source files after bad encodings. |
| `inject-android-native.sh` | Copies `native/android/*.kt` into Capacitor project before Android build (CI + local). |
| `patch-android-build.mjs` | Patches generated Android Gradle/Kotlin config (warnings, deps). |
| `upgrade-android-build-deps.mjs` | Points Android Gradle wrapper + related deps at latest stable GA (CI + local). |
| `upgrade-ci-toolchain.mjs` | Audits Node/Rust/CI action policy; `--check` for CI gate; `--sync-node` to bump `.node-version`. |
| `generate-android-keystore.sh` | One-time release keystore generation for signed APK upgrades. |
| `lib/mavenLatest.mjs`, `lib/androidSdkGradle.mjs` | Shared helpers for Android dep resolution scripts. |

