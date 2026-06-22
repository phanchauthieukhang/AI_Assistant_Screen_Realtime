const statusLabel = document.getElementById('status-label');
const autoBadge = document.getElementById('auto-badge');
const answerBox = document.getElementById('answer-box');
const contentViewport = document.getElementById('content-viewport');

const btnTheme = document.getElementById('btn-theme');
const btnClose = document.getElementById('btn-close');
const btnCaptureOverlay = document.getElementById('btn-capture-overlay');
const btnAutoCapture = document.getElementById('btn-auto-capture');
const btnRecord = document.getElementById('btn-record');
const listenBadge = document.getElementById('listen-badge');

const chatInput = document.getElementById('overlay-chat-input');
const chatSendBtn = document.getElementById('overlay-chat-send');

let isAutoListening = false;

// Audio recording state variables
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let audioSourceNode = null;
let analyserNode = null;
let silenceStart = null;
let audioStream = null;
let isRecording = false;
let checkSilenceIntervalId = null;

// -------------------------------------------------------------
// UI Control Event Handlers
// -------------------------------------------------------------

// Trigger manual capture
btnCaptureOverlay.addEventListener('click', () => {
  window.api.triggerCapture();
});

// Toggle Auto Capture
btnAutoCapture.addEventListener('click', () => {
  window.api.toggleAutoCapture();
});

// Toggle Auto Listen mode
btnRecord.addEventListener('click', () => {
  window.api.toggleAutoListen();
});

// Toggle Light / Dark Theme
btnTheme.addEventListener('click', () => {
  if (document.body.classList.contains('theme-dark')) {
    document.body.className = 'theme-light';
  } else {
    document.body.className = 'theme-dark';
  }
});

// Close Overlay
btnClose.addEventListener('click', () => {
  window.api.toggleOverlay();
});

// Chat Bar Handlers
chatSendBtn.addEventListener('click', () => {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  window.api.sendOverlayChat(text);
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    chatSendBtn.click();
  }
});

// -------------------------------------------------------------
// IPC Event Listeners from Main Process
// -------------------------------------------------------------

// Receive status updates (Capturing, Analyzing, Ready, Error)
window.api.onStatusChange((status) => {
  statusLabel.textContent = status;
  
  // Highlight working states
  if (status.includes('Lỗi')) {
    statusLabel.style.color = '#ef4444';
  } else if (status.includes('Đang')) {
    statusLabel.style.color = '#f59e0b';
  } else {
    statusLabel.style.color = 'var(--text-muted)';
  }
});

// Receive Auto-capture status updates
window.api.onAutoStatusChange((isAuto) => {
  if (isAuto) {
    autoBadge.style.display = 'inline-block';
    btnAutoCapture.classList.add('recording-active');
  } else {
    autoBadge.style.display = 'none';
    btnAutoCapture.classList.remove('recording-active');
  }
});

// Receive Auto-listen status updates
window.api.onListenStatusChange((isListening) => {
  isAutoListening = isListening;
  if (isListening) {
    listenBadge.style.display = 'inline-block';
    btnRecord.classList.add('recording-active');
    startAudioRecording();
  } else {
    listenBadge.style.display = 'none';
    btnRecord.classList.remove('recording-active');
    stopAudioRecording(false);
  }
});

// STT (Speech-to-Text) Logic
let recognition = null;
let finalTranscript = '';
let silenceTimer = null;
let isManualListening = false;
let liveTranscriptDiv = document.getElementById('live-transcript');

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error("Trình duyệt không hỗ trợ Web Speech API.");
    return null;
  }
  
  const rc = new SpeechRecognition();
  rc.continuous = true;
  rc.interimResults = true;
  rc.lang = 'vi-VN'; 
  
  rc.onresult = (event) => {
    let interimTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    
    liveTranscriptDiv.style.display = 'block';
    liveTranscriptDiv.textContent = `Đang nghe: "${finalTranscript} ${interimTranscript}"`;
    
    if (isAutoListening) {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (finalTranscript.trim() !== '') {
          sendSTTAndRestart();
        }
      }, 500); // 0.5s pause as user requested
    }
  };
  
  rc.onerror = (event) => {
    console.error("STT Error:", event.error);
    if (event.error === 'not-allowed') {
      statusLabel.textContent = `Lỗi Micro: Chưa cấp quyền`;
      stopAudioRecording(false);
    }
  };
  
  rc.onend = () => {
    if (isAutoListening || isManualListening) {
      try { rc.start(); } catch(e){}
    }
  };
  
  return rc;
}

async function startAudioRecording() {
  if (isRecording) return;
  isRecording = true;
  finalTranscript = '';
  liveTranscriptDiv.style.display = 'none';
  liveTranscriptDiv.textContent = '';
  
  if (!recognition) {
    recognition = initSpeechRecognition();
  }
  
  if (recognition) {
    try {
      recognition.start();
    } catch(e) {}
  } else {
    statusLabel.textContent = `Lỗi: Không hỗ trợ STT`;
    isAutoListening = false;
    isRecording = false;
  }
}

async function sendSTTAndRestart() {
  const textToSend = finalTranscript.trim();
  finalTranscript = ''; 
  liveTranscriptDiv.style.display = 'none';
  
  if (textToSend !== '') {
    try { recognition.stop(); } catch(e){}
    
    await window.api.processSTT(textToSend);
    
    if (isAutoListening && !isManualListening) {
      try { recognition.start(); } catch(e){}
    }
  }
}

function stopAudioRecording(process = true) {
  if (!isRecording) return;
  isRecording = false;
  clearTimeout(silenceTimer);
  
  if (recognition) {
    try { recognition.stop(); } catch(e){}
  }
  
  if (process && finalTranscript.trim() !== '') {
    sendSTTAndRestart();
  } else {
    liveTranscriptDiv.style.display = 'none';
    finalTranscript = '';
  }
}

window.api.onManualSTTChange((isListening) => {
  isManualListening = isListening;
  if (isListening) {
    if (isAutoListening) {
      isAutoListening = false;
      btnRecord.classList.remove('recording-active');
      listenBadge.style.display = 'none';
    }
    statusLabel.textContent = 'Đang nghe (Thủ công)...';
    statusLabel.style.color = '#f59e0b';
    startAudioRecording();
  } else {
    stopAudioRecording(true);
  }
});


// Receive AI answers
window.api.onNewAnswer((answer) => {
  // Render formatted text inside answer box
  const formattedText = formatMarkdown(answer);
  
  // Create answer bubble
  answerBox.innerHTML = `
    <div class="answer-text">
      ${formattedText}
    </div>
  `;

  // Auto scroll to bottom
  setTimeout(() => {
    contentViewport.scrollTop = contentViewport.scrollHeight;
  }, 50);
});

// -------------------------------------------------------------
// Markdown formatter helper
// -------------------------------------------------------------
function formatMarkdown(text) {
  if (!text) return '';
  
  // Escape HTML characters to prevent XSS
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  // Convert newlines to breaks
  escaped = escaped.replace(/\n/g, '<br>');
  
  // Format bold text (**text** or __text__)
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Format italic text (*text* or _text_)
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Format inline code (`code`)
  escaped = escaped.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // Highlight important terms/phrases like "Đáp án", "Câu trả lời"
  escaped = escaped.replace(/(Đáp án đúng|Câu trả lời|Giải thích|Đáp án|Chọn đáp án)/gi, '<strong>$1</strong>');
  
  return escaped;
}
