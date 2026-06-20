const { BrowserWindow, screen } = require('electron');
const path = require('path');

let regionWindow = null;

function createRegionWindow() {
  if (regionWindow) return regionWindow;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  regionWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: width,
    height: height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreen: true,
    enableLargerThanScreen: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  regionWindow.loadFile(path.join(__dirname, '../../renderer/region/index.html'));

  regionWindow.on('closed', () => {
    regionWindow = null;
  });

  return regionWindow;
}

function getRegionWindow() {
  return regionWindow;
}

module.exports = {
  createRegionWindow,
  getRegionWindow
};
