const { GoogleGenerativeAI } = require('@google/generative-ai');

async function callGeminiWithFallback(apiKey, prompt, base64Image, retryWithBackoff) {
  const modelsToTry = ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.0-flash'];
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[AI Service] Đang thử gửi request tới Gemini sử dụng model: ${modelName}`);
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });

      let contents = [prompt];
      if (base64Image) {
        contents.push({
          inlineData: { data: base64Image, mimeType: 'image/jpeg' }
        });
      }

      const executeCall = () => model.generateContent(contents);
      const result = await retryWithBackoff(executeCall, 2, 800);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.warn(`[AI Service] Model ${modelName} thất bại: ${error.message}. Chuyển sang model dự phòng...`);
      lastError = error;
    }
  }
  throw lastError;
}

async function askGemini(apiKey, base64Image, config, buildPrompt, retryWithBackoff) {
  try {
    const prompt = buildPrompt(config);
    return await callGeminiWithFallback(apiKey, prompt, base64Image, retryWithBackoff);
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error(`Gemini Error: ${error.message}`);
  }
}

async function askGeminiWithAudio(apiKey, base64Audio, base64Image, mimeType, config, contextText, retryWithBackoff) {
  try {
    const prompt = `Bạn là một trợ lý AI thông minh đọc màn hình và nghe giọng nói thời gian thực.
Hãy nghe đoạn ghi âm sau đây (chứa câu hỏi hoặc câu nói thuyết minh), kết hợp với hình ảnh chụp màn hình được cung cấp để đối chiếu ngữ cảnh (nếu cần), và trả lời câu hỏi một cách ngắn gọn, chính xác, trực diện nhất. Trả lời bằng Tiếng Việt.`;

    const fullPrompt = contextText && contextText.trim().length > 0
      ? `${prompt}\n\nDưới đây là tài liệu tham khảo được cung cấp bởi người dùng, hãy ưu tiên đối chiếu thông tin trong tài liệu này trước:\n--- BẮT ĐẦU TÀI LIỆU ---\n${contextText}\n--- KẾT THÚC TÀI LIỆU ---`
      : prompt;

    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        const imagePart = { inlineData: { data: base64Image, mimeType: 'image/jpeg' } };
        const audioPart = { inlineData: { data: base64Audio, mimeType: mimeType || 'audio/webm' } };

        const executeCall = () => model.generateContent([fullPrompt, imagePart, audioPart]);
        const result = await retryWithBackoff(executeCall, 2, 800);
        const response = await result.response;
        return response.text();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  } catch (error) {
    throw new Error(`Gemini Audio Error: ${error.message}`);
  }
}

module.exports = {
  callGeminiWithFallback,
  askGemini,
  askGeminiWithAudio
};
