const { ipcMain } = require('electron');
const { getChatWindow } = require('../windows/chatWindow');

function registerWindowHandlers() {
  ipcMain.handle('window-minimize', () => { 
    const cw = getChatWindow();
    if(cw) cw.minimize(); 
  });
  
  ipcMain.handle('window-maximize', () => { 
    const cw = getChatWindow();
    if(cw) {
      if(cw.isMaximized()) cw.unmaximize();
      else cw.maximize();
    }
  });
  
  ipcMain.handle('window-close', () => { 
    const cw = getChatWindow();
    if(cw) cw.close(); 
  });
}

module.exports = { registerWindowHandlers };
