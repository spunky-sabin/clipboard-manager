// extension.js
const { GObject, St, Clutter, Meta, Shell, Gio } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;

const CLIPBOARD_HISTORY_SIZE = 10;

let clipboardManager = null;

// Clipboard History Panel
var ClipboardHistoryPanel = GObject.registerClass({
    GTypeName: 'ClipboardHistoryPanel'
}, class ClipboardHistoryPanel extends St.BoxLayout {
    _init() {
        super._init({
            vertical: true,
            style_class: 'clipboard-history-panel',
            visible: false,
            reactive: true,
            can_focus: true
        });

        this._clipboardHistory = [];
        this._setupUI();
        this._setupClipboardMonitoring();
    }

    _setupUI() {
        // Header
        let header = new St.BoxLayout({
            style_class: 'clipboard-history-header',
            vertical: false
        });
        
        let title = new St.Label({
            text: 'Clipboard History',
            style_class: 'clipboard-history-title'
        });
        
        let clearButton = new St.Button({
            label: 'Clear All',
            style_class: 'clipboard-clear-button',
            can_focus: true
        });
        
        clearButton.connect('clicked', () => {
            this._clearHistory();
        });
        
        header.add_child(title);
        header.add_child(clearButton);
        this.add_child(header);

        // Scrollable content area
        this._scrollView = new St.ScrollView({
            style_class: 'clipboard-history-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC
        });
        
        this._contentBox = new St.BoxLayout({
            vertical: true,
            style_class: 'clipboard-history-content'
        });
        
        this._scrollView.add_actor(this._contentBox);
        this.add_child(this._scrollView);

        // Empty state
        this._emptyLabel = new St.Label({
            text: 'No clipboard history yet',
            style_class: 'clipboard-empty-label'
        });
        this._contentBox.add_child(this._emptyLabel);
    }

    _setupClipboardMonitoring() {
        this._clipboard = St.Clipboard.get_default();
        this._clipboardChangedId = null;
        
        // Monitor clipboard changes
        this._startMonitoring();
    }

    _startMonitoring() {
        if (this._clipboardChangedId) {
            return;
        }

        // Poll clipboard every 500ms
        this._clipboardChangedId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._checkClipboard();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopMonitoring() {
        if (this._clipboardChangedId) {
            GLib.source_remove(this._clipboardChangedId);
            this._clipboardChangedId = null;
        }
    }

    _checkClipboard() {
        this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            if (text && text.trim() && text !== this._lastClipboardText) {
                this._lastClipboardText = text;
                this._addToHistory(text);
            }
        });
    }

    _addToHistory(text) {
        // Remove duplicates
        this._clipboardHistory = this._clipboardHistory.filter(item => item !== text);
        
        // Add to beginning
        this._clipboardHistory.unshift(text);
        
        // Limit history size
        if (this._clipboardHistory.length > CLIPBOARD_HISTORY_SIZE) {
            this._clipboardHistory = this._clipboardHistory.slice(0, CLIPBOARD_HISTORY_SIZE);
        }
        
        this._updateUI();
    }

    _updateUI() {
        // Clear existing items
        this._contentBox.remove_all_children();
        
        if (this._clipboardHistory.length === 0) {
            this._contentBox.add_child(this._emptyLabel);
            return;
        }

        // Add history items
        this._clipboardHistory.forEach((text, index) => {
            let item = this._createHistoryItem(text, index);
            this._contentBox.add_child(item);
        });
    }

    _createHistoryItem(text, index) {
        let item = new St.Button({
            style_class: 'clipboard-history-item',
            can_focus: true,
            x_fill: true
        });

        let itemBox = new St.BoxLayout({
            vertical: true,
            style_class: 'clipboard-item-box'
        });

        // Preview text (truncated)
        let previewText = text.length > 100 ? text.substring(0, 100) + '...' : text;
        let label = new St.Label({
            text: previewText,
            style_class: 'clipboard-item-text'
        });

        // Item info
        let infoLabel = new St.Label({
            text: `${index + 1}. ${text.length} characters`,
            style_class: 'clipboard-item-info'
        });

        itemBox.add_child(label);
        itemBox.add_child(infoLabel);
        item.set_child(itemBox);

        item.connect('clicked', () => {
            this._copyToClipboard(text);
            this.hide();
        });

        return item;
    }

    _copyToClipboard(text) {
        this._clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
        
        // Show notification
        let notification = new MessageTray.Notification(
            null,
            'Clipboard Manager',
            'Text copied to clipboard'
        );
        Main.messageTray.add(notification);
    }

    _clearHistory() {
        this._clipboardHistory = [];
        this._updateUI();
    }

    show() {
        this.visible = true;
        this.grab_key_focus();
    }

    hide() {
        this.visible = false;
    }

    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    destroy() {
        this._stopMonitoring();
        super.destroy();
    }
});

