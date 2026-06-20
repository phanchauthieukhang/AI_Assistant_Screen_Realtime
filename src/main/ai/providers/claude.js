const Anthropic = require('@anthropic-ai/sdk');
const ragService = require('../../services/ragService');

async function askClaude(apiKey, base64Image, config, buildPrompt) {
  try {
    const anthropic = new Anthropic({ apiKey });
    const prompt = buildPrompt(config);

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

async function askClaudeWithText(apiKey, base64Image, transcribedText, config, buildPrompt) {
  try {
    const anthropic = new Anthropic({ apiKey });
    let prompt = buildPrompt(config);

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

module.exports = {
  askClaude,
  askClaudeWithText
};
