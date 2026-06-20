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

function getModelCatalog(configuredKeys = {}) {
  const available = {};
  if (configuredKeys.gemini && configuredKeys.gemini.trim() !== '') available.gemini = MODEL_CATALOG.gemini;
  if (configuredKeys.openai && configuredKeys.openai.trim() !== '') available.openai = MODEL_CATALOG.openai;
  if (configuredKeys.claude && configuredKeys.claude.trim() !== '') available.claude = MODEL_CATALOG.claude;
  return available;
}

module.exports = {
  MODEL_CATALOG,
  getModelCatalog
};
