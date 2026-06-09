#!/usr/bin/env bash
# ./frontend/scripts/inject-android-native.sh
# Injects Kotlin native Robinhood vault plugin and security hardening into the
# Capacitor Android project. Requires `npx cap sync android` first.
# AGP/Kotlin/AndroidX versions are refreshed afterward by upgrade-android-build-deps.mjs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$ROOT/android/app/src/main/java/com/imyourboyroy/portfoliosidekick"
mkdir -p "$PKG_DIR" "$ROOT/android/app/src/main/res/xml"
cp "$ROOT/native/android/"*.kt "$PKG_DIR/"
cp "$ROOT/native/android/network_security_config.xml" "$ROOT/android/app/src/main/res/xml/network_security_config.xml"

APP_GRADLE="$ROOT/android/app/build.gradle"
if ! grep -q "security-crypto" "$APP_GRADLE"; then
  sed -i "/dependencies {/a\    implementation \"org.jetbrains.kotlin:kotlin-stdlib:2.1.0\"\n    implementation \"com.squareup.okhttp3:okhttp:4.12.0\"\n    implementation \"androidx.security:security-crypto:1.1.0-alpha06\"" "$APP_GRADLE"
fi

cat > "$PKG_DIR/MainActivity.java" <<'JAVA'
package com.imyourboyroy.portfoliosidekick;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RobinhoodSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
JAVA

MANIFEST="$ROOT/android/app/src/main/AndroidManifest.xml"
sed -i 's/android:allowBackup="true"/android:allowBackup="false"/' "$MANIFEST"
if ! grep -q 'networkSecurityConfig' "$MANIFEST"; then
  sed -i '0,/<application/s|<application|<application android:networkSecurityConfig="@xml/network_security_config" android:fullBackupContent="false"|' "$MANIFEST"
fi

echo "Android native plugin injected (Kotlin/AGP versions refreshed by upgrade-android-build-deps.mjs)."
