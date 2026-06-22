// --- DOM Elements ---
const el = {
  // Window
  btnMin: document.getElementById('btn-minimize'),
  btnMax: document.getElementById('btn-maximize'),
  btnClose: document.getElementById('btn-close'),
  
  // Sidebar
  btnNewChat: document.getElementById('btn-new-chat'),
  convList: document.getElementById('conversation-list'),
  btnOpenSettings: document.getElementById('btn-open-settings'),
  
  // Chat Area
  chatTitle: document.getElementById('current-chat-title'),
  chatMessages: document.getElementById('chat-messages'),
  welcomeScreen: document.getElementById('welcome-screen'),
  
  // New Header & Status
  btnModelSelector: document.getElementById('btn-model-selector'),
  modelPopup: document.getElementById('model-popup'),
  currentModelName: document.getElementById('current-model-name'),
  typingIndicator: document.getElementById('typing-indicator'),
  
  // Input
  btnAttach: document.getElementById('btn-attach'),
  fileInput: document.getElementById('file-input'),
  chatInput: document.getElementById('chat-input'),
  btnToggleScreen: document.getElementById('btn-toggle-screen'),
  btnToggleListen: document.getElementById('btn-toggle-listen'),
  btnSend: document.getElementById('btn-send'),
  previewArea: document.getElementById('attachments-preview'),
  
  // Settings
  settingsOverlay: document.getElementById('settings-overlay'),
  settingsPanel: document.getElementById('settings-panel'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  saveStatus: document.getElementById('save-status'),
  
  // Config inputs
  keyGemini: document.getElementById('key-gemini'),
  keyOpenAI: document.getElementById('key-openai'),
  keyClaude: document.getElementById('key-claude'),
  sysPrompt: document.getElementById('system-prompt'),
  capInterval: document.getElementById('capture-interval'),
  capMode: document.getElementById('capture-mode'),
  btnSelectRegion: document.getElementById('btn-select-region'),
  audioSource: document.getElementById('audio-source')
};

// --- State ---
let currentConfig = {};
let conversations = [];
let activeConversationId = null;
let pendingAttachments = []; // Array of {type, data/base64, name, mimeType}
let messageObserver = null;

// --- Window Controls ---
el.btnMin.addEventListener('click', () => window.api.windowMinimize());
el.btnMax.addEventListener('click', () => window.api.windowMaximize());
el.btnClose.addEventListener('click', () => window.api.windowClose());

// --- Initialization ---
function initMessageObserver() {
  const root = document.getElementById('chat-messages');
  messageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Find corresponding minimap item
        const minimapItem = document.querySelector(`.minimap-item[data-target-id="${entry.target.id}"]`);
        if (minimapItem) {
          // Remove active from all others
          document.querySelectorAll('.minimap-item').forEach(el => {
            el.classList.remove('active');
            el.querySelector('.minimap-marker').classList.remove('active');
          });
          minimapItem.classList.add('active');
          const marker = minimapItem.querySelector('.minimap-marker');
          if (marker) marker.classList.add('active');
        }
      }
    });
  }, {
    root: root,
    rootMargin: '-20% 0px -20% 0px',
    threshold: 0
  });
}

