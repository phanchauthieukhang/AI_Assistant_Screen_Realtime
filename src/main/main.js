const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const storage = require('./storage');
const aiService = require('./aiService');
const screenCapture = require('./screenCapture');
const documentProcessor = require('./documentProcessor');
const ragService = require('./ragService');
const hotkeyManager = require('./hotkeyManager');
const fs = require('fs');

let chatWindow = null;
let overlayWindow = null;
let regionWindow = null;

let autoCaptureIntervalId = null;
let isAutoCapturing = false;
let isAutoListening = false;
let isProcessing = false;

// We no longer have "isSessionActive" in the same way, the chat window is always the session.
// We'll treat the chat window being open as the session being active.

function createChatWindow() {
  chatWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Custom frameless titlebar
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  chatWindow.loadFile(path.join(__dirname, '../renderer/chat/index.html'));
  
  chatWindow.once('ready-to-show', () => {
    chatWindow.show();
  });

  chatWindow.on('closed', () => {
    chatWindow = null;
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

function createOverlayWindow() {
  if (overlayWindow) {
    overlayWindow.show();
    return;
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
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay/index.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    overlayWindow.setOpacity(config.overlayOpacity || 0.85);
  });

  overlayWindow.on('moved', () => saveOverlayBounds());
  overlayWindow.on('resized', () => saveOverlayBounds());

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function saveOverlayBounds() {
  if (!overlayWindow) return;
  const bounds = overlayWindow.getBounds();
  storage.saveConfig({ overlayPosition: bounds });
}

function createRegionWindow() {
  if (regionWindow) return;

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
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  regionWindow.loadFile(path.join(__dirname, '../renderer/region/index.html'));

  regionWindow.on('closed', () => {
    regionWindow = null;
  });
}

// Global active conversation ID (set by Chat UI)
let activeConversationId = null;

async function captureAndProcess(isAuto = false) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const config = storage.getConfig();
    const region = config.captureMode === 'region' ? config.selectedRegion : null;
    
    // 1. Hide overlay if visible, to prevent capturing it
    let wasOverlayVisible = false;
    if (overlayWindow && overlayWindow.isVisible()) {
      wasOverlayVisible = true;
      overlayWindow.hide();
      // Wait for OS to render the screen without the overlay
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    // 2. Capture screen
    const nativeImg = await screenCapture.capture(region);
    
    // Restore overlay
    if (wasOverlayVisible && overlayWindow) {
      overlayWindow.show();
    }
    
    if (isAuto) {
      const isChanged = screenCapture.detectChange(nativeImg);
      if (!isChanged) {
        isProcessing = false;
        return; // Skip if no significant change
      }
    } else {
      screenCapture.lastImage = nativeImg; // Manual capture resets baseline
    }

    updateStatus('Đang chụp màn hình...');
    
    const jpegBuffer = nativeImg.toJPEG(80);
    const base64Image = jpegBuffer.toString('base64');

    updateStatus('Đang gửi AI phân tích...');
    
    // 2. Add message to active conversation
    if (!activeConversationId) {
       // Auto-create if none
       const newConv = storage.createConversation();
       activeConversationId = newConv.id;
       if (chatWindow) chatWindow.webContents.send('conversation-created', newConv);
    }
    
    // Add user message with image attachment
    const userMsg = storage.addMessage(activeConversationId, 'user', '', [{
      type: 'image',
      base64: base64Image,
      mimeType: 'image/jpeg'
    }]);

    if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId: activeConversationId, message: userMsg });

    // 3. Request AI
    const answer = await aiService.processRequest(config, base64Image);

    // 4. Save AI Answer
    const aiMsg = storage.addMessage(activeConversationId, 'assistant', answer);
    if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId: activeConversationId, message: aiMsg });

    // 5. Notify Overlay (Keep mini-view working)
    if (overlayWindow) {
      overlayWindow.webContents.send('new-answer', answer);
    }

    updateStatus('Sẵn sàng');
  } catch (error) {
    console.error('Workflow error:', error);
    updateStatus(`Lỗi: ${error.message}`);
    if (overlayWindow) {
      overlayWindow.webContents.send('new-answer', `❌ Đã xảy ra lỗi: ${error.message}`);
    }
    if (chatWindow && activeConversationId) {
      const errMsg = storage.addMessage(activeConversationId, 'assistant', `❌ Đã xảy ra lỗi: ${error.message}`);
      chatWindow.webContents.send('new-chat-message', { conversationId: activeConversationId, message: errMsg });
    }
  } finally {
    isProcessing = false;
  }
}

function updateStatus(status) {
  if (overlayWindow) {
    overlayWindow.webContents.send('status-change', status);
  }
  if (chatWindow) {
    chatWindow.webContents.send('status-change', status);
  }
}

