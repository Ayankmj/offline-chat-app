import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {chunkText} from '../utils/chunker';
import {embeddingService, EmbeddingResult} from '../services/EmbeddingService';
import {VectorStore} from '../utils/VectorStore';

export interface RagDocument {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface RagDocumentChunk {
  id: string;
  documentId: string;
  text: string;
  embedding: number[];
  chunkIndex: number;
}

export interface RagSearchResult {
  document: RagDocument;
  score: number;
  snippet: string;
  isVectorMatch?: boolean;
}

const MAX_DOCUMENTS = 100;
const MAX_CONTENT_CHARS = 12000;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from',
  'how', 'i', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this',
  'to', 'was', 'what', 'when', 'where', 'who', 'why', 'with', 'you', 'your',
]);
const MAX_QUERY_TOKENS = 24;

const VECTOR_WEIGHT = 0.6;
const LEXICAL_WEIGHT = 0.4;
const VECTOR_SIMILARITY_THRESHOLD = 0.15;

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(t => t.trim())
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
    .slice(0, MAX_QUERY_TOKENS);
}

function countPhraseOccurrences(text: string, phrase: string): number {
  if (!phrase) return 0;
  let count = 0;
  let index = 0;
  while (index >= 0) {
    index = text.indexOf(phrase, index);
    if (index >= 0) {
      count += 1;
      index += phrase.length;
    }
  }
  return count;
}

function buildSnippet(content: string, queryTokens: string[]): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const lower = normalized.toLowerCase();
  const firstHit = queryTokens
    .map(token => lower.indexOf(token))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0] ?? 0;

  const start = Math.max(0, firstHit - 120);
  const snippet = normalized.slice(start, start + 500);
  return `${start > 0 ? '...' : ''}${snippet}${start + 500 < normalized.length ? '...' : ''}`;
}

class RagStore {
  documents: RagDocument[] = [];
  chunks: RagDocumentChunk[] = [];
  enabled: boolean = true;
  useVectorSearch: boolean = true;