async function init() {
  initMessageObserver();
  currentConfig = await window.api.getConfig();
  loadConfigToUI(currentConfig);
  
  conversations = await window.api.getConversations();
  renderConversationsList();
  
  if (conversations.length > 0) {
    loadConversation(conversations[0].id);
  } else {
    createNewConversation();
  }

  // Event Listeners
  window.api.onNewChatMessage((data) => {
    if (data.conversationId === activeConversationId) {
      appendMessage(data.message);
      scrollToBottom();
      
      // Update title in sidebar if it changed
      const conv = conversations.find(c => c.id === activeConversationId);
      if (conv && data.message.role === 'user') {
         window.api.getConversations().then(list => {
             conversations = list;
             renderConversationsList();
             const c = list.find(x => x.id === activeConversationId);
             if (c) el.chatTitle.textContent = c.title;
         });
      }
    }
  });

  window.api.onConversationCreated((conv) => {
    conversations.unshift(conv);
    renderConversationsList();
    loadConversation(conv.id);
  });

  window.api.onStatusChange((status) => {
    if (status === 'AI đang suy nghĩ...' || status === 'Đang phân tích âm thanh & hình ảnh...' || status === 'Đang gửi AI phân tích...') {
      el.typingIndicator.style.display = 'flex';
      scrollToBottom();
    } else {
      el.typingIndicator.style.display = 'none';
    }
  });

  window.api.onAutoStatusChange((isAuto) => {
    if (isAuto) el.btnToggleScreen.classList.add('active');
    else el.btnToggleScreen.classList.remove('active');
  });

  // Model Selector Toggle
  el.btnModelSelector.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isShowing = el.modelPopup.classList.contains('show');
    if (!isShowing) {
      await buildModelPopup();
    }
    el.modelPopup.classList.toggle('show');
  });

  // Close popup when clicking outside
  document.addEventListener('click', (e) => {
    if (!el.modelPopup.contains(e.target) && !el.btnModelSelector.contains(e.target)) {
      el.modelPopup.classList.remove('show');
    }
    
    // Close context menu if open
    const contextMenu = document.querySelector('.conv-context-menu');
    if (contextMenu && !contextMenu.contains(e.target)) {
        contextMenu.remove();
    }
  });
}

