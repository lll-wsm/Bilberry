#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
APP_NAME="Bilberry"
BINARY_NAME="bilberry"
VERSION="${1:-0.1.0}"
ARCH="${2:-amd64}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/target/deb"

echo "==> Packaging ${APP_NAME} v${VERSION} for ${ARCH}"

# ── 1. Set up cross-compilation target if needed ─────────────────────────────
if [ "$ARCH" = "arm64" ]; then
    TARGET="aarch64-unknown-linux-gnu"
else
    TARGET="x86_64-unknown-linux-gnu"
fi

if ! rustup target list --installed | grep -q "$TARGET"; then
    echo "==> Installing target $TARGET..."
    rustup target add "$TARGET"
fi

# ── 2. Build with Tauri CLI (properly embeds frontend) ───────────────────────
echo "==> Building release with Tauri..."
cd "$PROJECT_DIR"
npm run tauri build -- --target "$TARGET" --bundles deb

# ── 3. Copy .deb to output directory ─────────────────────────────────────────
# Tauri outputs .deb to src-tauri/target/<target>/release/bundle/deb/
BUNDLE_DIR="$PROJECT_DIR/src-tauri/target/${TARGET}/release/bundle/deb"
DEB_FILE=$(ls "$BUNDLE_DIR/${BINARY_NAME}_${VERSION}"_*.deb 2>/dev/null | head -1)

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

if [ -f "$DEB_FILE" ]; then
    cp "$DEB_FILE" "$BUILD_DIR/"
    SIZE=$(du -h "$DEB_FILE" | cut -f1)
    echo "==> Done: $BUILD_DIR/$(basename "$DEB_FILE") ($SIZE)"
else
    echo "ERROR: .deb was not found in $BUNDLE_DIR" >&2
    echo "Contents of bundle dir:" >&2
    ls -la "$BUNDLE_DIR" 2>/dev/null || echo "(directory does not exist)" >&2
    exit 1
fi
