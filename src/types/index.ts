export enum ModelOrigin {
  PRESET = 'PRESET',
  HF = 'HF',
  LOCAL = 'LOCAL',
  REMOTE = 'REMOTE',
}

export enum ModelType {
  LLM = 'LLM',
  PROJECTION = 'PROJECTION',
}

export interface ChatTemplateConfig {
  name: string;
  addBosToken: boolean;
  addEosToken: boolean;
  bosToken: string;
  eosToken: string;
  chatTemplate: string;
  addGenerationPrompt: boolean;
}

export interface CompletionParams {
  prompt?: string;
  n_predict?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  min_p?: number;
  xtc_threshold?: number;
  xtc_probability?: number;
  typical_p?: number;
  penalty_last_n?: number;
  penalty_repeat?: number;
  penalty_freq?: number;
  penalty_present?: number;
  mirostat?: number;
  mirostat_tau?: number;
  mirostat_eta?: number;
  penalize_nl?: boolean;
  seed?: number;
  n_probs?: number;
  stop?: string[];
  messages?: ChatMessage[];
  enable_thinking?: boolean;
  include_thinking_in_context?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{type: string; text?: string; image_url?: {url: string}}>;
}

export interface ModelFile {
  rfilename: string;
  size?: number;
  oid?: string;
  lfs?: {
    oid: string;
    size: number;
    pointerSize: number;
  };
  canFitInStorage?: boolean;
}

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

export interface Model {
  id: string;
  name: string;
  author: string;
  origin: ModelOrigin;
  isDownloaded: boolean;
  isLocal: boolean;
  size: number;
  params: number;
  downloadUrl: string;
  hfUrl: string;
  progress: number;
  filename: string;
  fullPath?: string;
  defaultChatTemplate: ChatTemplateConfig;
  chatTemplate: ChatTemplateConfig;
  defaultStopWords: string[];
  stopWords: string[];
  defaultCompletionSettings: CompletionParams;
  completionSettings: CompletionParams;
  supportsMultimodal?: boolean;
  supportsAudio?: boolean;
  supportsThinking?: boolean;
  thinkingStartTag?: string;
  thinkingEndTag?: string;
  defaultProjectionModel?: string;
  compatibleProjectionModels?: string[];
  modelType?: ModelType;
  visionEnabled?: boolean;
  repo?: string;
  hfModel?: HuggingFaceModel;
  hfModelFile?: ModelFile;
  ggufMetadata?: GGUFMetadata;
  hash?: string;
  downloadSpeed?: string;
  serverId?: string;
  serverName?: string;
  remoteModelId?: string;
}

export interface HuggingFaceModel {
  id: string;
  modelId: string;
  author: string;
  sha: string;
  lastModified: string;
  private: boolean;
  disabled: boolean;
  gated: boolean | string;
  pipeline_tag: string;
  tags: string[];
  siblings: ModelFile[];
  specs?: {
    gguf?: {
      total?: number;
      architecture?: string;
      context_length?: number;
    };
  };
}

export interface HuggingFaceModelsResponse {
  models: HuggingFaceModel[];
  nextLink: string | null;
}

export interface ModelFileDetails {
  type: string;
  oid: string;
  size: number;
  path: string;
  lfs?: {
    oid: string;
    size: number;
    pointerSize: number;
  };
}

export interface GGUFSpecs {
  _id: string;
  id: string;
  gguf: {
    total?: number;
    architecture?: string;
    context_length?: number;
    chat_template?: string;
    eos_token?: string;
    bos_token?: string;
  };
}
