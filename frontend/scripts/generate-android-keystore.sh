#!/usr/bin/env bash
# ./frontend/scripts/generate-android-keystore.sh
# One-time release keystore for consistent Android sideload upgrades.
# Store the resulting file as GitHub secret ANDROID_KEYSTORE_BASE64 (base64 -w0 the .jks).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/android/keystore"
OUT_FILE="$OUT_DIR/sidekick-release.jks"

mkdir -p "$OUT_DIR"

if [[ -f "$OUT_FILE" ]]; then
  echo "Keystore already exists: $OUT_FILE"
  exit 0
fi

ALIAS="${SIDEKICK_ANDROID_KEY_ALIAS:-sidekick}"
STORE_PASS="${SIDEKICK_ANDROID_KEYSTORE_PASSWORD:-change-me-sidekick}"
KEY_PASS="${SIDEKICK_ANDROID_KEY_PASSWORD:-$STORE_PASS}"

keytool -genkeypair -v \
  -keystore "$OUT_FILE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
  -dname "CN=Roy Dawson IV, OU=Portfolio Sidekick, O=ImYourBoyRoy, L=Local, ST=NA, C=US"

echo "Created $OUT_FILE"
echo "Add to GitHub Actions secrets:"
echo "  ANDROID_KEYSTORE_BASE64=$(base64 -w0 "$OUT_FILE" 2>/dev/null || base64 < "$OUT_FILE" | tr -d '\n')"
echo "  ANDROID_KEYSTORE_PASSWORD=$STORE_PASS"
echo "  ANDROID_KEY_ALIAS=$ALIAS"
echo "  ANDROID_KEY_PASSWORD=$KEY_PASS"
