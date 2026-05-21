import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';

interface SystemPromptStore {
  systemPrompt: string;
  isSystemPromptEnabled: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful, accurate, and honest AI assistant running locally on the user's device. 
You provide clear, concise, and accurate responses. 
When you don't know something, you say so clearly.
If web search results are provided, use them to give up-to-date information.`;

class SystemPromptStoreClass implements SystemPromptStore {
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT;
  isSystemPromptEnabled: boolean = true;

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'SystemPromptStore',
      properties: ['systemPrompt', 'isSystemPromptEnabled'],
      storage: AsyncStorage,
    });
  }

  setSystemPrompt(prompt: string) {
    runInAction(() => {
      this.systemPrompt = prompt;
    });
  }

  setEnabled(enabled: boolean) {
    runInAction(() => {
      this.isSystemPromptEnabled = enabled;
    });
  }

  reset() {
    runInAction(() => {
      this.systemPrompt = DEFAULT_SYSTEM_PROMPT;
      this.isSystemPromptEnabled = true;
    });
  }

  get effectiveSystemPrompt(): string | null {
    if (!this.isSystemPromptEnabled || !this.systemPrompt.trim()) {
      return null;
    }
    return this.systemPrompt.trim();
  }
}

export const systemPromptStore = new SystemPromptStoreClass();
export {DEFAULT_SYSTEM_PROMPT};
