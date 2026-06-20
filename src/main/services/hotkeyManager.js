const { globalShortcut } = require('electron');

class HotkeyManager {
  constructor() {
    this.shortcuts = {
      capture: 'Ctrl+Shift+S',
      toggleAuto: 'Ctrl+Shift+A',
      toggleOverlay: 'Ctrl+Shift+H',
      selectRegion: 'Ctrl+Shift+R',
      toggleListen: 'Ctrl+Shift+V'
    };
    this.callbacks = {};
  }

  initialize(shortcuts, callbacks) {
    if (shortcuts) {
      this.shortcuts = { ...this.shortcuts, ...shortcuts };
    }
    this.callbacks = callbacks;
    this.registerAll();
  }

  registerAll() {
    globalShortcut.unregisterAll();

    // Register Capture Shortcut
    if (this.shortcuts.capture && this.callbacks.onCapture) {
      const ok = globalShortcut.register(this.shortcuts.capture, () => {
        this.callbacks.onCapture();
      });
      if (!ok) console.error(`Registration failed for shortcut: ${this.shortcuts.capture}`);
    }

    // Register Toggle Auto Shortcut
    if (this.shortcuts.toggleAuto && this.callbacks.onToggleAuto) {
      const ok = globalShortcut.register(this.shortcuts.toggleAuto, () => {
        this.callbacks.onToggleAuto();
      });
      if (!ok) console.error(`Registration failed for shortcut: ${this.shortcuts.toggleAuto}`);
    }

    // Register Toggle Listen Shortcut
    if (this.shortcuts.toggleListen && this.callbacks.onToggleListen) {
      const ok = globalShortcut.register(this.shortcuts.toggleListen, () => {
        this.callbacks.onToggleListen();
      });
      if (!ok) console.error(`Registration failed for shortcut: ${this.shortcuts.toggleListen}`);
    }

    // Register Toggle Overlay Shortcut
    if (this.shortcuts.toggleOverlay && this.callbacks.onToggleOverlay) {
      const ok = globalShortcut.register(this.shortcuts.toggleOverlay, () => {
        this.callbacks.onToggleOverlay();
      });
      if (!ok) console.error(`Registration failed for shortcut: ${this.shortcuts.toggleOverlay}`);
    }

    // Register Select Region Shortcut
    if (this.shortcuts.selectRegion && this.callbacks.onSelectRegion) {
      const ok = globalShortcut.register(this.shortcuts.selectRegion, () => {
        this.callbacks.onSelectRegion();
      });
      if (!ok) console.error(`Registration failed for shortcut: ${this.shortcuts.selectRegion}`);
    }
  }

  updateShortcuts(newShortcuts) {
    this.shortcuts = { ...this.shortcuts, ...newShortcuts };
    this.registerAll();
  }

  destroy() {
    globalShortcut.unregisterAll();
  }
}

module.exports = new HotkeyManager();
