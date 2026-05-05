#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
APP_NAME="Bilberry"
IDENTIFIER="com.bilberry.desktop"
VERSION="${1:-0.1.0}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_DIR/target/mac-pkg"

# Optional: set APPLE_SIGNING_IDENTITY, APPLE_TEAM_ID, APPLE_ID,
# APPLE_APP_PASSWORD env vars for signing and notarization.
SIGN_IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_ID="${APPLE_ID:-}"
APPLE_PASSWORD="${APPLE_APP_PASSWORD:-}"

echo "==> Packaging ${APP_NAME} v${VERSION} for macOS"

# ── 1. Build ──────────────────────────────────────────────────────────────────
echo "==> Building release..."
cd "$PROJECT_DIR"
npm run tauri build

BUILT_APP="$PROJECT_DIR/src-tauri/target/release/bundle/macos/${APP_NAME}.app"
# DMG filename includes architecture suffix (aarch64/x64), find it with a glob
BUILT_DMG=$(ls "$PROJECT_DIR/src-tauri/target/release/bundle/dmg/${APP_NAME}_${VERSION}"_*.dmg 2>/dev/null | head -1)

# ── 2. Code sign (optional) ───────────────────────────────────────────────────
if [ -n "$SIGN_IDENTITY" ]; then
    echo "==> Code signing with identity: $SIGN_IDENTITY"

    # Sign all framework binaries and dylibs
    find "$BUILT_APP/Contents/Frameworks" -type f \( -perm +111 -o -name "*.dylib" \) 2>/dev/null |
    while read -r f; do
        codesign --force --options runtime --timestamp --sign "$SIGN_IDENTITY" "$f" 2>/dev/null || true
    done

    # Sign the main binary
    codesign --force --options runtime --timestamp --deep --sign "$SIGN_IDENTITY" "$BUILT_APP"

    echo "==> Verifying signature..."
    codesign --verify --deep --strict "$BUILT_APP"
else
    echo "==> Skipping code signing (set APPLE_SIGNING_IDENTITY to sign)"
fi

# ── 3. Notarize (optional) ────────────────────────────────────────────────────
if [ -n "$APPLE_ID" ] && [ -n "$APPLE_PASSWORD" ] && [ -n "$TEAM_ID" ]; then
    echo "==> Submitting for notarization..."

    # Re-zip for notarization submission
    NOTARIZE_ZIP="$OUTPUT_DIR/${APP_NAME}_${VERSION}_notarize.zip"
    rm -rf "$OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
    ditto -c -k --keepParent "$BUILT_APP" "$NOTARIZE_ZIP"

    xcrun notarytool submit "$NOTARIZE_ZIP" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_PASSWORD" \
        --team-id "$TEAM_ID" \
        --wait

    # Staple the ticket
    xcrun stapler staple "$BUILT_APP"
    echo "==> Notarization complete"
elif [ -n "$APPLE_ID" ]; then
    echo "==> Skipping notarization (set APPLE_APP_PASSWORD and APPLE_TEAM_ID as well)"
else
    echo "==> Skipping notarization (set APPLE_ID to notarize)"
fi

# ── 4. Copy artifacts ─────────────────────────────────────────────────────────
echo "==> Copying artifacts to $OUTPUT_DIR"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Zip the .app (common distribution format)
APP_ZIP="${APP_NAME}_${VERSION}_macOS.zip"
echo "==> Creating $APP_ZIP..."
ditto -c -k --keepParent "$BUILT_APP" "$OUTPUT_DIR/$APP_ZIP"

# Copy the DMG if it exists
if [ -f "$BUILT_DMG" ]; then
    DMG_OUT="${APP_NAME}_${VERSION}.dmg"
    cp "$BUILT_DMG" "$OUTPUT_DIR/$DMG_OUT"
    echo "==> DMG: $OUTPUT_DIR/$DMG_OUT"
fi

# Write checksums
echo "==> Generating checksums..."
cd "$OUTPUT_DIR"
shasum -a 256 * > "SHA256SUMS"

echo "==> Done:"
ls -lh "$OUTPUT_DIR"
echo ""
echo "SHA256SUMS:"
cat "$OUTPUT_DIR/SHA256SUMS"