// --- Model Popup Builder ---
async function buildModelPopup() {
  const catalog = await window.api.getModelCatalog();
  const currentSpecific = currentConfig.selectedSpecificModel || 'gemini-3.5-flash';
  
  el.modelPopup.innerHTML = '';
  
  // Render Providers and Models
  Object.keys(catalog).forEach(provider => {
    const models = catalog[provider];
    if (!models || models.length === 0) return;
    
    models.forEach(m => {
      const isSelected = m.id === currentSpecific;
      const item = document.createElement('div');
      item.className = `model-item ${isSelected ? 'selected' : ''}`;
      
      item.innerHTML = `
        <div class="model-info">
          <span class="model-name">${m.label}</span>
          ${m.description ? `<span class="model-desc">${m.description}</span>` : ''}
        </div>
        ${isSelected ? `<span class="model-check">✓</span>` : ''}
      `;
      
      item.onclick = async () => {
        const newConfig = { ...currentConfig, selectedModel: provider, selectedSpecificModel: m.id };
        const ok = await window.api.saveConfig(newConfig);
        if (ok) {
            currentConfig = await window.api.getConfig();
            el.currentModelName.textContent = m.label;
            el.modelPopup.classList.remove('show');
        }
      };
      
      el.modelPopup.appendChild(item);
    });
  });

  el.modelPopup.appendChild(document.createElement('div')).className = 'model-divider';

  // Render Provider specific options (Thinking / Effort)
  const currentProvider = currentConfig.selectedModel || 'gemini';
  const thinkingSection = document.createElement('div');
  thinkingSection.className = 'thinking-section';
  
  if (currentProvider === 'gemini') {
    const isExtended = currentConfig.thinkingLevel === 'extended';
    thinkingSection.innerHTML = `
      <div class="thinking-title">Cấp độ tư duy</div>
      <div class="thinking-options">
        <div class="thinking-option ${!isExtended ? 'active' : ''}" data-val="standard">Tiêu chuẩn</div>
        <div class="thinking-option ${isExtended ? 'active' : ''}" data-val="extended">Mở rộng</div>
      </div>
    `;
    thinkingSection.querySelectorAll('.thinking-option').forEach(opt => {
        opt.onclick = async (e) => {
            e.stopPropagation(); // keep popup open
            const newConfig = { ...currentConfig, thinkingLevel: opt.dataset.val };
            if (await window.api.saveConfig(newConfig)) {
                currentConfig = await window.api.getConfig();
                buildModelPopup(); // re-render
            }
        };
    });
  } else if (currentProvider === 'openai') {
    const eff = currentConfig.reasoningEffort || 'low';
    thinkingSection.innerHTML = `
      <div class="thinking-title">Độ thông minh (o3/gpt-5)</div>
      <div class="thinking-options">
        <div class="thinking-option ${eff === 'low' ? 'active' : ''}" data-val="low">Thấp</div>
        <div class="thinking-option ${eff === 'medium' ? 'active' : ''}" data-val="medium">TB</div>
        <div class="thinking-option ${eff === 'high' ? 'active' : ''}" data-val="high">Cao</div>
      </div>
    `;
    thinkingSection.querySelectorAll('.thinking-option').forEach(opt => {
        opt.onclick = async (e) => {
            e.stopPropagation();
            const newConfig = { ...currentConfig, reasoningEffort: opt.dataset.val };
            if (await window.api.saveConfig(newConfig)) {
                currentConfig = await window.api.getConfig();
                buildModelPopup();
            }
        };
    });
  } else if (currentProvider === 'claude') {
    const eff = currentConfig.claudeEffort || 'low';
    const isThinking = currentConfig.claudeThinking === true;
    thinkingSection.innerHTML = `
      <div class="thinking-title">Thinking</div>
      <div class="thinking-options">
        <div class="thinking-option ${!isThinking ? 'active' : ''}" data-think="false">Tắt</div>
        <div class="thinking-option ${isThinking ? 'active' : ''}" data-think="true">Bật</div>
      </div>
      <div class="thinking-title" style="margin-top: 12px;">Effort</div>
      <div class="thinking-options">
        <div class="thinking-option ${eff === 'low' ? 'active' : ''}" data-val="low">Thấp</div>
        <div class="thinking-option ${eff === 'medium' ? 'active' : ''}" data-val="medium">TB</div>
        <div class="thinking-option ${eff === 'high' ? 'active' : ''}" data-val="high">Cao</div>
        <div class="thinking-option ${eff === 'max' ? 'active' : ''}" data-val="max">Max</div>
      </div>
    `;
    thinkingSection.querySelectorAll('.thinking-option').forEach(opt => {
        opt.onclick = async (e) => {
            e.stopPropagation();
            const newConfig = { ...currentConfig };
            if (opt.dataset.val) newConfig.claudeEffort = opt.dataset.val;
            if (opt.dataset.think) newConfig.claudeThinking = opt.dataset.think === 'true';
            
            if (await window.api.saveConfig(newConfig)) {
                currentConfig = await window.api.getConfig();
                buildModelPopup();
            }
        };
    });
  }
  
  el.modelPopup.appendChild(thinkingSection);
}

// --- Conversations ---
function renderConversationsList() {
  el.convList.innerHTML = '';
  conversations.forEach(c => {
    const div = document.createElement('div');
    div.className = `conv-item ${c.id === activeConversationId ? 'active' : ''} ${c.pinned ? 'pinned' : ''}`;
    
    const title = document.createElement('span');
    title.className = 'conv-title';
    title.textContent = c.title;
    
    const moreBtn = document.createElement('button');
    moreBtn.className = 'conv-more-btn';
    moreBtn.innerHTML = '⋯';
    moreBtn.title = "Tuỳ chọn";
    moreBtn.onclick = (e) => {
      e.stopPropagation();
      showContextMenu(e, c);
    };

    div.appendChild(title);
    div.appendChild(moreBtn);
    div.onclick = () => loadConversation(c.id);
    
    el.convList.appendChild(div);
  });
}

