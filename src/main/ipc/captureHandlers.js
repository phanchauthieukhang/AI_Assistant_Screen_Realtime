const { ipcMain } = require('electron');
const storage = require('../services/storage');
const screenCapture = require('../services/screenCapture');
const aiService = require('../ai');
const { getChatWindow } = require('../windows/chatWindow');
const { createOverlayWindow, getOverlayWindow } = require('../windows/overlayWindow');
const { createRegionWindow, getRegionWindow } = require('../windows/regionWindow');

let autoCaptureIntervalId = null;
let isAutoCapturingState = false;
let isAutoListeningState = false;
let isProcessing = false;
let activeConversationId = null;

function setActiveConversation(id) { activeConversationId = id; }
function getActiveConversation() { return activeConversationId; }

function updateStatus(status) {
  const overlayWindow = getOverlayWindow();
  const chatWindow = getChatWindow();
  if (overlayWindow) overlayWindow.webContents.send('status-change', status);
  if (chatWindow) chatWindow.webContents.send('status-change', status);
}

async function captureAndProcess(isAuto = false) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const config = storage.getConfig();
    const region = config.captureMode === 'region' ? config.selectedRegion : null;
    const overlayWindow = getOverlayWindow();
    const chatWindow = getChatWindow();
    
    let wasOverlayVisible = false;
    if (overlayWindow && overlayWindow.isVisible()) {
      wasOverlayVisible = true;
      overlayWindow.hide();
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const nativeImg = await screenCapture.capture(region);
    
    if (wasOverlayVisible && overlayWindow) {
      overlayWindow.show();
    }
    
    if (isAuto) {
      const isChanged = screenCapture.detectChange(nativeImg);
      if (!isChanged) {
        isProcessing = false;
        return; 
      }
    } else {
      screenCapture.lastImage = nativeImg; 
    }

    updateStatus('Đang chụp màn hình...');
    
    const jpegBuffer = nativeImg.toJPEG(80);
    const base64Image = jpegBuffer.toString('base64');

    updateStatus('Đang gửi AI phân tích...');
    
    if (!activeConversationId) {
       const newConv = storage.createConversation();
       activeConversationId = newConv.id;
       if (chatWindow) chatWindow.webContents.send('conversation-created', newConv);
    }
    
    const userMsg = storage.addMessage(activeConversationId, 'user', '', [{
      type: 'image',
      base64: base64Image,
      mimeType: 'image/jpeg'
    }]);

    if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId: activeConversationId, message: userMsg });

    const answer = await aiService.processRequest(config, base64Image);

    const aiMsg = storage.addMessage(activeConversationId, 'assistant', answer);
    if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId: activeConversationId, message: aiMsg });

    if (overlayWindow) {
      overlayWindow.webContents.send('new-answer', answer);
    }

    updateStatus('Sẵn sàng');
  } catch (error) {
    console.error('Workflow error:', error);
    updateStatus(`Lỗi: ${error.message}`);
    const overlayWindow = getOverlayWindow();
    const chatWindow = getChatWindow();
    if (overlayWindow) overlayWindow.webContents.send('new-answer', `❌ Đã xảy ra lỗi: ${error.message}`);
    if (chatWindow && activeConversationId) {
      const errMsg = storage.addMessage(activeConversationId, 'assistant', `❌ Đã xảy ra lỗi: ${error.message}`);
      chatWindow.webContents.send('new-chat-message', { conversationId: activeConversationId, message: errMsg });
    }
  } finally {
    isProcessing = false;
  }
}

function startAutoCapture() {
  if (isAutoCapturingState) return;
  if (isAutoListeningState) stopAutoListen();
  
  const config = storage.getConfig();
  const ms = config.interval * 1000;
  
  screenCapture.resetCache();
  isAutoCapturingState = true;

  captureAndProcess(true);

  autoCaptureIntervalId = setInterval(() => {
    captureAndProcess(true);
  }, ms);

  const chatWindow = getChatWindow();
  const overlayWindow = getOverlayWindow();
  if (chatWindow) chatWindow.webContents.send('auto-status-change', true);
  if (overlayWindow) overlayWindow.webContents.send('auto-status-change', true);
  updateStatus('Chế độ Tự động đang BẬT');
  
  createOverlayWindow();
}

function stopAutoCapture() {
  if (!isAutoCapturingState) return;

  clearInterval(autoCaptureIntervalId);
  autoCaptureIntervalId = null;
  isAutoCapturingState = false;

  const chatWindow = getChatWindow();
  const overlayWindow = getOverlayWindow();
  if (chatWindow) chatWindow.webContents.send('auto-status-change', false);
  if (overlayWindow) overlayWindow.webContents.send('auto-status-change', false);
  updateStatus('Chế độ Tự động đã TẮT');
}

function startAutoListen() {
  if (isAutoListeningState) return;
  if (isAutoCapturingState) stopAutoCapture();

  isAutoListeningState = true;

  const chatWindow = getChatWindow();
  const overlayWindow = getOverlayWindow();
  if (chatWindow) chatWindow.webContents.send('listen-status-change', true);
  if (overlayWindow) overlayWindow.webContents.send('listen-status-change', true);
  updateStatus('Chế độ Tự động nghe đang BẬT');

  createOverlayWindow(); 
}

