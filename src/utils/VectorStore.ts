import {Embedding} from '../services/EmbeddingService';

export interface VectorRecord {
  id: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export class VectorStore {
  private records: VectorRecord[] = [];
  private indexBuilt = false;

  add(record: VectorRecord): void {
    this.records.push(record);
    this.indexBuilt = false;
  }

  addBatch(records: VectorRecord[]): void {
    this.records.push(...records);
    this.indexBuilt = false;
  }

  remove(id: string): boolean {
    const initialLength = this.records.length;
    this.records = this.records.filter(r => r.id !== id);
    if (this.records.length < initialLength) {
      this.indexBuilt = false;
      return true;
    }
    return false;
  }

  clear(): void {
    this.records = [];
    this.indexBuilt = false;
  }

  search(queryEmbedding: Embedding, topK: number = 5): VectorSearchResult[] {
    if (this.records.length === 0) {
      return [];
    }

    const queryArray = Array.from(queryEmbedding);
    const results: VectorSearchResult[] = [];

    for (const record of this.records) {
      const score = this.cosineSimilarity(queryArray, record.embedding);
      results.push({
        id: record.id,
        score,
        metadata: record.metadata,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  getById(id: string): VectorRecord | undefined {
    return this.records.find(r => r.id === id);
  }

  size(): number {
    return this.records.length;
  }

  serialize(): string {
    return JSON.stringify({
      records: this.records.map(r => ({
        ...r,
        embedding: Array.from(r.embedding),
      })),
      version: 1,
    });
  }

  deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.records && Array.isArray(parsed.records)) {
        this.records = parsed.records.map((r: any) => ({
          ...r,
          embedding: new Float32Array(r.embedding),
        }));
        this.indexBuilt = true;
      }
    } catch {
      this.records = [];
      this.indexBuilt = false;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
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
}
