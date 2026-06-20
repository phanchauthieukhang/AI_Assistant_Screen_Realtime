const OpenAI = require('openai');
const ragService = require('../../services/ragService');

async function askOpenAI(apiKey, base64Image, config, buildPrompt) {
  try {
    const openai = new OpenAI({ apiKey });
    const prompt = buildPrompt(config);

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

async function askOpenAIWithText(apiKey, base64Image, transcribedText, config, buildPrompt) {
  try {
    const openai = new OpenAI({ apiKey });
    let prompt = buildPrompt(config);

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

module.exports = {
  askOpenAI,
  askOpenAIWithText
};