  private vectorStore = new VectorStore();
  private isIndexing = false;
  private vocabularyBuilt = false;

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'RagStore',
      properties: ['documents', 'chunks', 'enabled', 'useVectorSearch'],
      storage: AsyncStorage,
    }).then(() => {
      this.rebuildIndex();
    }).catch(err => {
      console.error('[RagStore] Initialization failed:', err);
    });
  }

  setEnabled(enabled: boolean) {
    runInAction(() => {
      this.enabled = enabled;
    });
  }

  setUseVectorSearch(useVector: boolean) {
    runInAction(() => {
      this.useVectorSearch = useVector;
    });
  }

  async addDocument(title: string, content: string): Promise<RagDocument> {
    const safeTitle = title.trim() || 'Untitled memory';
    const safeContent = content.trim().slice(0, MAX_CONTENT_CHARS);
    if (!safeContent) {
      throw new Error('Memory content is empty.');
    }

    const now = Date.now();
    const document: RagDocument = {
      id: makeId(),
      title: safeTitle.slice(0, 120),
      content: safeContent,
      createdAt: now,
      updatedAt: now,
    };

    runInAction(() => {
      this.documents = [document, ...this.documents].slice(0, MAX_DOCUMENTS);
    });

    await this.indexDocument(document);

    return document;
  }

  async deleteDocument(id: string) {
    runInAction(() => {
      this.documents = this.documents.filter(doc => doc.id !== id);
      this.chunks = this.chunks.filter(chunk => chunk.documentId !== id);
    });

    this.vectorStore.remove(`doc-${id}`);
  }

  clearDocuments() {
    runInAction(() => {
      this.documents = [];
      this.chunks = [];
    });
    this.vectorStore.clear();
    this.vocabularyBuilt = false;
  }

  async search(query: string, limit = 4): Promise<RagSearchResult[]> {
    if (!this.enabled || this.documents.length === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    if (this.useVectorSearch && this.chunks.length > 0) {
      return this.hybridSearch(query, queryTokens, limit);
    }

    return this.lexicalSearch(query, queryTokens, limit);
  }

  private async hybridSearch(
    query: string,
    queryTokens: string[],
    limit: number,
  ): Promise<RagSearchResult[]> {
    try {
      const queryEmbedding = await embeddingService.embed(query);
      const vectorResults = this.vectorStore.search(queryEmbedding.embedding, limit * 2);

      const documentScores = new Map<string, { vectorScore: number; lexicalScore: number; chunks: string[] }>();

      for (const vectorResult of vectorResults) {
        if (vectorResult.score < VECTOR_SIMILARITY_THRESHOLD) continue;

        const chunk = this.chunks.find(c => c.id === vectorResult.id);
        if (!chunk) continue;

        const existing = documentScores.get(chunk.documentId) || {
          vectorScore: 0,
          lexicalScore: 0,
          chunks: [],
        };

        existing.vectorScore = Math.max(existing.vectorScore, vectorResult.score);
        existing.chunks.push(chunk.text);

        documentScores.set(chunk.documentId, existing);
      }

      for (const doc of this.documents) {
        const lexicalScore = this.calculateLexicalScore(doc, queryTokens);
        const existing = documentScores.get(doc.id) || {
          vectorScore: 0,
          lexicalScore: 0,
          chunks: [],
        };

        existing.lexicalScore = lexicalScore;
        documentScores.set(doc.id, existing);
      }

      const results: RagSearchResult[] = [];

      for (const [docId, scores] of documentScores) {
        const doc = this.documents.find(d => d.id === docId);
        if (!doc) continue;

        const combinedScore =
          VECTOR_WEIGHT * scores.vectorScore +
          LEXICAL_WEIGHT * scores.lexicalScore;

        if (combinedScore <= 0) continue;

        const snippet = scores.chunks.length > 0
          ? scores.chunks[0].slice(0, 500)
          : buildSnippet(doc.content, queryTokens);

        results.push({
          document: doc,
          score: combinedScore,
          snippet,
          isVectorMatch: scores.vectorScore > 0,
        });
      }

      results.sort((a, b) => b.score - a.score || b.document.updatedAt - a.document.updatedAt);
      return results.slice(0, limit);
    } catch {
      return this.lexicalSearch(query, queryTokens, limit);
    }
  }

  private lexicalSearch(
    query: string,
    queryTokens: string[],
    limit: number,
  ): RagSearchResult[] {
    const querySet = new Set(queryTokens);
    const normalizedQuery = query.trim().toLowerCase();

    return this.documents
      .map(document => {
        const score = this.calculateLexicalScore(document, queryTokens);

        return {
          document,
          score,
          snippet: buildSnippet(document.content, queryTokens),
          isVectorMatch: false,
        };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || b.document.updatedAt - a.document.updatedAt)
      .slice(0, limit);
  }

  private calculateLexicalScore(document: RagDocument, queryTokens: string[]): number {
    const titleTokens = tokenize(document.title);
    const contentTokens = tokenize(document.content);
    const titleLower = document.title.toLowerCase();
    const contentLower = document.content.toLowerCase();
    const querySet = new Set(queryTokens);
    const normalizedQuery = queryTokens.join(' ').toLowerCase();

    let score = 0;

    titleTokens.forEach(token => {
      if (querySet.has(token)) score += 4;
    });
    contentTokens.forEach(token => {
      if (querySet.has(token)) score += 1;
    });

    const uniqueContentMatches = new Set(
      contentTokens.filter(token => querySet.has(token)),
    ).size;
    score += uniqueContentMatches * 2;

    if (normalizedQuery.length > 6) {
      score += countPhraseOccurrences(titleLower, normalizedQuery) * 10;
      score += countPhraseOccurrences(contentLower, normalizedQuery) * 6;
    }

    const recencyBoost = Math.max(
      0,
      3 - Math.floor((Date.now() - document.updatedAt) / (1000 * 60 * 60 * 24 * 7)),
    );
    score += recencyBoost;

    return score;
  }

  private pendingIndexQueue: RagDocument[] = [];

  private async indexDocument(document: RagDocument): Promise<void> {
    if (this.isIndexing) {
      this.pendingIndexQueue.push(document);
      return;
    }
    this.isIndexing = true;

    try {
      const chunks = chunkText(document.content);
      if (chunks.length === 0) return;

      const texts = chunks.map(c => `${document.title}: ${c.text}`);

      if (!this.vocabularyBuilt) {
        await embeddingService.updateVocabulary(
          this.documents.map(d => `${d.title}: ${d.content}`),
        );
        this.vocabularyBuilt = true;
      }

      const embeddings = await embeddingService.embedBatch(texts);

      runInAction(() => {
        this.chunks = this.chunks.filter(c => c.documentId !== document.id);

        for (let i = 0; i < chunks.length; i++) {
          const chunkId = `chunk-${document.id}-${i}`;
          this.chunks.push({
            id: chunkId,
            documentId: document.id,
            text: chunks[i].text,
            embedding: embeddingService.serialize(embeddings[i].embedding),
            chunkIndex: i,
          });
        }
      });

      this.vectorStore.remove(`doc-${document.id}`);
      this.vectorStore.add({
        id: `doc-${document.id}`,
        embedding: this.aggregateEmbedding(embeddings),
        metadata: {
          documentId: document.id,
          title: document.title,
          chunkCount: chunks.length,
        },
      });
    } finally {
      this.isIndexing = false;

      const next = this.pendingIndexQueue.shift();
      if (next) {
        await this.indexDocument(next);
      }
    }
  }

  private async rebuildIndex(): Promise<void> {
    if (this.documents.length === 0) return;

    if (this.vocabularyBuilt && this.chunks.length > 0) {
      const expectedDocs = this.documents.length;
      const actualDocIds = new Set(this.chunks.map(c => c.documentId)).size;
      const expectedChunkCount = this.documents.reduce(
        (sum, doc) => sum + chunkText(doc.content).length,
        0,
      );
      if (
        actualDocIds === expectedDocs &&
        this.chunks.length === expectedChunkCount
      ) {
        return;
      }
    }

    this.isIndexing = true;
    try {
      const allTexts = this.documents.map(d => `${d.title}: ${d.content}`);
      await embeddingService.updateVocabulary(allTexts);
      this.vocabularyBuilt = true;

      for (const doc of this.documents) {
        await this.indexDocument(doc);
      }
    } finally {
      this.isIndexing = false;
    }
  }

  private aggregateEmbedding(embeddings: EmbeddingResult[]): number[] {
    if (embeddings.length === 0) return [];

    const dimensions = embeddings[0].embedding.length;
    const aggregated = new Float32Array(dimensions);

    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        aggregated[i] += embedding.embedding[i];
      }
    }

    for (let i = 0; i < dimensions; i++) {
      aggregated[i] /= embeddings.length;
    }

    return Array.from(aggregated);
  }
}

export const ragStore = new RagStore();
