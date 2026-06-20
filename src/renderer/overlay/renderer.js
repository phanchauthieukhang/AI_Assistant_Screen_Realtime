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

// Audio Recording and Silence Detection (VAD) Logic
async function startAudioRecording() {
  if (isRecording) return;
  
  try {
    const config = await window.api.getConfig();
    const sourceMode = config.audioSource || 'mic';
    
    let stream;
    if (sourceMode === 'system') {
      const sources = await window.api.getDesktopSources();
      if (!sources || sources.length === 0) {
        throw new Error("Không thể lấy nguồn để thu âm hệ thống.");
      }
      const screenSourceId = sources[0].id;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSourceId
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSourceId
          }
        }
      });
      stream.getVideoTracks().forEach(track => track.stop());
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    
    audioStream = stream;
    audioChunks = [];
    isRecording = true;
    
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      isRecording = false;
      if (audioChunks.length > 0 && isAutoListening) {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result.split(',')[1];
          const result = await window.api.processAudio({ base64Audio, mimeType: 'audio/webm' });
          
          // Auto restart recording after processing, if still in listening mode
          if (isAutoListening) {
            startAudioRecording();
          }
        };
        reader.readAsDataURL(audioBlob);
      }
    };
    
    mediaRecorder.start();
    
    // Silence Detection (VAD) using AnalyserNode
    if (config.autoSilenceDetection !== false) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioSourceNode = audioContext.createMediaStreamSource(stream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      audioSourceNode.connect(analyserNode);
      
      const bufferLength = analyserNode.fftSize;
      const dataArray = new Float32Array(bufferLength);
      const threshold = config.silenceThreshold !== undefined ? config.silenceThreshold : 0.02;
      const silenceDuration = 500; // 0.5 seconds of silence
      silenceStart = null;
      
      const checkSilence = () => {
        if (!isRecording) return;
        
        analyserNode.getFloatTimeDomainData(dataArray);
        
        let sumSquares = 0.0;
        for (let i = 0; i < bufferLength; i++) {
          sumSquares += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        
        if (rms < threshold) {
          if (silenceStart === null) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > silenceDuration) {
            console.log("Silence detected! Automatically processing answer...");
            stopAudioRecording(true);
            return;
          }
        } else {
          silenceStart = null;
        }
        
        if (isRecording) {
          checkSilenceIntervalId = requestAnimationFrame(checkSilence);
        }
      };
      
      checkSilenceIntervalId = requestAnimationFrame(checkSilence);
    }
  } catch (error) {
    console.error("Lỗi khởi tạo âm thanh:", error);
    // Print user friendly error message on overlay
    statusLabel.textContent = `Lỗi ghi âm: ${error.message}`;
    statusLabel.style.color = '#ef4444';
    listenBadge.style.display = 'none';
    btnRecord.classList.remove('recording-active');
    isAutoListening = false;
  }
}

function stopAudioRecording(process = true) {
  if (!isRecording) return;
  isRecording = false;
  
  if (checkSilenceIntervalId) {
    cancelAnimationFrame(checkSilenceIntervalId);
    checkSilenceIntervalId = null;
  }
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    if (!process) {
      audioChunks = [];
    }
    mediaRecorder.stop();
  }
  
  if (audioContext) {
    try {
      audioContext.close();
    } catch(e){}
    audioContext = null;
  }
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }
}

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
