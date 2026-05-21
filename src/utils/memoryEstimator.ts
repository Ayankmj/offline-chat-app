export interface GGUFMetadata {
  architecture: string;
  n_layers: number;
  n_embd: number;
  n_head: number;
  n_head_kv: number;
  n_vocab: number;
  n_embd_head_k: number;
  n_embd_head_v: number;
  sliding_window?: number;
  context_length?: number;
}

export interface MemoryEstimate {
  kvCacheBytes: number;
  computeBytes: number;
  totalBytes: number;
  perTokenBytes: number;
}

const BYTES_PER_WEIGHT = 0.5; // Q4_K_M average
const KV_CACHE_ELEMENT_BYTES = 2; // FP16

export function estimateModelMemory(
  metadata: GGUFMetadata,
  contextLength?: number,
): MemoryEstimate {
  const {
    n_layers,
    n_embd,
    n_head,
    n_head_kv,
    n_vocab,
    n_embd_head_k,
    n_embd_head_v,
    sliding_window,
  } = metadata;

  const ctx = contextLength || metadata.context_length || 4096;
  const effectiveCtx = sliding_window ? Math.min(ctx, sliding_window) : ctx;

  // KV cache: 2 * n_layers * ctx * (n_embd_head_k * n_head_kv + n_embd_head_v * n_head_kv) * bytes
  const kvPerLayer =
    effectiveCtx * (n_embd_head_k * n_head_kv + n_embd_head_v * n_head_kv);
  const kvCacheBytes = 2 * n_layers * kvPerLayer * KV_CACHE_ELEMENT_BYTES;

  // Compute (weights): rough estimate based on vocab and embedding size
  const weightCount = n_layers * (n_embd * n_embd * 2 + n_embd * n_vocab) + n_embd * n_vocab;
  const computeBytes = weightCount * BYTES_PER_WEIGHT;

  const totalBytes = kvCacheBytes + computeBytes;
  const perTokenBytes = kvCacheBytes / effectiveCtx;

  return {
    kvCacheBytes,
    computeBytes,
    totalBytes,
    perTokenBytes,
  };
}

export function formatMemoryBytes(bytes: number): string {
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(0)} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

export function getModelMemoryRequirement(
  modelSizeBytes: number,
  contextLength: number = 4096,
  metadata?: GGUFMetadata | null,
): MemoryEstimate {
  if (metadata) {
    return estimateModelMemory(metadata, contextLength);
  }

  // Fallback: rough estimate based on model file size
  // Q4_K_M models are ~0.5 bytes per parameter
  const estimatedParams = modelSizeBytes / BYTES_PER_WEIGHT;
  const kvCacheRough = contextLength * 64 * 2 * 2; // rough per-layer estimate

  return {
    kvCacheBytes: kvCacheRough,
    computeBytes: modelSizeBytes,
    totalBytes: modelSizeBytes + kvCacheRough,
    perTokenBytes: kvCacheRough / contextLength,
  };
}
