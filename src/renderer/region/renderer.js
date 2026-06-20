const canvas = document.getElementById('region-canvas');
const ctx = canvas.getContext('2d');

let startX = 0;
let startY = 0;
let isDrawing = false;

// Setup canvas bounds matching screen size
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  drawOverlay();
}

// Draw dim background overlay with highlighted clear selection box
function drawOverlay(x = 0, y = 0, w = 0, h = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 1. Draw darkened overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 2. Clear target region if drawn
  if (w > 0 && h > 0) {
    ctx.clearRect(x, y, w, h);
    
    // 3. Draw border outline
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]); // Reset
    
    // 4. Draw corner grips
    ctx.fillStyle = '#6366f1';
    const gripSize = 6;
    ctx.fillRect(x - gripSize/2, y - gripSize/2, gripSize, gripSize); // Top-left
    ctx.fillRect(x + w - gripSize/2, y - gripSize/2, gripSize, gripSize); // Top-right
    ctx.fillRect(x - gripSize/2, y + h - gripSize/2, gripSize, gripSize); // Bottom-left
    ctx.fillRect(x + w - gripSize/2, y + h - gripSize/2, gripSize, gripSize); // Bottom-right
    
    // 5. Draw size badge label
    const badgeText = `${w} x ${h}px`;
    ctx.font = 'bold 11px monospace';
    const textWidth = ctx.measureText(badgeText).width;
    
    // Determine label position (always on top, shift to inside if at top boundary)
    const labelY = y - 8 > 20 ? y - 8 : y + 16;
    const labelX = x + 4;
    
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(labelX - 4, labelY - 12, textWidth + 8, 16);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillText(badgeText, labelX, labelY);
  }
}

// Event Listeners for dragging selection
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // Left mouse button only
  
  startX = e.clientX;
  startY = e.clientY;
  isDrawing = true;
  
  drawOverlay(startX, startY, 0, 0);
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const w = Math.abs(startX - currentX);
  const h = Math.abs(startY - currentY);
  
  drawOverlay(x, y, w, h);
});

canvas.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  isDrawing = false;
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const w = Math.abs(startX - currentX);
  const h = Math.abs(startY - currentY);
  
  // Submit if box size is meaningful (e.g. >15px width/height)
  if (w > 15 && h > 15) {
    window.api.sendRegionCaptured({ x, y, width: w, height: h });
  } else {
    window.api.sendRegionCancel();
  }
});

// ESC key listener to abort selection
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.api.sendRegionCancel();
  }
});

window.addEventListener('resize', resizeCanvas);

// Initial call
resizeCanvas();
