const { BrowserWindow } = require('electron');
const path = require('path');
const storage = require('../services/storage');

let overlayWindow = null;

function createOverlayWindow() {
  if (overlayWindow) {
    overlayWindow.show();
    return overlayWindow;
  }

  const config = storage.getConfig();
  const pos = config.overlayPosition || { x: 100, y: 100, width: 450, height: 350 };

  overlayWindow = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: pos.width,
    height: pos.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.loadFile(path.join(__dirname, '../../renderer/overlay/index.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    overlayWindow.setOpacity(config.overlayOpacity || 0.85);
  });

  overlayWindow.on('moved', saveOverlayBounds);
  overlayWindow.on('resized', saveOverlayBounds);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

function saveOverlayBounds() {
  if (!overlayWindow) return;
  const bounds = overlayWindow.getBounds();
  storage.saveConfig({ overlayPosition: bounds });
}

function getOverlayWindow() {
  return overlayWindow;
}

module.exports = {
  createOverlayWindow,
  getOverlayWindow,
  saveOverlayBounds
};
