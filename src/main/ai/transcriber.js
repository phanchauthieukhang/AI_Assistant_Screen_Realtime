const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

async function transcribeOpenAI(apiKey, base64Audio, mimeType) {
  const fs = require('fs');
  const path = require('path');
  const { app } = require('electron');
  const tempDir = app.getPath('temp');

  const ext = mimeType && mimeType.includes('mp4') ? 'm4a' : 'webm';
  const tempFilePath = path.join(tempDir, `audio_${Date.now()}.${ext}`);
  fs.writeFileSync(tempFilePath, Buffer.from(base64Audio, 'base64'));

  try {
    const openai = new OpenAI({ apiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
    });
    return transcription.text;
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } catch (err) { }
  }
}

async function transcribeGemini(apiKey, base64Audio, mimeType) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const audioPart = {
    inlineData: {
      data: base64Audio,
      mimeType: mimeType || 'audio/webm'
    }
  };
  const prompt = "Hãy chép lại chính xác (transcribe) toàn bộ lời nói trong đoạn ghi âm này thành văn bản tiếng Việt. Chỉ trả về văn bản đã chép lại, không thêm lời chào hay bất kỳ giải thích nào khác.";
  const result = await model.generateContent([prompt, audioPart]);
  const response = await result.response;
  return response.text();
}

async function transcribeAudio(config, base64Audio, mimeType) {
  const { apiKeys } = config;
  if (apiKeys.openai && apiKeys.openai.trim() !== '') {
    try {
      return await transcribeOpenAI(apiKeys.openai, base64Audio, mimeType);
    } catch (error) {
      console.warn('Whisper failed, falling back to Gemini:', error);
    }
  }
  if (apiKeys.gemini && apiKeys.gemini.trim() !== '') {
    try {
      return await transcribeGemini(apiKeys.gemini, base64Audio, mimeType);
    } catch (error) {
      console.warn('Gemini transcription failed:', error);
    }
  }
  throw new Error('Cần cấu hình API Key của Google Gemini hoặc OpenAI để dịch giọng nói (Transcription).');
}

module.exports = {
  transcribeOpenAI,
  transcribeGemini,
  transcribeAudio
};
