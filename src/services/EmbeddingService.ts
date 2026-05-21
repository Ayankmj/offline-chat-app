export type Embedding = Float32Array;

export interface EmbeddingResult {
  embedding: Embedding;
  dimensions: number;
}

const EMBEDDING_DIMENSIONS = 384;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
  'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'its', 'our', 'their', 'what', 'which', 'who', 'whom',
  'when', 'where', 'why', 'how', 'not', 'no', 'nor', 'so', 'if',
  'then', 'than', 'too', 'very', 'just', 'about', 'up', 'out',
]);

class EmbeddingService {
  private vocabulary = new Map<string, number>();
  private idf = new Map<string, number>();
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.vocabulary.clear();
    this.idf.clear();
    this.isInitialized = true;
  }

  async updateVocabulary(texts: string[]): Promise<void> {
    const docCount = texts.length;
    const termDocFreq = new Map<string, number>();

    for (const text of texts) {
      const terms = this.tokenize(text);
      const uniqueTerms = new Set(terms);

      for (const term of uniqueTerms) {
        termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
      }
    }

    for (const [term, freq] of termDocFreq) {
      if (!this.vocabulary.has(term)) {
        this.vocabulary.set(term, this.vocabulary.size);
      }
      this.idf.set(term, Math.log((docCount + 1) / (freq + 1)) + 1);
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const terms = this.tokenize(text);
    const termFreq = new Map<string, number>();

    for (const term of terms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }

    const maxFreq = Math.max(...termFreq.values(), 1);
    const vector = new Float32Array(EMBEDDING_DIMENSIONS);

    for (const [term, freq] of termFreq) {
      const vocabIndex = this.vocabulary.get(term);
      if (vocabIndex === undefined) continue;

      const tf = 0.5 + (0.5 * freq) / maxFreq;
      const idf = this.idf.get(term) || 1;
      const weight = tf * idf;

      const dimIndex = vocabIndex % EMBEDDING_DIMENSIONS;
      vector[dimIndex] += weight;
    }

    this.normalize(vector);

    return {
      embedding: vector,
      dimensions: EMBEDDING_DIMENSIONS,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for (const text of texts) {
      const result = await this.embed(text);
      results.push(result);
    }

    return results;
  }

  cosineSimilarity(a: Embedding, b: Embedding): number {
    if (a.length !== b.length) {
      throw new Error('Embedding dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  serialize(embedding: Embedding): number[] {
    return Array.from(embedding);
  }

  deserialize(data: number[]): Embedding {
    return new Float32Array(data);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1 && !STOP_WORDS.has(token));
  }

  private normalize(vector: Float32Array): void {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
  }
}

export const embeddingService = new EmbeddingService();
