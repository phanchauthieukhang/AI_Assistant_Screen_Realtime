const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const ragService = require('./ragService');

const MODEL_CATALOG = {
  gemini: [
    { id: 'gemini-3.5-flash', label: '3.5 Flash', description: 'Thế hệ mới tốc độ cao' },
    { id: 'gemini-3.1-pro-preview', label: '3.1 Pro (Preview)', description: 'Nâng cao, lập trình, toán học' },
    { id: 'gemini-3.1-flash-lite', label: '3.1 Flash-Lite', description: 'Phản hồi cực nhanh' }
  ],
  openai: [
    { id: 'gpt-5.5', label: 'GPT-5.5' },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.3', label: 'GPT-5.3' },
    { id: 'o3', label: 'o3' }
  ],
  claude: [
    { id: 'claude-fable-5-20260601', label: 'Fable 5', description: 'For your toughest challenges' },
    { id: 'claude-opus-4-20250514', label: 'Opus 4.8', description: 'For complex tasks' },
    { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4.6', description: 'Most efficient for everyday tasks' },
    { id: 'claude-3-5-haiku-20241022', label: 'Haiku 4.5', description: 'Fastest for quick answers' }
  ]
};

class AIService {
  constructor() {
    this.contextText = '';
  }

  setContextText(text) {
    this.contextText = text;
  }

  getContextText() {
    return this.contextText;
  }

  getModelCatalog(configuredKeys = {}) {
    const available = {};
    if (configuredKeys.gemini && configuredKeys.gemini.trim() !== '') available.gemini = MODEL_CATALOG.gemini;
    if (configuredKeys.openai && configuredKeys.openai.trim() !== '') available.openai = MODEL_CATALOG.openai;
    if (configuredKeys.claude && configuredKeys.claude.trim() !== '') available.claude = MODEL_CATALOG.claude;
    return available;
  }

  buildPrompt(config) {
    let prompt = config?.systemPrompt || `Bạn là một trợ lý AI thông minh, đa năng và thân thiện. Bạn có khả năng trò chuyện, giải đáp thắc mắc, phân tích tài liệu và hình ảnh một cách tự nhiên. Khi nhận được hình ảnh màn hình hoặc đoạn ghi âm, hãy tự động hiểu rằng người dùng đang muốn bạn phân tích, giải quyết hoặc cho ý kiến về nội dung đó dựa trên ngữ cảnh hiện hành. Hãy linh hoạt phản hồi dựa trên câu hỏi trực tiếp hoặc suy luận mục đích từ nội dung hình ảnh/âm thanh cung cấp. Trả lời bằng Tiếng Việt.`;

    prompt += '\n\n';

    if (this.contextText && this.contextText.trim().length > 0) {
      prompt += `Dưới đây là nội dung tài liệu tham khảo được tải lên bởi người dùng. Bạn hãy ƯU TIÊN sử dụng thông tin từ tài liệu này để đối chiếu và trả lời nếu có liên quan:\n--- BẮT ĐẦU TÀI LIỆU THAM KHẢO ---\n${this.contextText}\n--- KẾT THÚC TÀI LIỆU THAM KHẢO ---\n\n`;
    }

    return prompt;
  }

  async retryWithBackoff(fn, retries = 4, delay = 1000) {
    try {
      return await fn();
    } catch (error) {
      const errorMsg = error.message || '';
      const isTransient = errorMsg.includes('503') ||
        errorMsg.includes('429') ||
        errorMsg.includes('demand') ||
        errorMsg.includes('overloaded') ||
        errorMsg.includes('resource exhausted') ||
        errorMsg.includes('ResourceExhausted') ||
        errorMsg.includes('Service Unavailable');
      if (isTransient && retries > 0) {
        console.warn(`[AI Service] Gặp lỗi tạm thời: "${errorMsg}". Thử lại sau ${delay}ms... (Còn ${retries} lần thử)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, retries - 1, delay * 1.8);
      }
      throw error;
    }
  }

  async callGeminiWithFallback(apiKey, prompt, base64Image) {
    const modelsToTry = ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-2.0-flash'];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI Service] Đang thử gửi request tới Gemini sử dụng model: ${modelName}`);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: modelName
        });

        let contents = [prompt];
        if (base64Image) {
          contents.push({
            inlineData: {
              data: base64Image,
              mimeType: 'image/jpeg'
            }
          });
        }

        const executeCall = () => model.generateContent(contents);
        const result = await this.retryWithBackoff(executeCall, 2, 800);
        const response = await result.response;
        return response.text();
      } catch (error) {
        console.warn(`[AI Service] Model ${modelName} thất bại: ${error.message}. Chuyển sang model dự phòng...`);
        lastError = error;
      }
    }
    throw lastError;
  }

  async askGemini(apiKey, base64Image, config) {
    try {
      const prompt = this.buildPrompt(config);
      return await this.callGeminiWithFallback(apiKey, prompt, base64Image);
    } catch (error) {
      console.error('Gemini API Error:', error);
      throw new Error(`Gemini Error: ${error.message}`);
    }
  }

  async askOpenAI(apiKey, base64Image, config) {
    try {
      const openai = new OpenAI({ apiKey });
      const prompt = this.buildPrompt(config);

      const content = [{ type: 'text', text: prompt }];
      if (base64Image) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${base64Image}` }
        });
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content }]
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error(`OpenAI Error: ${error.message}`);
    }
  }

  async askClaude(apiKey, base64Image, config) {
    try {
      const anthropic = new Anthropic({ apiKey });
      const prompt = this.buildPrompt(config);

      const content = [];
      if (base64Image) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64Image }
        });
      }
      content.push({ type: 'text', text: prompt });

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 8192,
        messages: [{ role: 'user', content }]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Claude API Error:', error);
      throw new Error(`Claude Error: ${error.message}`);
    }
  }

  async transcribeOpenAI(apiKey, base64Audio, mimeType) {
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

  async transcribeGemini(apiKey, base64Audio, mimeType) {
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

  async transcribeAudio(config, base64Audio, mimeType) {
    const { apiKeys } = config;
    if (apiKeys.openai && apiKeys.openai.trim() !== '') {
      try {
        return await this.transcribeOpenAI(apiKeys.openai, base64Audio, mimeType);
      } catch (error) {
        console.warn('Whisper failed, falling back to Gemini:', error);
      }
    }
    if (apiKeys.gemini && apiKeys.gemini.trim() !== '') {
      try {
        return await this.transcribeGemini(apiKeys.gemini, base64Audio, mimeType);
      } catch (error) {
        console.warn('Gemini transcription failed:', error);
      }
    }
    throw new Error('Cần cấu hình API Key của Google Gemini hoặc OpenAI để dịch giọng nói (Transcription).');
  }

  async askGeminiWithAudio(apiKey, base64Audio, base64Image, mimeType, config) {
    try {
      const prompt = `Bạn là một trợ lý AI thông minh đọc màn hình và nghe giọng nói thời gian thực.
Hãy nghe đoạn ghi âm sau đây (chứa câu hỏi hoặc câu nói thuyết minh), kết hợp với hình ảnh chụp màn hình được cung cấp để đối chiếu ngữ cảnh (nếu cần), và trả lời câu hỏi một cách ngắn gọn, chính xác, trực diện nhất. Trả lời bằng Tiếng Việt.`;

      const fullPrompt = this.contextText && this.contextText.trim().length > 0
        ? `${prompt}\n\nDưới đây là tài liệu tham khảo được cung cấp bởi người dùng, hãy ưu tiên đối chiếu thông tin trong tài liệu này trước:\n--- BẮT ĐẦU TÀI LIỆU ---\n${this.contextText}\n--- KẾT THÚC TÀI LIỆU ---`
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
          const result = await this.retryWithBackoff(executeCall, 2, 800);
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

  async askOpenAIWithText(apiKey, base64Image, transcribedText, config) {
    try {
      const openai = new OpenAI({ apiKey });
      let prompt = this.buildPrompt(config);

      if (ragService.hasDocuments() && config.apiKeys['gemini']) {
        const context = await ragService.getRelevantContext(config.apiKeys['gemini'], transcribedText);
        prompt += context;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `${prompt}\n\nĐoạn hội thoại/câu hỏi nghe được: "${transcribedText}"` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
          ]
        }]
      });
      return response.choices[0].message.content;
    } catch (error) {
      throw new Error(`OpenAI Error: ${error.message}`);
    }
  }

  async askClaudeWithText(apiKey, base64Image, transcribedText, config) {
    try {
      const anthropic = new Anthropic({ apiKey });
      let prompt = this.buildPrompt(config);

      if (ragService.hasDocuments() && config.apiKeys['gemini']) {
        const context = await ragService.getRelevantContext(config.apiKeys['gemini'], transcribedText);
        prompt += context;
      }

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
            { type: 'text', text: `${prompt}\n\nĐoạn hội thoại/câu hỏi nghe được: "${transcribedText}"` }
          ]
        }]
      });
      return response.content[0].text;
    } catch (error) {
      throw new Error(`Claude Error: ${error.message}`);
    }
  }

  async processRequest(config, base64Image) {
    let { selectedModel, selectedSpecificModel, apiKeys } = config;
    const apiKey = apiKeys[selectedModel];

    if (!apiKey || apiKey.trim() === '') {
      throw new Error(`API Key cho model ${selectedModel.toUpperCase()} chưa được cấu hình. Vui lòng cập nhật trong phần cài đặt.`);
    }

    const shortConfig = { ...config };
    shortConfig.systemPrompt = (config.systemPrompt || this.buildPrompt(config)) + "\n\n[QUAN TRỌNG]: Hãy trả lời thật NGẮN GỌN và trực tiếp vào trọng tâm. Ưu tiên câu trả lời từ 1 đến 3 câu. Nếu là câu hỏi trắc nghiệm, chỉ đưa ra đáp án đúng.";

    try {
      switch (selectedModel) {
        case 'gemini': return await this.askGemini(apiKey, base64Image, shortConfig);
        case 'openai': return await this.askOpenAI(apiKey, base64Image, shortConfig);
        case 'claude': return await this.askClaude(apiKey, base64Image, shortConfig);
        default: throw new Error(`Model không hợp lệ: ${selectedModel}`);
      }
    } catch (e) {
      throw new Error(this._translateError(e, selectedModel.toUpperCase()));
    }
  }

  async processAudioRequest(config, base64Audio, base64Image, mimeType) {
    let { selectedModel, selectedSpecificModel, apiKeys } = config;
    const apiKey = apiKeys[selectedModel];

    if (!apiKey || apiKey.trim() === '') {
      throw new Error(`API Key cho model ${selectedModel.toUpperCase()} chưa được cấu hình. Vui lòng cập nhật trong phần cài đặt.`);
    }

    try {
      switch (selectedModel) {
        case 'gemini':
          return await this.askGeminiWithAudio(apiKey, base64Audio, base64Image, mimeType, config);
        case 'openai': {
          const text = await this.transcribeAudio(config, base64Audio, mimeType);
          return await this.askOpenAIWithText(apiKey, base64Image, text, config);
        }
        case 'claude': {
          const text = await this.transcribeAudio(config, base64Audio, mimeType);
          return await this.askClaudeWithText(apiKey, base64Image, text, config);
        }
        default: throw new Error(`Model không hợp lệ: ${selectedModel}`);
      }
    } catch (e) {
      throw new Error(this._translateError(e, selectedModel.toUpperCase()));
    }
  }

  // --- NEW: Chat Interface Processing ---
  async processChatMessage(config, messageText, attachments, conversationHistory, modelOverride = null) {
    let { selectedModel, apiKeys, selectedSpecificModel, thinkingLevel, reasoningEffort, claudeEffort, claudeThinking } = config;

    let targetProvider = selectedModel;
    let targetModelId = selectedSpecificModel;

    if (modelOverride && modelOverride.modelId) {
      targetModelId = modelOverride.modelId;
      if (targetModelId.startsWith('gemini')) targetProvider = 'gemini';
      else if (targetModelId.startsWith('gpt') || targetModelId.startsWith('o')) targetProvider = 'openai';
      else if (targetModelId.startsWith('claude')) targetProvider = 'claude';

      thinkingLevel = modelOverride.thinkingLevel || thinkingLevel;
      reasoningEffort = modelOverride.reasoningEffort || reasoningEffort;
      claudeEffort = modelOverride.claudeEffort || claudeEffort;
      claudeThinking = modelOverride.claudeThinking !== undefined ? modelOverride.claudeThinking : claudeThinking;
    }

    const apiKey = apiKeys[targetProvider];

    if (!apiKey || apiKey.trim() === '') {
      throw new Error(`API Key cho model ${targetProvider.toUpperCase()} chưa được cấu hình. Vui lòng cập nhật trong phần cài đặt.`);
    }

    const sysPrompt = this.buildPrompt(config);

    let contextFromRAG = '';
    if (ragService.hasDocuments() && messageText && messageText.trim() !== '') {
      const geminiKey = apiKeys['gemini'];
      if (geminiKey) {
        contextFromRAG = await ragService.getRelevantContext(geminiKey, messageText);
      }
    }

    const finalMessageText = messageText + contextFromRAG;

    try {
      if (targetProvider === 'gemini') {
        return await this._processChatGemini(apiKey, sysPrompt, finalMessageText, attachments, conversationHistory, targetModelId, thinkingLevel);
      } else if (targetProvider === 'openai') {
        return await this._processChatOpenAI(apiKey, sysPrompt, finalMessageText, attachments, conversationHistory, targetModelId, reasoningEffort);
      } else if (targetProvider === 'claude') {
        return await this._processChatClaude(apiKey, sysPrompt, finalMessageText, attachments, conversationHistory, targetModelId, claudeEffort, claudeThinking);
      }
      throw new Error(`Model không hợp lệ: ${targetProvider}`);
    } catch (e) {
      throw new Error(this._translateError(e, targetProvider.toUpperCase()));
    }
  }

  async _processChatGemini(apiKey, sysPrompt, messageText, attachments, history, modelId, thinkingLevel) {
    // If no specific model, use default
    const modelToUse = modelId || 'gemini-3.5-flash';

    // Transform history to Gemini format
    const formattedHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Current message content
    const currentParts = [];
    if (messageText) currentParts.push({ text: messageText });

    for (const att of attachments) {
      if (att.type === 'image' && att.base64) {
        currentParts.push({
          inlineData: { data: att.base64, mimeType: att.mimeType || 'image/jpeg' }
        });
      } else if (att.type === 'document') {
        // We skip appending full document text if RAG is active to save tokens.
        // If it still contains text, we might log it or ignore it.
      }
    }

    if (currentParts.length === 0 && sysPrompt) {
      currentParts.push({ text: 'Hãy hỗ trợ tôi với nội dung tôi cung cấp ở trên.' });
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const modelConfig = {
        model: modelToUse,
        systemInstruction: sysPrompt
      };

      if (thinkingLevel === 'extended') {
        // Add thinking config for Gemini
        modelConfig.generationConfig = {
          thinkingConfig: {
            thinkingBudget: -1 // auto
          }
        };
      }

      const model = genAI.getGenerativeModel(modelConfig);
      const chat = model.startChat({ history: formattedHistory });

      const executeCall = () => chat.sendMessage(currentParts);
      const result = await this.retryWithBackoff(executeCall, 2, 800);
      return result.response.text();
    } catch (error) {
      throw error;
    }
  }

  async _processChatOpenAI(apiKey, sysPrompt, messageText, attachments, history, modelId, reasoningEffort) {
    const openai = new OpenAI({ apiKey });

    const messages = [{ role: 'system', content: sysPrompt }];

    // Add history
    history.forEach(msg => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Current message
    const currentContent = [];
    if (messageText) currentContent.push({ type: 'text', text: messageText });

    for (const att of attachments) {
      if (att.type === 'image' && att.base64) {
        currentContent.push({
          type: 'image_url',
          image_url: { url: `data:${att.mimeType || 'image/jpeg'};base64,${att.base64}` }
        });
      } else if (att.type === 'document') {
        // RAG context handles this
      }
    }

    if (currentContent.length === 0) {
      currentContent.push({ type: 'text', text: 'Hãy hỗ trợ tôi với nội dung tôi cung cấp ở trên.' });
    }

    messages.push({ role: 'user', content: currentContent });

    const completionOptions = {
      model: modelId || 'gpt-5.5',
      messages
    };

    if (reasoningEffort && reasoningEffort !== 'low' && (completionOptions.model.startsWith('o') || completionOptions.model.includes('gpt-5'))) {
      completionOptions.reasoning_effort = reasoningEffort;
    }

    const response = await openai.chat.completions.create(completionOptions);
    return response.choices[0].message.content;
  }

  async _processChatClaude(apiKey, sysPrompt, messageText, attachments, history, modelId, effort, thinking) {
    const anthropic = new Anthropic({ apiKey });

    const messages = [];

    // Add history
    history.forEach(msg => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Current message
    const currentContent = [];
    if (messageText) currentContent.push({ type: 'text', text: messageText });

    for (const att of attachments) {
      if (att.type === 'image' && att.base64) {
        currentContent.push({
          type: 'image',
          source: { type: 'base64', media_type: att.mimeType || 'image/jpeg', data: att.base64 }
        });
      } else if (att.type === 'document') {
        // RAG handles this
      }
    }

    if (currentContent.length === 0) {
      currentContent.push({ type: 'text', text: 'Hãy hỗ trợ tôi với nội dung tôi cung cấp ở trên.' });
    }

    messages.push({ role: 'user', content: currentContent });

    const messageOptions = {
      model: modelId || 'claude-sonnet-4-20250514',
      system: sysPrompt,
      messages,
      max_tokens: 8192 // Claude requires max_tokens
    };

    if (thinking === true) {
      messageOptions.thinking = { type: 'enabled', budget_tokens: 1024 };
    }

    // Effort could be passed if supported by the SDK/API version. 
    // Claude 3.5/Opus/Fable specific params...

    const response = await anthropic.messages.create(messageOptions);
    return response.content[0].text;
  }

  _translateError(error, provider = 'AI') {
    const msg = error.message || String(error);
    const lowerMsg = msg.toLowerCase();

    if (lowerMsg.includes('503') || lowerMsg.includes('overloaded') || lowerMsg.includes('high demand') || lowerMsg.includes('service unavailable')) {
      return `${provider}: Máy chủ hiện đang quá tải. Vui lòng thử lại sau giây lát hoặc chọn model khác.`;
    }
    if (lowerMsg.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('too many requests') || lowerMsg.includes('resource exhausted')) {
      return `${provider}: Bạn đã gửi quá nhiều yêu cầu hoặc hết dung lượng API. Vui lòng kiểm tra lại.`;
    }
    if (lowerMsg.includes('401') || lowerMsg.includes('403') || lowerMsg.includes('api key not valid') || lowerMsg.includes('unauthorized') || lowerMsg.includes('permission denied')) {
      return `${provider}: API Key không hợp lệ hoặc không có quyền truy cập. Vui lòng kiểm tra lại trong cài đặt.`;
    }
    if (lowerMsg.includes('404') || lowerMsg.includes('not found')) {
      return `${provider}: Model này không tồn tại hoặc không được hỗ trợ với API Key của bạn.`;
    }
    if (lowerMsg.includes('fetch failed') || lowerMsg.includes('network error') || lowerMsg.includes('econnreset') || lowerMsg.includes('etimedout')) {
      return `${provider}: Lỗi kết nối mạng. Vui lòng kiểm tra lại đường truyền Internet.`;
    }

    const cleanMsg = msg.replace(/^(Gemini|OpenAI|Claude)\s*(Error|API Error)?:\s*/i, '');
    return `${provider} Lỗi: ${cleanMsg}`;
  }
}

module.exports = new AIService();
