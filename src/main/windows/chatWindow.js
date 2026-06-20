const { BrowserWindow, app } = require('electron');
const path = require('path');

let chatWindow = null;

function createChatWindow() {
  chatWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  chatWindow.loadFile(path.join(__dirname, '../../renderer/chat/index.html'));
  
  chatWindow.once('ready-to-show', () => {
    chatWindow.show();
  });

  chatWindow.on('closed', () => {
    chatWindow = null;
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  return chatWindow;
}

function getChatWindow() {
  return chatWindow;
}

module.exports = {
  createChatWindow,
  getChatWindow
};
