#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

echo "=== 1. Checking / Building Frontend Assets (apps/web-ui) ==="
if [ ! -f "$DIR/apps/web-ui/dist/index.html" ]; then
    cd "$DIR/apps/web-ui"
    if command -v pnpm >/dev/null 2>&1; then
        pnpm run build
    else
        npm run build
    fi
    cd "$DIR"
fi

echo "=== 2. Building Release Rust Binary (terminal-desktop) ==="
cd "$DIR"
cargo build --release -p terminal-desktop

BUNDLE_DIR="$DIR/target/bundle/osx"
APP_DIR="$BUNDLE_DIR/AeroTerm.app"
rm -rf "$BUNDLE_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources/web-ui"

echo "=== 3. Compiling Native Cocoa WebKit Workstation Window ==="
/usr/bin/clang -fobjc-arc -O3 -framework Cocoa -framework WebKit \
  "$DIR/apps/desktop/resources/main.m" \
  -o "$APP_DIR/Contents/MacOS/AeroTerm"
chmod +x "$APP_DIR/Contents/MacOS/AeroTerm"

echo "=== 4. Embedding Rust Backend Daemon ==="
cp "$DIR/target/release/terminal-desktop" "$APP_DIR/Contents/MacOS/AeroTerm-backend"
chmod +x "$APP_DIR/Contents/MacOS/AeroTerm-backend"

# Copy Icon and static assets
if [ -f "$DIR/apps/desktop/resources/AppIcon.icns" ]; then
    cp "$DIR/apps/desktop/resources/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
fi
cp -r "$DIR/apps/web-ui/dist/"* "$APP_DIR/Contents/Resources/web-ui/"

# Write Info.plist with AppKit & ATS configuration
cat << 'PLIST' > "$APP_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>AeroTerm</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>cn.aeroterm.workstation</string>
    <key>CFBundleName</key>
    <string>AeroTerm</string>
    <key>CFBundleDisplayName</key>
    <string>AeroTerm</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSupportsAutomaticGraphicsSwitching</key>
    <true/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
        <key>NSAllowsArbitraryLoads</key>
        <true/>
    </dict>
</dict>
</plist>
PLIST

echo "=== 5. Code Signing (Ad-hoc) and Clearing Extended Attributes ==="
/usr/bin/xattr -cr "$APP_DIR" || true
/usr/bin/codesign --force --deep -s - "$APP_DIR"

echo "=== 6. Packaging DMG Installer ==="
DMG_STAGE="$DIR/target/dmg_stage"
rm -rf "$DMG_STAGE"
mkdir -p "$DMG_STAGE"
cp -r "$APP_DIR" "$DMG_STAGE/"
ln -s /Applications "$DMG_STAGE/Applications"

DMG_OUTPUT="$DIR/target/AeroTerm_v0.1.0_macOS.dmg"
rm -f "$DMG_OUTPUT"

hdiutil create -volname "AeroTerm Workstation" \
  -srcfolder "$DMG_STAGE" \
  -ov -format UDZO \
  "$DMG_OUTPUT"

echo "=== Packaging Complete! ==="
echo "App Bundle: $APP_DIR"
echo "DMG Installer: $DMG_OUTPUT"
ls -lh "$DMG_OUTPUT"
