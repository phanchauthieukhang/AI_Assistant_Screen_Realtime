const { app, BrowserWindow } = require('electron');
const hotkeyManager = require('./services/hotkeyManager');

const { createChatWindow } = require('./windows/chatWindow');
const { getOverlayWindow } = require('./windows/overlayWindow');

const { registerWindowHandlers } = require('./ipc/windowHandlers');
const { registerConfigHandlers } = require('./ipc/configHandlers');
const { registerCaptureHandlers, captureAndProcess, startAutoCapture, stopAutoListen, startAutoListen, stopAutoCapture, isAutoCapturing, isAutoListening, restartAutoCapture } = require('./ipc/captureHandlers');
const { registerChatHandlers } = require('./ipc/chatHandlers');

function registerGlobalHotkeys() {
  const storage = require('./services/storage');
  const config = storage.getConfig();
  hotkeyManager.initialize(config.shortcuts || {}, {
    onCapture: () => captureAndProcess(false),
    onToggleAuto: () => isAutoCapturing() ? stopAutoCapture() : startAutoCapture(),
    onToggleListen: () => isAutoListening() ? stopAutoListen() : startAutoListen(),
    onToggleOverlay: () => {
      const overlayWindow = getOverlayWindow();
      if (!overlayWindow) return;
      if (overlayWindow.isVisible()) overlayWindow.hide();
      else overlayWindow.show();
    },
    onSelectRegion: () => {
      const { createRegionWindow } = require('./windows/regionWindow');
      createRegionWindow();
    }
  });
}

app.whenReady().then(() => {
  createChatWindow();
  
  registerWindowHandlers();
  registerConfigHandlers({ restartAutoCapture, getOverlayWindow });
  registerCaptureHandlers();
  registerChatHandlers();

  registerGlobalHotkeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createChatWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  hotkeyManager.destroy();
  stopAutoCapture();
});