function showContextMenu(e, conv) {
  // Remove existing
  const existing = document.querySelector('.conv-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'conv-context-menu';
  
  const pinItem = document.createElement('div');
  pinItem.className = 'context-menu-item';
  pinItem.innerHTML = conv.pinned ? 'Bỏ ghim' : '📌 Ghim';
  pinItem.onclick = async () => {
      await window.api.pinConversation(conv.id, !conv.pinned);
      conversations = await window.api.getConversations();
      renderConversationsList();
      menu.remove();
  };

  const renameItem = document.createElement('div');
  renameItem.className = 'context-menu-item';
  renameItem.innerHTML = '✏️ Đổi tên';
  renameItem.onclick = () => {
      menu.remove();
      // Handle inline rename
      const convDiv = el.convList.querySelector(`.conv-item:has(button[title="Tuỳ chọn"]:hover)`) || el.convList.querySelector('.conv-item'); 
      // Simple way: prompt
      const newTitle = prompt("Nhập tên mới:", conv.title);
      if (newTitle && newTitle.trim()) {
          window.api.renameConversation(conv.id, newTitle.trim()).then(async () => {
              conversations = await window.api.getConversations();
              renderConversationsList();
              if (activeConversationId === conv.id) el.chatTitle.textContent = newTitle.trim();
          });
      }
  };

  const deleteItem = document.createElement('div');
  deleteItem.className = 'context-menu-item danger';
  deleteItem.innerHTML = '🗑️ Xoá';
  deleteItem.onclick = () => {
      menu.remove();
      if(confirm("Bạn có chắc muốn xoá?")) {
        deleteConversation(conv.id);
      }
  };

  menu.appendChild(pinItem);
  menu.appendChild(renameItem);
  menu.appendChild(deleteItem);

  // Position
  menu.style.top = `${e.clientY}px`;
  menu.style.left = `${e.clientX}px`;

  document.body.appendChild(menu);
}

async function loadConversation(id) {
  activeConversationId = id;
  window.api.setActiveConversation(id);
  renderConversationsList();
  
  const fullConv = await window.api.getConversation(id);
  el.chatTitle.textContent = fullConv ? fullConv.title : 'Đoạn chat mới';
  
  if (messageObserver) messageObserver.disconnect();
  
  el.chatMessages.innerHTML = '';
  const minimap = document.getElementById('chat-minimap');
  if (minimap) minimap.innerHTML = '';
  
  if (fullConv && fullConv.messages && fullConv.messages.length > 0) {
    fullConv.messages.forEach(msg => appendMessage(msg));
  } else {
    el.chatMessages.appendChild(el.welcomeScreen);
  }
  
  scrollToBottom();
}

async function createNewConversation() {
  const newConv = await window.api.createConversation();
  conversations.unshift(newConv);
  loadConversation(newConv.id);
}

async function deleteConversation(id) {
  await window.api.deleteConversation(id);
  conversations = conversations.filter(c => c.id !== id);
  if (activeConversationId === id) {
    if (conversations.length > 0) loadConversation(conversations[0].id);
    else createNewConversation();
  } else {
    renderConversationsList();
  }
}

el.btnNewChat.addEventListener('click', createNewConversation);

// --- Chat Rendering ---
function renderMarkdown(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  // Line breaks
  html = html.replace(/\n/g, '<br/>');

  return html;
}

function appendMessage(msg) {
  if (el.chatMessages.contains(el.welcomeScreen)) {
    el.chatMessages.removeChild(el.welcomeScreen);
  }

  const wrapper = document.createElement('div');
  wrapper.className = `message ${msg.role}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  // Render Attachments
  if (msg.attachments && msg.attachments.length > 0) {
    const attContainer = document.createElement('div');
    attContainer.className = 'message-attachments';
    
    msg.attachments.forEach(att => {
      if (att.type === 'image' || (att.mimeType && att.mimeType.startsWith('image/'))) {
        const img = document.createElement('img');
        img.className = 'attachment-img';
        img.src = `data:${att.mimeType || 'image/jpeg'};base64,${att.base64}`;
        attContainer.appendChild(img);
      } else if (att.type === 'document' || att.type === 'audio') {
        const doc = document.createElement('div');
        doc.className = 'attachment-doc';
        doc.innerHTML = `📎 ${att.fileName || 'Tài liệu'}`;
        attContainer.appendChild(doc);
      }
    });
    contentDiv.appendChild(attContainer);
  }

  // Render Text
  if (msg.content) {
    const textDiv = document.createElement('div');
    textDiv.innerHTML = renderMarkdown(msg.content);
    contentDiv.appendChild(textDiv);
  }

  const domId = msg.id || ('msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
  wrapper.id = domId;
  wrapper.appendChild(contentDiv);
  
  // -- Message Actions (Branch, Regenerate) --
  if (msg.id) { // Only show actions for saved messages
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    // Branch Button
    const branchBtn = document.createElement('button');
    branchBtn.className = 'msg-action-btn branch-btn';
    branchBtn.innerHTML = '⎇';
    branchBtn.title = 'Tạo nhánh mới từ đây';
    branchBtn.onclick = async () => {
      if(!activeConversationId) return;
      const res = await window.api.branchConversation(activeConversationId, msg.id);
      if(res && res.success) {
        // Reload into the new branch
        conversations = await window.api.getConversations();
        loadConversation(res.conversationId);
      } else {
        alert(res?.error || 'Không thể rẽ nhánh');
      }
    };
    actionsDiv.appendChild(branchBtn);

    // Regenerate Button
    if (msg.role === 'assistant') {
      const regenBtn = document.createElement('button');
      regenBtn.className = 'msg-action-btn regen-btn';
      regenBtn.innerHTML = '🔄';
      regenBtn.title = 'Tạo lại câu trả lời';
      regenBtn.onclick = async () => {
        if(!activeConversationId) return;
        const res = await window.api.regenerateMessage(activeConversationId, msg.id);
        if(res && res.success) {
          conversations = await window.api.getConversations();
          loadConversation(res.conversationId);
        } else {
          alert(res?.error || 'Lỗi tạo lại');
        }
      };
      actionsDiv.appendChild(regenBtn);
    }
    wrapper.appendChild(actionsDiv);
  }

  el.chatMessages.appendChild(wrapper);

  if (msg.role === 'user') {
    addMinimapItem(msg, domId);
    if (messageObserver) {
      messageObserver.observe(wrapper);
    }
  }
}

function addMinimapItem(msg, elementId) {
  const minimap = document.getElementById('chat-minimap');
  if (!minimap) return;
  
  const item = document.createElement('div');
  item.className = 'minimap-item';
  item.setAttribute('data-target-id', elementId);
  item.onclick = () => {
    const target = document.getElementById(elementId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.style.transition = 'background-color 0.5s';
      target.style.backgroundColor = 'rgba(138, 154, 134, 0.2)'; // highlight color
      setTimeout(() => {
        target.style.backgroundColor = 'transparent';
      }, 1000);
    }
  };
  
  const marker = document.createElement('div');
  marker.className = 'minimap-marker';
  
  const text = document.createElement('div');
  text.className = 'minimap-text';
  
  let preview = msg.content || '';
  if (!preview && msg.attachments && msg.attachments.length > 0) {
    preview = '[Đính kèm]';
  }
  preview = preview.replace(/[#*`_~]/g, '').trim();
  text.textContent = preview || '...';
  text.title = preview;
  
  item.appendChild(marker);
  item.appendChild(text);
  minimap.appendChild(item);
  
  // Auto-scroll minimap to bottom to show the newest items
  minimap.scrollTop = minimap.scrollHeight;
}

