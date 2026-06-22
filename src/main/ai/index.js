const { getModelCatalog } = require('./modelCatalog');
const { askGemini, askGeminiWithAudio } = require('./providers/gemini');
const { askOpenAI, askOpenAIWithText } = require('./providers/openai');
const { askClaude, askClaudeWithText } = require('./providers/claude');
const { _processChatGemini, _processChatOpenAI, _processChatClaude } = require('./chatProcessor');
const ragService = require('../services/ragService');

class AIService {
  constructor() {
    this.contextText = '';
  }

  setContextText(text) { this.contextText = text; }
  getContextText() { return this.contextText; }

  getModelCatalog(configuredKeys = {}) {
    return getModelCatalog(configuredKeys);
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
    try { return await fn(); } catch (error) {
      const errorMsg = error.message || '';
      const isTransient = errorMsg.includes('503') || errorMsg.includes('429') || errorMsg.includes('demand') || errorMsg.includes('overloaded') || errorMsg.includes('resource exhausted') || errorMsg.includes('Service Unavailable');
      if (isTransient && retries > 0) {
        console.warn(`[AI Service] Gặp lỗi tạm thời: "${errorMsg}". Thử lại sau ${delay}ms... (Còn ${retries} lần thử)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, retries - 1, delay * 1.8);
      }
      throw error;
    }
  }

  async processRequest(config, base64Image) {
    let { selectedModel, apiKeys } = config;
    const apiKey = apiKeys[selectedModel];
    if (!apiKey || apiKey.trim() === '') throw new Error(`API Key cho model ${selectedModel.toUpperCase()} chưa được cấu hình. Vui lòng cập nhật trong phần cài đặt.`);

    const shortConfig = { ...config };
    shortConfig.systemPrompt = (config.systemPrompt || this.buildPrompt(config)) + "\n\n[QUAN TRỌNG]: Hãy trả lời thật NGẮN GỌN và trực tiếp vào trọng tâm. Ưu tiên câu trả lời từ 1 đến 3 câu. Nếu là câu hỏi trắc nghiệm, chỉ đưa ra đáp án đúng.";

    try {
      const boundBuildPrompt = (cfg) => this.buildPrompt(cfg);
      const boundRetry = (fn, r, d) => this.retryWithBackoff(fn, r, d);
      switch (selectedModel) {
        case 'gemini': return await askGemini(apiKey, base64Image, shortConfig, boundBuildPrompt, boundRetry);
        case 'openai': return await askOpenAI(apiKey, base64Image, shortConfig, boundBuildPrompt);
        case 'claude': return await askClaude(apiKey, base64Image, shortConfig, boundBuildPrompt);
        default: throw new Error(`Model không hợp lệ: ${selectedModel}`);
      }
    } catch (e) {
      throw new Error(this._translateError(e, selectedModel.toUpperCase()));
    }
  }



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
    if (!apiKey || apiKey.trim() === '') throw new Error(`API Key cho model ${targetProvider.toUpperCase()} chưa được cấu hình. Vui lòng cập nhật trong phần cài đặt.`);

    const sysPrompt = this.buildPrompt(config);

    let contextFromRAG = '';
    if (ragService.hasDocuments() && messageText && messageText.trim() !== '') {
      const geminiKey = apiKeys['gemini'];
      if (geminiKey) {
        contextFromRAG = await ragService.getRelevantContext(geminiKey, messageText);
      }
    }

    const finalMessageText = messageText + contextFromRAG;
    const boundRetry = (fn, r, d) => this.retryWithBackoff(fn, r, d);

    try {
      if (targetProvider === 'gemini') {
        return await _processChatGemini(apiKey, sysPrompt, finalMessageText, attachments, conversationHistory, targetModelId, thinkingLevel, boundRetry);
      } else if (targetProvider === 'openai') {
        return await _processChatOpenAI(apiKey, sysPrompt, finalMessageText, attachments, conversationHistory, targetModelId, reasoningEffort);
      } else if (targetProvider === 'claude') {
        return await _processChatClaude(apiKey, sysPrompt, finalMessageText, attachments, conversationHistory, targetModelId, claudeEffort, claudeThinking);
      }
      throw new Error(`Model không hợp lệ: ${targetProvider}`);
    } catch (e) {
      throw new Error(this._translateError(e, targetProvider.toUpperCase()));
    }
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
