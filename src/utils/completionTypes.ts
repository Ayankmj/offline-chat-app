import {ChatMessage, CompletionParams} from '../types';

export type {CompletionParams};

export interface ApiCompletionParams {
  messages?: ChatMessage[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  n_predict?: number;
  stop?: string[];
  enable_thinking?: boolean;
  reasoning_format?: 'raw' | 'html' | 'auto';
}

export interface CompletionStreamData {
  token?: string;
  content?: string;
  reasoning_content?: string;
}

export interface CompletionResult {
  text: string;
  content?: string;
  reasoning_content?: string;
  timings: {
    token_per_second: number;
    seconds_per_token: number;
    predicted_per_second?: number;
    predicted_ms?: number;
    total_time_ms?: number;
    predicted_n?: number;
    tokens_per_second?: number;
    time_to_first_token_ms?: number | null;
  };
  tokens_predicted: number;
  tokens_evaluated: number;
  truncated: boolean;
  stopped_eos: boolean;
  stopped_limit: boolean;
  stopped_word: boolean;
  stopping_word: string;
  context_full: boolean;
  interrupted: boolean;
}

export interface CompletionEngine {
  completion(
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult>;
  stopCompletion(): Promise<void>;
}