function startAutoCapture() {
  if (isAutoCapturing) return;
  if (isAutoListening) stopAutoListen();
  
  const config = storage.getConfig();
  const ms = config.interval * 1000;
  
  screenCapture.resetCache();
  isAutoCapturing = true;

  captureAndProcess(true);

  autoCaptureIntervalId = setInterval(() => {
    captureAndProcess(true);
  }, ms);

  if (chatWindow) chatWindow.webContents.send('auto-status-change', true);
  if (overlayWindow) overlayWindow.webContents.send('auto-status-change', true);
  updateStatus('Chế độ Tự động đang BẬT');
  
  // Make sure overlay is visible if auto capture is on
  createOverlayWindow();
}

function stopAutoCapture() {
  if (!isAutoCapturing) return;

  clearInterval(autoCaptureIntervalId);
  autoCaptureIntervalId = null;
  isAutoCapturing = false;

  if (chatWindow) chatWindow.webContents.send('auto-status-change', false);
  if (overlayWindow) overlayWindow.webContents.send('auto-status-change', false);
  updateStatus('Chế độ Tự động đã TẮT');
}

function startAutoListen() {
  if (isAutoListening) return;
  if (isAutoCapturing) stopAutoCapture();

  isAutoListening = true;

  if (chatWindow) chatWindow.webContents.send('listen-status-change', true);
  if (overlayWindow) overlayWindow.webContents.send('listen-status-change', true);
  updateStatus('Chế độ Tự động nghe đang BẬT');

  createOverlayWindow(); // Need overlay to do VAD since Web Audio API is there
}

function stopAutoListen() {
  if (!isAutoListening) return;

  isAutoListening = false;

  if (chatWindow) chatWindow.webContents.send('listen-status-change', false);
  if (overlayWindow) overlayWindow.webContents.send('listen-status-change', false);
  updateStatus('Chế độ Tự động nghe đã TẮT');
}

function registerGlobalHotkeys() {
  const config = storage.getConfig();
  hotkeyManager.initialize(config.shortcuts || {}, {
    onCapture: () => captureAndProcess(false),
    onToggleAuto: () => isAutoCapturing ? stopAutoCapture() : startAutoCapture(),
    onToggleListen: () => isAutoListening ? stopAutoListen() : startAutoListen(),
    onToggleOverlay: () => {
      if (!overlayWindow) return;
      if (overlayWindow.isVisible()) overlayWindow.hide();
      else overlayWindow.show();
    },
    onSelectRegion: () => createRegionWindow()
  });
}