// Panel Indicator
var ClipboardIndicator = GObject.registerClass({
    GTypeName: 'ClipboardIndicator'
}, class ClipboardIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Clipboard Manager');

        this._icon = new St.Icon({
            icon_name: 'edit-copy-symbolic',
            style_class: 'system-status-icon'
        });
        
        this.add_child(this._icon);

        this.connect('button-press-event', () => {
            clipboardManager.toggle();
        });
    }
});

// Main Extension Class
class ClipboardManagerExtension {
    constructor() {
        this._indicator = null;
        this._panel = null;
        this._keyBindingId = null;
    }

    enable() {
        // Create panel indicator
        this._indicator = new ClipboardIndicator();
        Main.panel.addToStatusArea('clipboard-manager', this._indicator);

        // Create clipboard history panel
        this._panel = new ClipboardHistoryPanel();
        
        // Add panel to UI group
        Main.uiGroup.add_child(this._panel);
        
        // Position panel
        this._updatePanelPosition();
        
        // Connect to monitor changes
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._updatePanelPosition();
        });

        // Setup keyboard shortcut
        this._setupKeyBinding();

        // Handle clicks outside panel to close it
        this._stageKeyPressId = global.stage.connect('key-press-event', (actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape && this._panel.visible) {
                this._panel.hide();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this._stageButtonPressId = global.stage.connect('button-press-event', (actor, event) => {
            if (this._panel.visible && !this._panel.contains(event.get_source())) {
                this._panel.hide();
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    disable() {
        // Remove keyboard shortcut
        if (this._keyBindingId) {
            Main.wm.removeKeybinding('clipboard-manager-toggle');
            this._keyBindingId = null;
        }

        // Disconnect signals
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        if (this._stageKeyPressId) {
            global.stage.disconnect(this._stageKeyPressId);
            this._stageKeyPressId = null;
        }

        if (this._stageButtonPressId) {
            global.stage.disconnect(this._stageButtonPressId);
            this._stageButtonPressId = null;
        }

        // Remove panel
        if (this._panel) {
            Main.uiGroup.remove_child(this._panel);
            this._panel.destroy();
            this._panel = null;
        }

        // Remove indicator
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _updatePanelPosition() {
        if (!this._panel) return;

        let monitor = Main.layoutManager.primaryMonitor;
        let panelHeight = Math.min(600, monitor.height * 0.8);
        let panelWidth = Math.min(400, monitor.width * 0.3);

        this._panel.set_size(panelWidth, panelHeight);
        this._panel.set_position(
            monitor.x + (monitor.width - panelWidth) / 2,
            monitor.y + (monitor.height - panelHeight) / 2
        );
    }

    _setupKeyBinding() {
        Main.wm.addKeybinding(
            'clipboard-manager-toggle',
            new Gio.Settings({ schema: 'org.gnome.desktop.wm.keybindings' }),
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => {
                this.toggle();
            }
        );
    }

    toggle() {
        if (this._panel) {
            this._panel.toggle();
        }
    }
}

function init() {
    return new ClipboardManagerExtension();
}

function enable() {
    clipboardManager = init();
    clipboardManager.enable();
}

function disable() {
    if (clipboardManager) {
        clipboardManager.disable();
        clipboardManager = null;
    }
}

// CSS Styling
const STYLESHEET = `
.clipboard-history-panel {
    background: rgba(0, 0, 0, 0.9);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    padding: 16px;
    backdrop-filter: blur(10px);
}

.clipboard-history-header {
    spacing: 12px;
    margin-bottom: 16px;
}

.clipboard-history-title {
    font-size: 18px;
    font-weight: bold;
    color: white;
    flex: 1;
}

.clipboard-clear-button {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 8px 16px;
    color: white;
    font-size: 12px;
}

.clipboard-clear-button:hover {
    background: rgba(255, 255, 255, 0.2);
}

.clipboard-history-scroll {
    max-height: 480px;
}

.clipboard-history-content {
    spacing: 8px;
}

.clipboard-history-item {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 4px;
}

.clipboard-history-item:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
}

.clipboard-item-box {
    spacing: 4px;
}

.clipboard-item-text {
    color: white;
    font-size: 14px;
    line-height: 1.4;
}

.clipboard-item-info {
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
}

.clipboard-empty-label {
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    text-align: center;
    padding: 32px;
}
`;

// Add CSS to the extension
if (typeof imports.misc.extensionUtils !== 'undefined') {
    const ExtensionUtils = imports.misc.extensionUtils;
    const Me = ExtensionUtils.getCurrentExtension();
    
    let theme = imports.gi.Gtk.IconTheme.get_default();
    theme.append_search_path(Me.path + '/icons');
    
    // Apply CSS
    let context = St.ThemeContext.get_for_stage(global.stage);
    let theme_node = new St.ThemeNode({ theme: context.get_theme() });
    context.get_theme().load_stylesheet_from_data(STYLESHEET, -1);
}