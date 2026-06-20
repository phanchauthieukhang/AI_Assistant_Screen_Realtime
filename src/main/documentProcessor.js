const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const aiService = require('./aiService');
const storage = require('./storage');

class DocumentProcessor {
  constructor() {
    this.uploadedFiles = []; // Track uploaded file info
  }

  async processFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const stats = fs.statSync(filePath);
    
    // Check file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (stats.size > maxSize) {
      throw new Error(`File quá lớn. Vui lòng chọn file dưới 50MB.`);
    }

    let text = '';
    
    if (ext === '.txt') {
      text = fs.readFileSync(filePath, 'utf8');
    } else if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      text = data.text;
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      // For images, we read as base64 and use AI to extract the text content
      const imageBuffer = fs.readFileSync(filePath);
      const base64Image = imageBuffer.toString('base64');
      
      const config = storage.getConfig();
      const apiKey = config.apiKeys[config.selectedModel];
      
      if (!apiKey || apiKey.trim() === '') {
        throw new Error(`Cần cấu hình API Key cho ${config.selectedModel.toUpperCase()} trước khi tải ảnh tham khảo lên để trích xuất văn bản.`);
      }

      // Temporarily change context to ask AI to transcribe the reference image
      const originalContext = aiService.getContextText();
      aiService.setContextText(''); // Clear context so it doesn't feed into transcription
      
      try {
        let transcriptionPrompt = "Bạn là trợ lý OCR. Hãy đọc kỹ hình ảnh tài liệu tham khảo này và trích xuất lại toàn bộ nội dung văn bản có trong ảnh một cách chính xác nhất có thể. Không thêm bớt ý kiến hay chào hỏi.";
        
        let extractedText = '';
        if (config.selectedModel === 'gemini') {
          extractedText = await aiService.callGeminiWithFallback(apiKey, transcriptionPrompt, base64Image);
        } else if (config.selectedModel === 'openai') {
          const OpenAI = require('openai');
          const openai = new OpenAI({ apiKey });
          const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: transcriptionPrompt },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
              ]
            }]
          });
          extractedText = response.choices[0].message.content;
        } else if (config.selectedModel === 'claude') {
          const Anthropic = require('@anthropic-ai/sdk');
          const anthropic = new Anthropic({ apiKey });
          const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20240620',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
                { type: 'text', text: transcriptionPrompt }
              ]
            }]
          });
          extractedText = response.content[0].text;
        }
        text = extractedText;
      } finally {
        aiService.setContextText(originalContext); // Restore original context
      }
    } else {
      throw new Error(`Định dạng file không hỗ trợ: ${ext}`);
    }

    const fileInfo = {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      textLength: text.length,
      extractedText: text
    };

    // Add to local cache list
    this.uploadedFiles.push(fileInfo);
    this.updateCombinedContext();

    return fileInfo;
  }

  removeFile(fileName) {
    this.uploadedFiles = this.uploadedFiles.filter(f => f.name !== fileName);
    this.updateCombinedContext();
  }

  clearFiles() {
    this.uploadedFiles = [];
    this.updateCombinedContext();
  }

  getUploadedFiles() {
    return this.uploadedFiles.map(f => ({
      name: f.name,
      path: f.path,
      size: f.size,
      textLength: f.textLength
    }));
  }

  updateCombinedContext() {
    const combinedText = this.uploadedFiles.map(f => `--- Nguồn: ${f.name} ---\n${f.extractedText}\n`).join('\n');
    aiService.setContextText(combinedText);
  }
}

module.exports = new DocumentProcessor();