app.whenReady().then(() => {
  createChatWindow();
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

// Window controls IPC
ipcMain.handle('window-minimize', () => { if(chatWindow) chatWindow.minimize(); });
ipcMain.handle('window-maximize', () => { 
  if(chatWindow) {
    if(chatWindow.isMaximized()) chatWindow.unmaximize();
    else chatWindow.maximize();
  }
});
ipcMain.handle('window-close', () => { if(chatWindow) chatWindow.close(); });


// Config IPC
ipcMain.handle('get-config', () => storage.getConfig());
ipcMain.handle('save-config', (event, newConfig) => {
  const ok = storage.saveConfig(newConfig);
  if (ok) {
    if (newConfig.interval && isAutoCapturing) {
      stopAutoCapture();
      startAutoCapture();
    }
    if (newConfig.shortcuts) hotkeyManager.updateShortcuts(newConfig.shortcuts);
    if (newConfig.overlayOpacity !== undefined && overlayWindow) {
      overlayWindow.setOpacity(newConfig.overlayOpacity);
    }
  }
  return ok;
});

// App Control IPC
ipcMain.handle('trigger-capture', () => { captureAndProcess(false); return { success: true }; });
ipcMain.handle('toggle-auto-capture', () => { isAutoCapturing ? stopAutoCapture() : startAutoCapture(); return isAutoCapturing; });
ipcMain.handle('toggle-auto-listen', () => { isAutoListening ? stopAutoListen() : startAutoListen(); return isAutoListening; });
ipcMain.handle('toggle-overlay', () => {
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

// Audio processing IPC (from VAD overlay)
ipcMain.handle('process-audio', async (event, { base64Audio, mimeType }) => {
  if (isProcessing) return { success: false, error: 'Bận xử lý...' };
  isProcessing = true;
  updateStatus('Đang phân tích âm thanh & hình ảnh...');
  
  try {
    const config = storage.getConfig();
    const region = config.captureMode === 'region' ? config.selectedRegion : null;
    
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
    if (overlayWindow) overlayWindow.webContents.send('new-answer', `❌ Lỗi: ${error.message}`);
    if (chatWindow && activeConversationId) {
      const errMsg = storage.addMessage(activeConversationId, 'assistant', `❌ Đã xảy ra lỗi: ${error.message}`);
      chatWindow.webContents.send('new-chat-message', { conversationId: activeConversationId, message: errMsg });
    }
    isProcessing = false;
    return { success: false, error: error.message };
  }
});

// --- NEW: Catalog and Pinning ---
ipcMain.handle('get-model-catalog', () => {
  const config = storage.getConfig();
  return aiService.getModelCatalog(config.apiKeys);
});

// Legacy history
ipcMain.handle('get-history', () => storage.getHistory());
ipcMain.handle('clear-history', () => storage.clearHistory());

// --- CHAT IPC ---
ipcMain.handle('set-active-conversation', (event, id) => {
  activeConversationId = id;
});

ipcMain.handle('get-conversations', () => storage.getAllConversations());
ipcMain.handle('get-conversation', (event, id) => storage.getConversation(id));
ipcMain.handle('create-conversation', () => storage.createConversation());
ipcMain.handle('delete-conversation', (event, id) => {
  storage.deleteConversation(id);
  if (activeConversationId === id) activeConversationId = null;
});
ipcMain.handle('rename-conversation', (event, {id, title}) => storage.renameConversation(id, title));
ipcMain.handle('pin-conversation', (event, {id, pinned}) => storage.pinConversation(id, pinned));

ipcMain.handle('upload-chat-attachment', async (event, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    
    if (isImage) {
       const buffer = fs.readFileSync(filePath);
       return { success: true, attachment: { type: 'image', fileName: path.basename(filePath), base64: buffer.toString('base64'), mimeType: `image/${ext.slice(1)}` } };
    } else {
       const fileInfo = await documentProcessor.processFile(filePath);
       
       try {
         const config = storage.getConfig();
         const apiKey = config.apiKeys['gemini'];
         if (apiKey && apiKey.trim() !== '') {
           await ragService.addDocumentText(apiKey, fileInfo.extractedText, fileInfo.name);
         } else {
           console.warn('Thiếu Gemini API Key. Không thể nạp RAG.');
         }
       } catch (ragErr) {
         console.warn('Lỗi khi nạp vào RAG:', ragErr.message);
       }

       return { success: true, attachment: { type: 'document', fileName: fileInfo.name } };
    }
  } catch(error) {
    return { success: false, error: error.message };
  }
});

// --- RAG IPC ---
ipcMain.handle('get-rag-status', () => {
  return ragService.getLoadedDocuments();
});

ipcMain.handle('clear-rag-documents', () => {
  ragService.clearDocuments();
  return true;
});

ipcMain.handle('send-chat-message', async (event, { conversationId, text, attachments, modelOverride }) => {
  try {
    activeConversationId = conversationId;
    const config = storage.getConfig();
    const conv = storage.getConversation(conversationId);
    
    // Save user message
    const userMsg = storage.addMessage(conversationId, 'user', text, attachments);
    if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId, message: userMsg });

    // Ensure we capture event.modelOverride to pass to processChatMessage
    event.modelOverride = modelOverride;

    // Build history for context (exclude the current message we just added so we don't duplicate it in AI request, 
    // or pass the history up to the previous message).
    // Actually, processChatMessage expects history WITHOUT the current message text, or maybe WITH it?
    // In aiService.js, I append the current message separately. So history should be messages before the current one.
    const history = conv.messages.slice(0, -1); 

    const answer = await aiService.processChatMessage(config, text, attachments, history, event.modelOverride);
    
    const aiMsg = storage.addMessage(conversationId, 'assistant', answer);
    if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId, message: aiMsg });
    
    return { success: true };
  } catch (error) {
    const errMsg = storage.addMessage(conversationId, 'assistant', `❌ Lỗi: ${error.message}`);
    if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId, message: errMsg });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-overlay-chat', async (event, text) => {
  try {
    if (!activeConversationId) {
      const newConv = storage.createConversation();
      activeConversationId = newConv.id;
      if (chatWindow) chatWindow.webContents.send('conversation-created', newConv);
    }
    
    const conversationId = activeConversationId;
    const config = storage.getConfig();
    const conv = storage.getConversation(conversationId);
    
    updateStatus('AI đang suy nghĩ...');
    
    const userMsg = storage.addMessage(conversationId, 'user', text, []);
    if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId, message: userMsg });
    
    const history = conv.messages.slice(0, -1);
    const answer = await aiService.processChatMessage(config, text, [], history);
    
    const aiMsg = storage.addMessage(conversationId, 'assistant', answer);
    if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId, message: aiMsg });
    if (overlayWindow) overlayWindow.webContents.send('new-answer', answer);
    
    updateStatus('Sẵn sàng');
    return { success: true };
  } catch (error) {
    updateStatus(`Lỗi: ${error.message}`);
    if (overlayWindow) overlayWindow.webContents.send('new-answer', `❌ Lỗi: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// Region window
ipcMain.on('region-captured', (event, bounds) => {
  storage.saveConfig({ selectedRegion: bounds, captureMode: 'region' });
  if (chatWindow) chatWindow.webContents.send('region-selected', bounds);
  if (regionWindow) regionWindow.close();
});

ipcMain.on('region-cancel', () => { if (regionWindow) regionWindow.close(); });
