#!/usr/bin/env bash
# ./frontend/scripts/inject-android-native.sh
# Injects Kotlin native Robinhood vault plugin and security hardening into the
# Capacitor Android project. Requires `npx cap sync android` first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$ROOT/android/app/src/main/java/com/imyourboyroy/portfoliosidekick"
KOTLIN_VERSION="${KOTLIN_VERSION:-2.1.0}"

mkdir -p "$PKG_DIR" "$ROOT/android/app/src/main/res/xml"
cp "$ROOT/native/android/"*.kt "$PKG_DIR/"
cp "$ROOT/native/android/network_security_config.xml" "$ROOT/android/app/src/main/res/xml/network_security_config.xml"

PROJECT_GRADLE="$ROOT/android/build.gradle"
if ! grep -q "kotlin-gradle-plugin" "$PROJECT_GRADLE"; then
  sed -i "/classpath 'com.android.tools.build:gradle/a\        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}'" "$PROJECT_GRADLE"
else
  sed -i "s/kotlin-gradle-plugin:[0-9.]\+/kotlin-gradle-plugin:${KOTLIN_VERSION}/" "$PROJECT_GRADLE"
fi

APP_GRADLE="$ROOT/android/app/build.gradle"
if ! grep -q "kotlin-android" "$APP_GRADLE"; then
  sed -i "1a apply plugin: 'kotlin-android'" "$APP_GRADLE"
fi

if ! grep -q "security-crypto" "$APP_GRADLE"; then
  sed -i "/dependencies {/a\    implementation \"org.jetbrains.kotlin:kotlin-stdlib:${KOTLIN_VERSION}\"\n    implementation \"com.squareup.okhttp3:okhttp:4.12.0\"\n    implementation \"androidx.security:security-crypto:1.1.0-alpha06\"" "$APP_GRADLE"
else
  sed -i "s/kotlin-stdlib:[0-9.]\+/kotlin-stdlib:${KOTLIN_VERSION}/" "$APP_GRADLE"
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

echo "Android native plugin injected (Kotlin ${KOTLIN_VERSION})."
