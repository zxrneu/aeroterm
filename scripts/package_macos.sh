#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

echo "=== 1. Building Frontend Assets (apps/web-ui) ==="
cd "$DIR/apps/web-ui"
npm run build

echo "=== 2. Building Release Rust Binary ==="
cd "$DIR"
cargo build --release -p terminal-desktop

BUNDLE_DIR="$DIR/target/bundle/osx"
APP_DIR="$BUNDLE_DIR/TerminalPro.app"
rm -rf "$BUNDLE_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources/web-ui"

echo "=== 3. Constructing macOS App Bundle ==="
cp "$DIR/target/release/terminal-desktop" "$APP_DIR/Contents/MacOS/TerminalPro-bin"
cp -r "$DIR/apps/web-ui/dist/"* "$APP_DIR/Contents/Resources/web-ui/"

# Create native launcher script that starts the backend and opens webview/browser
cat << 'LAUNCHER' > "$APP_DIR/Contents/MacOS/TerminalPro"
#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
export CARGO_MANIFEST_DIR="$DIR/Resources"

# Start backend gateway daemon
"$DIR/MacOS/TerminalPro-bin" &
PID=$!

# Wait briefly for port 12335 to be ready
for i in {1..20}; do
  if curl -s http://127.0.0.1:12335/ >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

# Open application in default browser / webview window
open "http://127.0.0.1:12335"

# Wait for process
wait $PID
LAUNCHER
chmod +x "$APP_DIR/Contents/MacOS/TerminalPro"

# Write Info.plist
cat << 'PLIST' > "$APP_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>TerminalPro</string>
    <key>CFBundleIdentifier</key>
    <string>cn.terminalpro.workstation</string>
    <key>CFBundleName</key>
    <string>TerminalPro</string>
    <key>CFBundleDisplayName</key>
    <string>TerminalPro</string>
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
</dict>
</plist>
PLIST

echo "=== 4. Packaging DMG Installer ==="
DMG_STAGE="$DIR/target/dmg_stage"
rm -rf "$DMG_STAGE"
mkdir -p "$DMG_STAGE"
cp -r "$APP_DIR" "$DMG_STAGE/"
ln -s /Applications "$DMG_STAGE/Applications"

DMG_OUTPUT="$DIR/target/TerminalPro_v0.1.0_macOS.dmg"
rm -f "$DMG_OUTPUT"

hdiutil create -volname "TerminalPro Workstation" \
  -srcfolder "$DMG_STAGE" \
  -ov -format UDZO \
  "$DMG_OUTPUT"

echo "=== Package Complete! ==="
echo "App Bundle: $APP_DIR"
echo "DMG Installer: $DMG_OUTPUT"
ls -lh "$DMG_OUTPUT"
