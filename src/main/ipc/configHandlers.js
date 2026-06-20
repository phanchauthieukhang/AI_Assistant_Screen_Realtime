const { ipcMain } = require('electron');
const storage = require('../services/storage');
const aiService = require('../ai');
const hotkeyManager = require('../services/hotkeyManager');

function registerConfigHandlers(deps) {
  const { restartAutoCapture, getOverlayWindow } = deps;

  ipcMain.handle('get-config', () => storage.getConfig());
  
  ipcMain.handle('save-config', (event, newConfig) => {
    const ok = storage.saveConfig(newConfig);
    if (ok) {
      if (newConfig.interval) {
        restartAutoCapture();
      }
      if (newConfig.shortcuts) {
        hotkeyManager.updateShortcuts(newConfig.shortcuts);
      }
      if (newConfig.overlayOpacity !== undefined) {
        const overlayWindow = getOverlayWindow();
        if (overlayWindow) {
          overlayWindow.setOpacity(newConfig.overlayOpacity);
        }
      }
    }
    return ok;
  });

  ipcMain.handle('get-model-catalog', () => {
    const config = storage.getConfig();
    return aiService.getModelCatalog(config.apiKeys);
  });
}

module.exports = { registerConfigHandlers };
