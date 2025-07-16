// extension.js
const { GObject, St, Clutter, Meta, Shell, Gio, GLib } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;

let clipboardManager = null;

// Clipboard History Panel
var ClipboardHistoryPanel = GObject.registerClass({
    GTypeName: 'ClipboardHistoryPanel'
}, class ClipboardHistoryPanel extends St.BoxLayout {
    _init(historySize = 10) {
        super._init({
            vertical: true,
            style_class: 'clipboard-history-panel',
            visible: false,
            reactive: true,
            can_focus: true
        });

        this._historySize = historySize;
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
        if (this._clipboardHistory.length > this._historySize) {
            this._clipboardHistory = this._clipboardHistory.slice(0, this._historySize);
        }
        
        this._updateUI();
    }

    updateHistorySize(newSize) {
        this._historySize = newSize;
        
        // Trim existing history if needed
        if (this._clipboardHistory.length > this._historySize) {
            this._clipboardHistory = this._clipboardHistory.slice(0, this._historySize);
            this._updateUI();
        }
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
        this._settings = null;
        this._settingsChangedIds = [];
    }

    enable() {
        // Initialize settings
        this._settings = new Gio.Settings({ 
            schema_id: 'org.gnome.shell.extensions.clipboard-manager' 
        });

        // Create clipboard history panel with configured size
        const historySize = this._settings.get_int('history-size');
        this._panel = new ClipboardHistoryPanel(historySize);
        
        // Add panel to UI group
        Main.uiGroup.add_child(this._panel);
        
        // Position panel
        this._updatePanelPosition();
        
        // Connect to monitor changes
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._updatePanelPosition();
        });

        // Create panel indicator if enabled
        if (this._settings.get_boolean('enable-panel-icon')) {
            this._createIndicator();
        }

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

        // Listen for settings changes
        this._connectSettingsSignals();
    }

    _createIndicator() {
        if (!this._indicator) {
            this._indicator = new ClipboardIndicator();
            Main.panel.addToStatusArea('clipboard-manager', this._indicator);
        }
    }

    _removeIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _connectSettingsSignals() {
        // Listen for history size changes
        this._settingsChangedIds.push(
            this._settings.connect('changed::history-size', () => {
                const newSize = this._settings.get_int('history-size');
                if (this._panel) {
                    this._panel.updateHistorySize(newSize);
                }
            })
        );

        // Listen for panel icon toggle
        this._settingsChangedIds.push(
            this._settings.connect('changed::enable-panel-icon', () => {
                const enableIcon = this._settings.get_boolean('enable-panel-icon');
                if (enableIcon) {
                    this._createIndicator();
                } else {
                    this._removeIndicator();
                }
            })
        );
    }

    disable() {
        // Disconnect settings signals
        this._settingsChangedIds.forEach(id => {
            if (this._settings) {
                this._settings.disconnect(id);
            }
        });
        this._settingsChangedIds = [];

        // Remove keyboard shortcut
        if (this._keyBindingId) {
            Main.wm.removeKeybinding('toggle-clipboard');
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
        this._removeIndicator();

        // Clear settings
        this._settings = null;
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
        'toggle-clipboard',
        this._settings,
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