function stopAutoListen() {
  if (!isAutoListeningState) return;

  isAutoListeningState = false;

  const chatWindow = getChatWindow();
  const overlayWindow = getOverlayWindow();
  if (chatWindow) chatWindow.webContents.send('listen-status-change', false);
  if (overlayWindow) overlayWindow.webContents.send('listen-status-change', false);
  updateStatus('Chế độ Tự động nghe đã TẮT');
}

function isAutoCapturing() { return isAutoCapturingState; }
function isAutoListening() { return isAutoListeningState; }

function restartAutoCapture() {
  if (isAutoCapturingState) {
    stopAutoCapture();
    startAutoCapture();
  }
}

function registerCaptureHandlers() {
  ipcMain.handle('trigger-capture', () => { captureAndProcess(false); return { success: true }; });
  ipcMain.handle('toggle-auto-capture', () => { isAutoCapturingState ? stopAutoCapture() : startAutoCapture(); return isAutoCapturingState; });
  ipcMain.handle('toggle-auto-listen', () => { isAutoListeningState ? stopAutoListen() : startAutoListen(); return isAutoListeningState; });
  
  ipcMain.handle('toggle-overlay', () => {
    let overlayWindow = getOverlayWindow();
    if (!overlayWindow) {
      createOverlayWindow();
    } else if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    } else {
      overlayWindow.show();
    }
  });
  
  ipcMain.handle('start-region-selection', () => { createRegionWindow(); return { success: true }; });
  
  ipcMain.handle('get-desktop-sources', async () => {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map(s => ({ id: s.id, name: s.name }));
  });

  ipcMain.handle('process-audio', async (event, { base64Audio, mimeType }) => {
    if (isProcessing) return { success: false, error: 'Bận xử lý...' };
    isProcessing = true;
    updateStatus('Đang phân tích âm thanh & hình ảnh...');
    
    try {
      const config = storage.getConfig();
      const region = config.captureMode === 'region' ? config.selectedRegion : null;
      let overlayWindow = getOverlayWindow();
      const chatWindow = getChatWindow();
      
      let wasOverlayVisible = false;
      if (overlayWindow && overlayWindow.isVisible()) {
        wasOverlayVisible = true;
        overlayWindow.hide();
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      const nativeImg = await screenCapture.capture(region);
      
      if (wasOverlayVisible && overlayWindow) overlayWindow.show();
      
      const jpegBuffer = nativeImg.toJPEG(80);
      const base64Image = jpegBuffer.toString('base64');
      
      if (!activeConversationId) {
         const newConv = storage.createConversation();
         activeConversationId = newConv.id;
         if (chatWindow) chatWindow.webContents.send('conversation-created', newConv);
      }

      const userMsg = storage.addMessage(activeConversationId, 'user', '(Hỏi bằng giọng nói)', [
        { type: 'image', base64: base64Image, mimeType: 'image/jpeg' },
        { type: 'audio', base64: base64Audio, mimeType }
      ]);
      if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId: activeConversationId, message: userMsg });

      const answer = await aiService.processAudioRequest(config, base64Audio, base64Image, mimeType);
      
      const aiMsg = storage.addMessage(activeConversationId, 'assistant', answer);
      if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId: activeConversationId, message: aiMsg });

      if (overlayWindow) overlayWindow.webContents.send('new-answer', answer);
      
      updateStatus('Sẵn sàng');
      isProcessing = false;
      return { success: true, answer };
    } catch (error) {
      updateStatus(`Lỗi: ${error.message}`);
      const overlayWindow = getOverlayWindow();
      const chatWindow = getChatWindow();
      if (overlayWindow) overlayWindow.webContents.send('new-answer', `❌ Lỗi: ${error.message}`);
      if (chatWindow && activeConversationId) {
        const errMsg = storage.addMessage(activeConversationId, 'assistant', `❌ Đã xảy ra lỗi: ${error.message}`);
        chatWindow.webContents.send('new-chat-message', { conversationId: activeConversationId, message: errMsg });
      }
      isProcessing = false;
      return { success: false, error: error.message };
    }
  });

  // Region window
  ipcMain.on('region-captured', (event, bounds) => {
    storage.saveConfig({ selectedRegion: bounds, captureMode: 'region' });
    const chatWindow = getChatWindow();
    const regionWindow = getRegionWindow();
    if (chatWindow) chatWindow.webContents.send('region-selected', bounds);
    if (regionWindow) regionWindow.close();
  });

  ipcMain.on('region-cancel', () => { 
    const regionWindow = getRegionWindow();
    if (regionWindow) regionWindow.close(); 
  });
}

module.exports = {
  registerCaptureHandlers,
  captureAndProcess,
  startAutoCapture,
  stopAutoCapture,
  startAutoListen,
  stopAutoListen,
  restartAutoCapture,
  isAutoCapturing,
  isAutoListening,
  setActiveConversation,
  getActiveConversation,
  updateStatus
};