function scrollToBottom() {
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

// --- Input & Attachments ---
el.btnAttach.addEventListener('click', () => el.fileInput.click());

el.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  // Show lively loading preview
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'preview-item loading';
  loadingDiv.innerHTML = `
    <div class="doc-icon">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
    </div>
    <span class="doc-name">Đang tải: ${file.name}...</span>
    <div class="progress-bar"></div>
  `;
  el.previewArea.appendChild(loadingDiv);

  const result = await window.api.uploadChatAttachment(file.path);
  if (result.success) {
    pendingAttachments.push(result.attachment);
    renderPreviews();
    el.chatInput.focus();
    updateSendButton();
  } else {
    if (loadingDiv.parentNode) loadingDiv.parentNode.removeChild(loadingDiv);
    alert('Lỗi đính kèm: ' + result.error);
  }
  e.target.value = ''; // reset
});

// Handle Paste (Images)
el.chatInput.addEventListener('paste', async (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let index in items) {
    const item = items[index];
    if (item.kind === 'file') {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result.split(',')[1];
        pendingAttachments.push({
          type: 'image',
          base64: base64,
          mimeType: item.type
        });
        renderPreviews();
        updateSendButton();
      };
      reader.readAsDataURL(blob);
    }
  }
});

function renderPreviews() {
  el.previewArea.innerHTML = '';
  pendingAttachments.forEach((att, idx) => {
    const div = document.createElement('div');
    div.className = 'preview-item';
    
    if (att.type === 'image') {
      const img = document.createElement('img');
      img.src = `data:${att.mimeType || 'image/jpeg'};base64,${att.base64}`;
      img.style.cursor = 'zoom-in';
      img.onclick = () => showImageViewer(img.src);
      div.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'doc-icon';
      icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
      div.appendChild(icon);
    }
    
    const span = document.createElement('span');
    span.className = 'doc-name';
    span.textContent = att.fileName || 'Document';
    div.appendChild(span);
    
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-remove-preview';
    delBtn.textContent = '✕';
    delBtn.onclick = () => {
      pendingAttachments.splice(idx, 1);
      renderPreviews();
      updateSendButton();
    };
    
    div.appendChild(delBtn);
    el.previewArea.appendChild(div);
  });
}

