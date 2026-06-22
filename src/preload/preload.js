const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),

  // Config management
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // App Control Actions
  triggerCapture: () => ipcRenderer.invoke('trigger-capture'),
  toggleAutoCapture: () => ipcRenderer.invoke('toggle-auto-capture'),
  toggleAutoListen: () => ipcRenderer.invoke('toggle-auto-listen'),
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  processAudio: (data) => ipcRenderer.invoke('process-audio', data),
  processSTT: (text) => ipcRenderer.invoke('process-stt', text),
  startRegionSelection: () => ipcRenderer.invoke('start-region-selection'),
  sendRegionCaptured: (bounds) => ipcRenderer.send('region-captured', bounds),
  sendRegionCancel: () => ipcRenderer.send('region-cancel'),
  toggleOverlay: () => ipcRenderer.invoke('toggle-overlay'),
  
  // Chat & Conversations
  setActiveConversation: (id) => ipcRenderer.invoke('set-active-conversation', id),
  getConversations: () => ipcRenderer.invoke('get-conversations'),
  getConversation: (id) => ipcRenderer.invoke('get-conversation', id),
  createConversation: () => ipcRenderer.invoke('create-conversation'),
  deleteConversation: (id) => ipcRenderer.invoke('delete-conversation', id),
  renameConversation: (id, title) => ipcRenderer.invoke('rename-conversation', {id, title}),
  uploadChatAttachment: (filePath) => ipcRenderer.invoke('upload-chat-attachment', filePath),
  sendChatMessage: (data) => ipcRenderer.invoke('send-chat-message', data),
  getModelCatalog: () => ipcRenderer.invoke('get-model-catalog'),
  pinConversation: (id, pinned) => ipcRenderer.invoke('pin-conversation', { id, pinned }),
  sendOverlayChat: (text) => ipcRenderer.invoke('send-overlay-chat', text),
  branchConversation: (conversationId, messageId) => ipcRenderer.invoke('chat:branch', conversationId, messageId),
  regenerateMessage: (conversationId, messageId) => ipcRenderer.invoke('chat:regenerate', conversationId, messageId),

  // Listeners
  onNewAnswer: (callback) => {
    const subscription = (event, answer) => callback(answer);
    ipcRenderer.on('new-answer', subscription);
    return () => ipcRenderer.removeListener('new-answer', subscription);
  },
  onStatusChange: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('status-change', subscription);
    return () => ipcRenderer.removeListener('status-change', subscription);
  },
  onAutoStatusChange: (callback) => {
    const subscription = (event, isAuto) => callback(isAuto);
    ipcRenderer.on('auto-status-change', subscription);
    return () => ipcRenderer.removeListener('auto-status-change', subscription);
  },
  onListenStatusChange: (callback) => {
    const subscription = (event, isListening) => callback(isListening);
    ipcRenderer.on('listen-status-change', subscription);
    return () => ipcRenderer.removeListener('listen-status-change', subscription);
  },
  onRegionSelected: (callback) => {
    const subscription = (event, region) => callback(region);
    ipcRenderer.on('region-selected', subscription);
    return () => ipcRenderer.removeListener('region-selected', subscription);
  },
  onManualSTTChange: (callback) => {
    const subscription = (event, isListening) => callback(isListening);
    ipcRenderer.on('manual-stt-change', subscription);
    return () => ipcRenderer.removeListener('manual-stt-change', subscription);
  },
  
  // Chat specific listeners
  onNewChatMessage: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('new-chat-message', subscription);
    return () => ipcRenderer.removeListener('new-chat-message', subscription);
  },
  onConversationCreated: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('conversation-created', subscription);
    return () => ipcRenderer.removeListener('conversation-created', subscription);
  }
});
