#!/bin/bash

# AI CLI Orchestrator - macOS DMG Creator
# Creates a distributable DMG file for macOS

set -e

APP_NAME="AI CLI Orchestrator"
VERSION="1.0.0"
DMG_NAME="orchestrator-setup"
BUNDLE_NAME="Orchestrator.app"
BUNDLE_ID="com.orchestrator.app"

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/../backend/dist"
DMG_DIR="$SCRIPT_DIR/../dist/macos"
TEMP_DIR="$SCRIPT_DIR/temp_dmg"
WORKSPACE_TEMPLATES="$SCRIPT_DIR/../workspace"

echo "🚀 Building macOS DMG for ${APP_NAME} v${VERSION}"
echo "=================================================="

# Clean previous builds
echo ""
echo "🧹 Cleaning previous builds..."
rm -rf "$TEMP_DIR"
rm -f "$DMG_DIR/$DMG_NAME.dmg"
mkdir -p "$DMG_DIR"
mkdir -p "$TEMP_DIR"

# Check if backend executable exists
if [ ! -f "$BUILD_DIR/orchestrator-backend" ] && [ ! -d "$BUILD_DIR/Orchestrator.app" ]; then
    echo "❌ Backend executable not found!"
    echo "   Build backend first with: cd ../backend && python build_backend.py"
    exit 1
fi

echo "✓ Backend executable found"

# Create app bundle structure
echo ""
echo "📦 Creating app bundle..."
mkdir -p "$TEMP_DIR/$BUNDLE_NAME/Contents/MacOS"
mkdir -p "$TEMP_DIR/$BUNDLE_NAME/Contents/Resources"
mkdir -p "$TEMP_DIR/$BUNDLE_NAME/Contents/Frameworks"

# Copy executable
if [ -d "$BUILD_DIR/Orchestrator.app" ]; then
    # PyInstaller created an app bundle
    echo "  Copying PyInstaller app bundle..."
    cp -R "$BUILD_DIR/Orchestrator.app/"* "$TEMP_DIR/$BUNDLE_NAME/"
else
    # Copy standalone executable
    echo "  Copying standalone executable..."
    cp "$BUILD_DIR/orchestrator-backend" "$TEMP_DIR/$BUNDLE_NAME/Contents/MacOS/"
    chmod +x "$TEMP_DIR/$BUNDLE_NAME/Contents/MacOS/orchestrator-backend"
fi

# Copy or create icon
if [ -f "$SCRIPT_DIR/icon.icns" ]; then
    cp "$SCRIPT_DIR/icon.icns" "$TEMP_DIR/$BUNDLE_NAME/Contents/Resources/"
    echo "  ✓ Icon copied"
else
    echo "  ⚠ Icon not found, using default"
fi

# Create or update Info.plist
cat > "$TEMP_DIR/$BUNDLE_NAME/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>orchestrator-backend</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSRequiresAquaSystemAppearance</key>
    <false/>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.developer-tools</string>
</dict>
</plist>
EOF

echo "  ✓ Info.plist created"

# Create Applications symlink
echo ""
echo "🔗 Creating Applications symlink..."
ln -s /Applications "$TEMP_DIR/Applications"

# Copy workspace templates to a Resources folder in the DMG
echo ""
echo "📄 Copying workspace templates..."
mkdir -p "$TEMP_DIR/Workspace Templates"
if [ -d "$WORKSPACE_TEMPLATES" ]; then
    cp "$WORKSPACE_TEMPLATES"/*.template "$TEMP_DIR/Workspace Templates/" 2>/dev/null || true
    echo "  ✓ Templates copied"
else
    echo "  ⚠ Workspace templates not found"
fi

# Copy README
if [ -f "$PROJECT_ROOT/README.md" ]; then
    cp "$PROJECT_ROOT/README.md" "$TEMP_DIR/"
    echo "  ✓ README copied"
fi

# Copy LICENSE
if [ -f "$PROJECT_ROOT/LICENSE" ]; then
    cp "$PROJECT_ROOT/LICENSE" "$TEMP_DIR/"
    echo "  ✓ LICENSE copied"
fi

# Create DMG
echo ""
echo "💿 Creating DMG..."

# Calculate size needed (in MB)
SIZE=$(du -sm "$TEMP_DIR" | awk '{print $1}')
SIZE=$((SIZE + 50))  # Add 50MB buffer

echo "  DMG size: ${SIZE}MB"

# Create temporary DMG
hdiutil create -volname "$APP_NAME" \
    -srcfolder "$TEMP_DIR" \
    -ov -format UDRW \
    -size ${SIZE}m \
    "$DMG_DIR/temp.dmg"

# Mount the DMG
echo "  Mounting DMG..."
MOUNT_DIR=$(hdiutil attach "$DMG_DIR/temp.dmg" | grep Volumes | awk '{print $3}')

# Set DMG window properties (optional, requires AppleScript)
if command -v osascript &> /dev/null; then
    echo "  Setting DMG window properties..."
    osascript << EOF
tell application "Finder"
    tell disk "$APP_NAME"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {100, 100, 600, 400}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 72
        set position of item "$BUNDLE_NAME" of container window to {150, 150}
        set position of item "Applications" of container window to {350, 150}
        close
        open
        update without registering applications
        delay 2
    end tell
end tell
EOF
fi

# Unmount
echo "  Unmounting DMG..."
hdiutil detach "$MOUNT_DIR" -quiet

# Convert to compressed DMG
echo "  Compressing DMG..."
hdiutil convert "$DMG_DIR/temp.dmg" \
    -format UDZO \
    -o "$DMG_DIR/$DMG_NAME.dmg"

# Remove temporary DMG
rm "$DMG_DIR/temp.dmg"

# Cleanup
echo ""
echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"

# Get final size
FINAL_SIZE=$(du -h "$DMG_DIR/$DMG_NAME.dmg" | awk '{print $1}')

echo ""
echo "=================================================="
echo "✅ DMG created successfully!"
echo "=================================================="
echo ""
echo "Location: $DMG_DIR/$DMG_NAME.dmg"
echo "Size: $FINAL_SIZE"
echo ""
echo "Next steps:"
echo "  1. Test the DMG on a clean macOS system"
echo "  2. Verify the app launches correctly"
echo "  3. Sign the app (optional): codesign -s 'Developer ID' Orchestrator.app"
echo "  4. Notarize the app (optional): xcrun notarytool submit"
echo "  5. Upload to download server"
echo ""

# Made with Bob
