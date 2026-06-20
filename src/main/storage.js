const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Storage {
  constructor() {
    // Determine the config file path in userData folder
    this.userDataPath = app.getPath('userData');
    this.configFilePath = path.join(this.userDataPath, 'config.json');
    this.historyFilePath = path.join(this.userDataPath, 'history.json');
    this.conversationsFilePath = path.join(this.userDataPath, 'conversations.json');
    
    this.config = this.loadConfig();
    this.history = this.loadHistory();
    this.conversations = this.loadConversations();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const data = fs.readFileSync(this.configFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading config, resetting to default:', error);
    }

    // Default configuration
    return {
      apiKeys: {
        gemini: '',
        openai: '',
        claude: ''
      },
      selectedModel: 'gemini', // 'gemini' | 'openai' | 'claude'
      selectedSpecificModel: 'gemini-3.5-flash',
      thinkingLevel: 'standard', // 'standard' | 'extended' (Gemini)
      reasoningEffort: 'low', // 'low' | 'medium' | 'high' (OpenAI)
      claudeEffort: 'low', // 'low' | 'medium' | 'high' | 'max' (Claude)
      claudeThinking: false, // boolean (Claude)
      systemPrompt: 'Bạn là một trợ lý AI thông minh, đa năng và thân thiện. Bạn có khả năng trò chuyện, giải đáp thắc mắc, phân tích tài liệu và hình ảnh một cách tự nhiên. Khi nhận được hình ảnh màn hình hoặc đoạn ghi âm, hãy tự động hiểu rằng người dùng đang muốn bạn phân tích, giải quyết hoặc cho ý kiến về nội dung đó dựa trên ngữ cảnh hiện tại.',
      interval: 5, // in seconds
      theme: 'light', // 'dark' | 'light' - Changed default to light per user request
      captureMode: 'fullscreen', // 'fullscreen' | 'region'
      selectedRegion: null, // { x, y, width, height }
      overlayOpacity: 0.85,
      overlayPosition: { x: 100, y: 100, width: 400, height: 300 },
      audioSource: 'mic', // 'mic' | 'system'
      silenceThreshold: 0.02,
      autoSilenceDetection: true
    };
  }

  saveConfig(newConfig) {
    try {
      this.config = { ...this.config, ...newConfig };
      fs.writeFileSync(this.configFilePath, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error saving config:', error);
      return false;
    }
  }

  getConfig() {
    return this.config;
  }

  // --- Legacy History (Can be removed later) ---
  loadHistory() {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const data = fs.readFileSync(this.historyFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading history, resetting to default:', error);
    }
    return [];
  }

  saveHistory(historyList) {
    try {
      this.history = historyList;
      fs.writeFileSync(this.historyFilePath, JSON.stringify(this.history, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error saving history:', error);
      return false;
    }
  }

  getHistory() { return this.history; }
  clearHistory() { return this.saveHistory([]); }
  
  addHistoryEntry(question, answer, imageBase64 = '') {
    const entry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      question,
      answer,
      imageBase64
    };
    this.history.unshift(entry);
    if (this.history.length > 50) this.history.pop();
    this.saveHistory(this.history);
    return entry;
  }

  // --- Conversations Management (New for Chat UI) ---
  loadConversations() {
    try {
      if (fs.existsSync(this.conversationsFilePath)) {
        const data = fs.readFileSync(this.conversationsFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading conversations, resetting to default:', error);
    }
    return [];
  }

  saveConversations(conversations) {
    try {
      this.conversations = conversations;
      fs.writeFileSync(this.conversationsFilePath, JSON.stringify(this.conversations, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error saving conversations:', error);
      return false;
    }
  }

  getAllConversations() {
    // Return metadata only without full messages to save memory when listing
    const list = this.conversations.map(c => ({
      id: c.id,
      title: c.title,
      pinned: !!c.pinned,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Sort pinned to top, preserving updated time order within each group
    return list.sort((a, b) => {
      if (a.pinned === b.pinned) return 0;
      return a.pinned ? -1 : 1;
    });
  }

  getConversation(id) {
    return this.conversations.find(c => c.id === id) || null;
  }

  createConversation() {
    const newConv = {
      id: 'conv_' + Date.now().toString(),
      title: 'Đoạn chat mới',
      pinned: false,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.conversations.unshift(newConv);
    this.saveConversations(this.conversations);
    return newConv;
  }

  deleteConversation(id) {
    this.conversations = this.conversations.filter(c => c.id !== id);
    return this.saveConversations(this.conversations);
  }

  renameConversation(id, title) {
    const conv = this.getConversation(id);
    if (conv) {
      conv.title = title;
      conv.updatedAt = new Date().toISOString();
      return this.saveConversations(this.conversations);
    }
    return false;
  }

  pinConversation(id, pinned) {
    const conv = this.getConversation(id);
    if (conv) {
      conv.pinned = pinned;
      conv.updatedAt = new Date().toISOString();
      return this.saveConversations(this.conversations);
    }
    return false;
  }

  addMessage(conversationId, role, content, attachments = []) {
    let conv = this.getConversation(conversationId);
    if (!conv) {
      // If it doesn't exist, create it
      conv = this.createConversation();
    }

    const msg = {
      id: 'msg_' + Date.now().toString(),
      role, // 'user' or 'assistant'
      content,
      attachments, // Array of {type, data} (data is base64 for image, or name/text for docs)
      timestamp: new Date().toISOString()
    };

    conv.messages.push(msg);
    conv.updatedAt = new Date().toISOString();
    
    // Auto rename on first user message if it's "Đoạn chat mới"
    if (role === 'user' && conv.title === 'Đoạn chat mới' && content) {
      conv.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }

    this.saveConversations(this.conversations);
    return msg;
  }
}

module.exports = new Storage();
