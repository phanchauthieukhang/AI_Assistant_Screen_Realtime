const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const { MemoryVectorStore } = require('@langchain/classic/vectorstores/memory');
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');

class RAGService {
  constructor() {
    this.vectorStore = null;
    this.embeddings = null;
    this.currentApiKey = null;
    this.documentMetadata = [];
  }

  _initEmbeddings(apiKey) {
    if (!this.embeddings || this.currentApiKey !== apiKey) {
      this.currentApiKey = apiKey;
      this.embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: apiKey,
        modelName: 'text-embedding-004'
      });
    }
  }

  async addDocumentText(apiKey, text, fileName) {
    if (!text || text.trim() === '') {
       throw new Error('Không thể đọc nội dung từ tài liệu này.');
    }

    this._initEmbeddings(apiKey);
    
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await textSplitter.createDocuments([text], [{ source: fileName }]);

    if (!this.vectorStore) {
      this.vectorStore = await MemoryVectorStore.fromDocuments(docs, this.embeddings);
    } else {
      await this.vectorStore.addDocuments(docs);
    }
    
    if (!this.documentMetadata.includes(fileName)) {
      this.documentMetadata.push(fileName);
    }
    
    return { success: true, chunksAdded: docs.length, documentName: fileName };
  }

  async getRelevantContext(apiKey, query, topK = 4) {
    if (!this.vectorStore || !query || query.trim() === '') {
      return '';
    }
    
    this._initEmbeddings(apiKey);
    
    try {
      const results = await this.vectorStore.similaritySearch(query, topK);
      if (results && results.length > 0) {
        const contextTexts = results.map((r) => `--- Đoạn trích từ ${r.metadata.source} ---\n${r.pageContent}`).join('\n\n');
        return `\n\n[DỮ LIỆU TÀI LIỆU THAM KHẢO RAG]:\n${contextTexts}\n[KẾT THÚC DỮ LIỆU THAM KHẢO RAG]\n`;
      }
    } catch(err) {
      console.warn("RAG Search failed, skipping context", err.message);
    }
    return '';
  }

  clearDocuments() {
    this.vectorStore = null;
    this.documentMetadata = [];
  }
  
  hasDocuments() {
    return this.vectorStore !== null;
  }
  
  getLoadedDocuments() {
    return this.documentMetadata;
  }
}

module.exports = new RAGService();
