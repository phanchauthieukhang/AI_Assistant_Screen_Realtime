const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

async function _processChatGemini(apiKey, sysPrompt, messageText, attachments, history, modelId, thinkingLevel, retryWithBackoff) {
  const modelToUse = modelId || 'gemini-3.5-flash';

  const formattedHistory = history.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const currentParts = [];
  if (messageText) currentParts.push({ text: messageText });

  for (const att of attachments) {
    if (att.type === 'image' && att.base64) {
      currentParts.push({
        inlineData: { data: att.base64, mimeType: att.mimeType || 'image/jpeg' }
      });
    }
  }

  if (currentParts.length === 0 && sysPrompt) {
    currentParts.push({ text: 'Hãy hỗ trợ tôi với nội dung tôi cung cấp ở trên.' });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelConfig = {
    model: modelToUse,
    systemInstruction: sysPrompt
  };

  if (thinkingLevel === 'extended') {
    modelConfig.generationConfig = {
      thinkingConfig: { thinkingBudget: -1 }
    };
  }

  const model = genAI.getGenerativeModel(modelConfig);
  const chat = model.startChat({ history: formattedHistory });

  const executeCall = () => chat.sendMessage(currentParts);
  const result = await retryWithBackoff(executeCall, 2, 800);
  return result.response.text();
}

async function _processChatOpenAI(apiKey, sysPrompt, messageText, attachments, history, modelId, reasoningEffort) {
  const openai = new OpenAI({ apiKey });
  const messages = [{ role: 'system', content: sysPrompt }];

  history.forEach(msg => messages.push({ role: msg.role, content: msg.content }));

  const currentContent = [];
  if (messageText) currentContent.push({ type: 'text', text: messageText });

  for (const att of attachments) {
    if (att.type === 'image' && att.base64) {
      currentContent.push({
        type: 'image_url',
        image_url: { url: `data:${att.mimeType || 'image/jpeg'};base64,${att.base64}` }
      });
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

async function _processChatClaude(apiKey, sysPrompt, messageText, attachments, history, modelId, effort, thinking) {
  const anthropic = new Anthropic({ apiKey });
  const messages = [];

  history.forEach(msg => messages.push({ role: msg.role, content: msg.content }));

  const currentContent = [];
  if (messageText) currentContent.push({ type: 'text', text: messageText });

  for (const att of attachments) {
    if (att.type === 'image' && att.base64) {
      currentContent.push({
        type: 'image',
        source: { type: 'base64', media_type: att.mimeType || 'image/jpeg', data: att.base64 }
      });
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
    max_tokens: 8192
  };

  if (thinking === true) {
    messageOptions.thinking = { type: 'enabled', budget_tokens: 1024 };
  }

  const response = await anthropic.messages.create(messageOptions);
  return response.content[0].text;
}

module.exports = {
  _processChatGemini,
  _processChatOpenAI,
  _processChatClaude
};