function updateSendButton() {
  const hasText = el.chatInput.value.trim().length > 0;
  const hasAtt = pendingAttachments.length > 0;
  el.btnSend.disabled = !(hasText || hasAtt);
}

function showImageViewer(src) {
  const overlay = document.createElement('div');
  overlay.className = 'image-viewer-overlay';
  overlay.innerHTML = `
    <div class="image-viewer-modal" onclick="event.stopPropagation()">
      <div class="image-viewer-header">
        <span style="font-weight: 500; font-size: 14px;">Xem hình ảnh</span>
        <button class="image-viewer-close">✕</button>
      </div>
      <div class="image-viewer-body">
        <img src="${src}" class="image-viewer-img" />
      </div>
    </div>
  `;
  
  const closeBtn = overlay.querySelector('.image-viewer-close');
  closeBtn.onclick = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
  
  overlay.onclick = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
  
  document.body.appendChild(overlay);
}

el.chatInput.addEventListener('input', () => {
  updateSendButton();
  // auto resize
  el.chatInput.style.height = 'auto';
  el.chatInput.style.height = (el.chatInput.scrollHeight) + 'px';
});

el.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!el.btnSend.disabled) sendMessage();
  }
});

el.btnSend.addEventListener('click', sendMessage);

async function sendMessage() {
  const text = el.chatInput.value.trim();
  if (!text && pendingAttachments.length === 0) return;

  if (!activeConversationId) {
    await createNewConversation();
  }

  const payload = {
    conversationId: activeConversationId,
    text: text,
    attachments: [...pendingAttachments]
  };

  // Reset UI immediately
  el.chatInput.value = '';
  el.chatInput.style.height = 'auto';
  pendingAttachments = [];
  renderPreviews();
  updateSendButton();
  
  el.typingIndicator.style.display = 'flex';
  scrollToBottom();

  const res = await window.api.sendChatMessage(payload);
  if (!res.success) {
    alert('Lỗi gửi tin nhắn: ' + res.error);
  }
  el.typingIndicator.style.display = 'none';
}

// --- Tools ---
el.btnToggleScreen.addEventListener('click', () => window.api.toggleOverlay());

// Dictation STT feature for chat input
let dictationRecognition = null;
let isDictating = false;

function initDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const rc = new SpeechRecognition();
  rc.continuous = true;
  rc.interimResults = true;
  rc.lang = 'vi-VN';
  
  let finalDictationText = '';
  
  rc.onstart = () => {
    isDictating = true;
    el.btnToggleListen.classList.add('active');
    finalDictationText = el.chatInput.value; 
    if (finalDictationText && !finalDictationText.endsWith(' ')) finalDictationText += ' ';
  };
  
  rc.onresult = (event) => {
    let interim = '';
    let latestFinal = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        latestFinal += event.results[i][0].transcript + ' ';
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    finalDictationText += latestFinal;
    el.chatInput.value = finalDictationText + interim;
    el.chatInput.style.height = 'auto';
    el.chatInput.style.height = el.chatInput.scrollHeight + 'px';
    updateSendButton();
  };
  
  rc.onerror = (e) => {
    console.error("Dictation error", e);
    isDictating = false;
    el.btnToggleListen.classList.remove('active');
  };
  
  rc.onend = () => {
    isDictating = false;
    el.btnToggleListen.classList.remove('active');
  };
  
  return rc;
}

el.btnToggleListen.addEventListener('click', () => {
  if (!dictationRecognition) {
    dictationRecognition = initDictation();
    if (!dictationRecognition) {
      alert("Trình duyệt không hỗ trợ Web Speech API.");
      return;
    }
  }
  
  if (isDictating) {
    dictationRecognition.stop();
  } else {
    try { dictationRecognition.start(); } catch(e){}
  }
});


// --- Settings Panel ---
function toggleSettings() {
  const isShow = el.settingsPanel.classList.contains('show');
  if (isShow) {
    el.settingsPanel.classList.remove('show');
    el.settingsOverlay.classList.remove('show');
  } else {
    el.settingsPanel.classList.add('show');
    el.settingsOverlay.classList.add('show');
  }
}

el.btnOpenSettings.addEventListener('click', toggleSettings);
el.btnCloseSettings.addEventListener('click', toggleSettings);
el.settingsOverlay.addEventListener('click', toggleSettings);

function loadConfigToUI(config) {
  if (config.apiKeys) {
    el.keyGemini.value = config.apiKeys.gemini || '';
    el.keyOpenAI.value = config.apiKeys.openai || '';
    el.keyClaude.value = config.apiKeys.claude || '';
  }
  
  if (config.selectedModel) {
    const radio = document.querySelector(`input[name="selectedModel"][value="${config.selectedModel}"]`);
    if (radio) radio.checked = true;
    if (el.chatModelSelect) el.chatModelSelect.value = config.selectedModel;
  }
  
  if (config.systemPrompt) el.sysPrompt.value = config.systemPrompt;
  if (config.interval) el.capInterval.value = config.interval;
  if (config.captureMode) el.capMode.value = config.captureMode;
  if (config.audioSource) el.audioSource.value = config.audioSource;
}

el.btnSaveSettings.addEventListener('click', async () => {
  const selectedModelRadio = document.querySelector('input[name="selectedModel"]:checked');
  const selectedModel = selectedModelRadio ? selectedModelRadio.value : 'gemini';

  const newConfig = {
    apiKeys: {
      gemini: el.keyGemini.value,
      openai: el.keyOpenAI.value,
      claude: el.keyClaude.value
    },
    selectedModel,
    systemPrompt: el.sysPrompt.value,
    interval: parseInt(el.capInterval.value, 10) || 5,
    captureMode: el.capMode.value,
    audioSource: el.audioSource.value
  };

  const success = await window.api.saveConfig(newConfig);
  if (success) {
    currentConfig = await window.api.getConfig();
    el.saveStatus.textContent = 'Đã lưu cấu hình!';
    el.saveStatus.className = 'status-msg show';
    setTimeout(() => {
      el.saveStatus.className = 'status-msg';
    }, 2000);
  } else {
    el.saveStatus.textContent = 'Lỗi khi lưu!';
    el.saveStatus.className = 'status-msg show';
  }
});

el.btnSelectRegion.addEventListener('click', async () => {
  toggleSettings();
  await window.api.startRegionSelection();
});

// Start
init();
