#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
APP_NAME="Bilberry"
BINARY_NAME="bilberry"
IDENTIFIER="com.bilberry.desktop"
VERSION="${1:-0.1.0}"
ARCH="${2:-amd64}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/target/deb"
PACKAGE_DIR="$BUILD_DIR/${BINARY_NAME}_${VERSION}_${ARCH}"

echo "==> Packaging ${APP_NAME} v${VERSION} for ${ARCH}"

# ── 1. Build frontend ────────────────────────────────────────────────────────
echo "==> Building frontend..."
cd "$PROJECT_DIR"
npm run build

# ── 2. Build Rust binary ─────────────────────────────────────────────────────
echo "==> Building Rust binary for release..."
cd "$PROJECT_DIR/src-tauri"
if [ "$ARCH" = "arm64" ]; then
    TARGET="aarch64-unknown-linux-gnu"
else
    TARGET="x86_64-unknown-linux-gnu"
fi

# Check if cross-compilation target is installed
if ! rustup target list --installed | grep -q "$TARGET"; then
    echo "==> Installing target $TARGET..."
    rustup target add "$TARGET"
fi

cargo build --release --target "$TARGET"

BINARY_SRC="$PROJECT_DIR/src-tauri/target/${TARGET}/release/${BINARY_NAME}"

# ── 3. Create .deb directory structure ────────────────────────────────────────
echo "==> Assembling .deb package..."
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/DEBIAN"
mkdir -p "$PACKAGE_DIR/usr/bin"
mkdir -p "$PACKAGE_DIR/usr/share/applications"
mkdir -p "$PACKAGE_DIR/usr/share/icons/hicolor/128x128/apps"
mkdir -p "$PACKAGE_DIR/usr/share/icons/hicolor/256x256@2/apps"

# ── 4. Copy binary ───────────────────────────────────────────────────────────
cp "$BINARY_SRC" "$PACKAGE_DIR/usr/bin/${BINARY_NAME}"
chmod 755 "$PACKAGE_DIR/usr/bin/${BINARY_NAME}"
# Strip debug symbols to reduce binary size
strip "$PACKAGE_DIR/usr/bin/${BINARY_NAME}" 2>/dev/null || true

# ── 5. Copy icons ────────────────────────────────────────────────────────────
cp "$PROJECT_DIR/src-tauri/icons/128x128.png" \
    "$PACKAGE_DIR/usr/share/icons/hicolor/128x128/apps/${BINARY_NAME}.png"
cp "$PROJECT_DIR/src-tauri/icons/128x128@2x.png" \
    "$PACKAGE_DIR/usr/share/icons/hicolor/256x256@2/apps/${BINARY_NAME}.png"

# ── 6. Create .desktop file ──────────────────────────────────────────────────
cat > "$PACKAGE_DIR/usr/share/applications/${IDENTIFIER}.desktop" << DESKTOP
[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=Markdown note editor
Exec=/usr/bin/${BINARY_NAME}
Icon=${BINARY_NAME}
Terminal=false
Categories=Office;TextEditor;Utility;
MimeType=text/markdown;
X-Purpose=${IDENTIFIER}
DESKTOP
chmod 644 "$PACKAGE_DIR/usr/share/applications/${IDENTIFIER}.desktop"

# ── 7. Create DEBIAN/control ─────────────────────────────────────────────────
# Estimate installed size in KB
INSTALLED_SIZE=$(du -sk "$PACKAGE_DIR" | cut -f1)

cat > "$PACKAGE_DIR/DEBIAN/control" << CONTROL
Package: ${BINARY_NAME}
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: Bilberry Authors
Installed-Size: ${INSTALLED_SIZE}
Depends: libwebkit2gtk-4.1-0, libgtk-3-0, libayatana-appindicator3-1 | libappindicator3-1, libjavascriptcoregtk-4.1-0, libsoup-3.0-0, libglib2.0-0
Section: editors
Priority: optional
Homepage: https://github.com/nicedoc/bilberry
Description: Markdown note editor
 Bilberry is a desktop Markdown note editor with live preview,
 full-text search, wiki-link support, and multi-encoding support
 (UTF-8, GB18030, Big5, Shift_JIS, etc.).
CONTROL
chmod 644 "$PACKAGE_DIR/DEBIAN/control"

# ── 8. Build .deb package ────────────────────────────────────────────────────
echo "==> Building .deb..."
dpkg-deb --build "$PACKAGE_DIR" "$BUILD_DIR"

DEB_FILE="${BUILD_DIR}/${BINARY_NAME}_${VERSION}_${ARCH}.deb"
if [ -f "$DEB_FILE" ]; then
    SIZE=$(du -h "$DEB_FILE" | cut -f1)
    echo "==> Done: $DEB_FILE ($SIZE)"
else
    echo "ERROR: .deb was not created" >&2
    exit 1
fi
