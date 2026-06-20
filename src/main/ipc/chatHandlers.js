const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const storage = require('../services/storage');
const aiService = require('../ai');
const documentProcessor = require('../services/documentProcessor');
const ragService = require('../services/ragService');
const { getChatWindow } = require('../windows/chatWindow');
const { getOverlayWindow } = require('../windows/overlayWindow');
const { setActiveConversation, getActiveConversation, updateStatus } = require('./captureHandlers');

function registerChatHandlers() {
  ipcMain.handle('get-history', () => storage.getHistory());
  ipcMain.handle('clear-history', () => storage.clearHistory());

  ipcMain.handle('set-active-conversation', (event, id) => {
    setActiveConversation(id);
  });

  ipcMain.handle('get-conversations', () => storage.getAllConversations());
  ipcMain.handle('get-conversation', (event, id) => storage.getConversation(id));
  ipcMain.handle('create-conversation', () => storage.createConversation());
  
  ipcMain.handle('delete-conversation', (event, id) => {
    storage.deleteConversation(id);
    if (getActiveConversation() === id) setActiveConversation(null);
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

  ipcMain.handle('get-rag-status', () => ragService.getLoadedDocuments());
  ipcMain.handle('clear-rag-documents', () => { ragService.clearDocuments(); return true; });

  ipcMain.handle('send-chat-message', async (event, { conversationId, text, attachments, modelOverride }) => {
    try {
      setActiveConversation(conversationId);
      const config = storage.getConfig();
      const conv = storage.getConversation(conversationId);
      const chatWindow = getChatWindow();
      
      const userMsg = storage.addMessage(conversationId, 'user', text, attachments);
      if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId, message: userMsg });

      const history = conv.messages.slice(0, -1); 
      const answer = await aiService.processChatMessage(config, text, attachments, history, modelOverride);
      
      const aiMsg = storage.addMessage(conversationId, 'assistant', answer);
      if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId, message: aiMsg });
      
      return { success: true };
    } catch (error) {
      const chatWindow = getChatWindow();
      const errMsg = storage.addMessage(conversationId, 'assistant', `❌ Lỗi: ${error.message}`);
      if (chatWindow) chatWindow.webContents.send('new-chat-message', { conversationId, message: errMsg });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('send-overlay-chat', async (event, text) => {
    try {
      let activeConversationId = getActiveConversation();
      const chatWindow = getChatWindow();
      const overlayWindow = getOverlayWindow();

      if (!activeConversationId) {
        const newConv = storage.createConversation();
        activeConversationId = newConv.id;
        setActiveConversation(activeConversationId);
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
      const overlayWindow = getOverlayWindow();
      if (overlayWindow) overlayWindow.webContents.send('new-answer', `❌ Lỗi: ${error.message}`);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerChatHandlers };
