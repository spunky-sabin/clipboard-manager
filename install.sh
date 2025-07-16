#!/bin/bash

# GNOME Shell Clipboard Manager Extension Installer
# This script installs the clipboard manager extension for GNOME Shell

set -e

EXTENSION_UUID="clipboard-manager"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
SCHEMA_DIR="$EXTENSION_DIR/schemas"

echo "Installing GNOME Shell Clipboard Manager Extension..."

# Create extension directory
mkdir -p "$EXTENSION_DIR"
mkdir -p "$SCHEMA_DIR"

# Copy files
echo "Copying extension files..."

# Copy main extension file
cat > "$EXTENSION_DIR/extension.js" << 'EOF'
// The extension.js content goes here
// (Copy the entire JavaScript code from the first artifact)
EOF

# Copy metadata
cat > "$EXTENSION_DIR/metadata.json" << 'EOF'
{
    "uuid": "clipboard-manager",
    "name": "Clipboard Manager",
    "description": "Windows-style clipboard manager with history and keyboard shortcuts. Press Super+V to access clipboard history.",
    "version": "1.0",
    "shell-version": [
        "3.36",
        "3.38",
        "40",
        "41",
        "42",
        "43",
        "44",
        "45",
        "48.3"
    ],
    "url": "https://github.com/spunky-sabin/clipboard-manager",
    "gettext-domain": "clipboard-manager",
    "settings-schema": "org.gnome.shell.extensions.clipboard-manager"
}
EOF

# Copy schema
cat > "$SCHEMA_DIR/org.gnome.shell.extensions.clipboard-manager.gschema.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
    <schema id="org.gnome.shell.extensions.clipboard-manager" path="/org/gnome/shell/extensions/clipboard-manager/">
        <key name="toggle-clipboard" type="as">
            <default>['<Super>v']</default>
            <summary>Toggle clipboard history</summary>
            <description>Keyboard shortcut to toggle the clipboard history panel</description>
        </key>
        <key name="history-size" type="i">
            <default>10</default>
            <range min="5" max="50"/>
            <summary>Clipboard history size</summary>
            <description>Maximum number of clipboard items to store</description>
        </key>
        <key name="enable-panel-icon" type="b">
            <default>true</default>
            <summary>Show panel icon</summary>
            <description>Whether to show the clipboard manager icon in the top panel</description>
        </key>
    </schema>
</schemalist>
EOF

# Compile schema
echo "Compiling GSettings schema..."
if command -v glib-compile-schemas &> /dev/null; then
    glib-compile-schemas "$SCHEMA_DIR"
else
    echo "Warning: glib-compile-schemas not found. You may need to install it."
    echo "On Ubuntu/Debian: sudo apt install libglib2.0-dev"
    echo "On Fedora: sudo dnf install glib2-devel"
fi

echo "Installation complete!"
echo ""
echo "To enable the extension:"
echo "1. Restart GNOME Shell (Alt+F2, type 'r', press Enter)"
echo "2. Open Extensions app or run: gnome-extensions enable $EXTENSION_UUID"
echo ""
echo "Usage:"
echo "- Press Super+V to open clipboard history"
echo "- Click the clipboard icon in the top panel"
echo "- Click any item to copy it to clipboard"
echo ""
echo "To uninstall:"
echo "rm -rf '$EXTENSION_DIR'"

# Check if extension can be enabled
if command -v gnome-extensions &> /dev/null; then
    echo "Attempting to enable extension..."
    gnome-extensions enable "$EXTENSION_UUID" || echo "Please enable manually using the Extensions app"
else
    echo "Please restart GNOME Shell and enable the extension manually"
fi