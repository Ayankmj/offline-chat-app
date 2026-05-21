export interface User {
  id: string;
  name: string;
}

export namespace MessageType {
  export interface Base {
    author: User;
    createdAt: number;
    id: string;
    metadata?: MessageMetadata;
  }

  export interface Text extends Base {
    type: 'text';
    text: string;
    imageUris?: string[];
  }

  export interface System extends Base {
    type: 'system';
    text: string;
  }

  export type Any = Text | System;

  export interface PartialText {
    text: string;
    imageUris?: string[];
  }
}

export interface MessageMetadata {
  contextId?: string;
  conversationId?: string;
  copyable?: boolean;
  multimodal?: boolean;
  system?: boolean;
  timings?: {
    token_per_second: number;
    seconds_per_token: number;
    predicted_per_second?: number;
    time_to_first_token_ms?: number | null;
    // Extended analytics fields
    predicted_ms?: number;
    total_time_ms?: number;
    predicted_n?: number;
    tokens_per_second?: number;
  };
  partialCompletionResult?: {
    content: string;
    reasoning_content?: string;
  };
  completionResult?: {
    content: string;
    reasoning_content?: string;
  };
  interrupted?: boolean;
  modelName?: string;
}
