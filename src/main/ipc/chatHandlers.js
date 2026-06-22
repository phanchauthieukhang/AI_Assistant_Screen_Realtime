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
  ipcMain.handle('chat:branch', async (event, conversationId, messageId) => {
    try {
      const newConv = storage.branchConversation(conversationId, messageId);
      if (!newConv) return { success: false, error: 'Không tìm thấy hội thoại hoặc tin nhắn' };
      
      const chatWindow = getChatWindow();
      if (chatWindow) chatWindow.webContents.send('conversation-created', newConv);
      
      return { success: true, conversationId: newConv.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('chat:regenerate', async (event, conversationId, messageId) => {
    try {
      const conv = storage.getConversation(conversationId);
      if (!conv) return { success: false, error: 'Không tìm thấy hội thoại' };

      const msgIndex = conv.messages.findIndex(m => m.id === messageId);
      if (msgIndex === -1) return { success: false, error: 'Không tìm thấy tin nhắn' };

      const targetMsg = conv.messages[msgIndex];
      if (targetMsg.role !== 'assistant') {
        return { success: false, error: 'Chỉ có thể tạo lại phản hồi của AI' };
      }

      let userMsgIndex = -1;
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (conv.messages[i].role === 'user') {
          userMsgIndex = i;
          break;
        }
      }

      if (userMsgIndex === -1) {
        return { success: false, error: 'Không tìm thấy câu hỏi của người dùng' };
      }

      const userMsg = conv.messages[userMsgIndex];
      let targetConvId = conversationId;

      const chatWindow = getChatWindow();

      if (msgIndex < conv.messages.length - 1) {
        const newConv = storage.branchConversation(conversationId, userMsg.id);
        if (!newConv) return { success: false, error: 'Lỗi khi rẽ nhánh' };
        targetConvId = newConv.id;
        
        if (chatWindow) chatWindow.webContents.send('conversation-created', newConv);
      } else {
        storage.deleteMessage(conversationId, messageId);
      }

      if (chatWindow) {
        chatWindow.webContents.send('status-update', 'Đang tạo lại...');
        if (targetConvId !== conversationId) {
          chatWindow.webContents.send('chat:switched-branch', targetConvId);
        }
      }

      const targetConv = storage.getConversation(targetConvId);
      const history = targetConv.messages.slice(0, -1);
      const config = storage.getConfig();
      
      const answer = await aiService.processChatMessage(config, userMsg.content, userMsg.attachments || [], history);
      
      const aiMsg = storage.addMessage(targetConvId, 'assistant', answer);
      
      if (chatWindow) {
        chatWindow.webContents.send('new-chat-message', { conversationId: targetConvId, message: aiMsg });
        chatWindow.webContents.send('status-update', 'Sẵn sàng');
      }

      return { success: true, conversationId: targetConvId };
    } catch (error) {
      const chatWindow = getChatWindow();
      if (chatWindow) chatWindow.webContents.send('status-update', `Lỗi: ${error.message}`);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerChatHandlers };
