import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ChatDraft {
  sessionId: string;
  text: string;
  timestamp: number;
}

class DraftStore {
  drafts: Map<string, ChatDraft> = new Map();
  autosaveEnabled: boolean = true;

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'DraftStore',
      properties: ['autosaveEnabled'],
      storage: AsyncStorage,
    })
      .then(() => {
        this.loadDrafts();
      })
      .catch(error => {
        console.warn('[DraftStore] Failed to initialize persistence:', error);
      });
  }

  setAutosaveEnabled(enabled: boolean) {
    runInAction(() => {
      this.autosaveEnabled = enabled;
    });
  }

  saveDraft(sessionId: string, text: string) {
    if (!this.autosaveEnabled || !text.trim()) {
      return;
    }

    const draft: ChatDraft = {
      sessionId,
      text,
      timestamp: Date.now(),
    };

    runInAction(() => {
      this.drafts.set(sessionId, draft);
    });
    this.persistDrafts();
  }

  getDraft(sessionId: string): string | null {
    const draft = this.drafts.get(sessionId);
    if (!draft) return null;

    const age = Date.now() - draft.timestamp;
    const maxAge = 24 * 60 * 60 * 1000;

    if (age > maxAge) {
      runInAction(() => {
        this.drafts.delete(sessionId);
      });
      return null;
    }

    return draft.text;
  }

  clearDraft(sessionId: string) {
    runInAction(() => {
      this.drafts.delete(sessionId);
    });
    this.persistDrafts();
  }

  clearAllDrafts() {
    runInAction(() => {
      this.drafts.clear();
    });
    this.persistDrafts();
  }

  getDraftCount(): number {
    return this.drafts.size;
  }

  private async loadDrafts() {
    try {
      const stored = await AsyncStorage.getItem('chat_drafts');
      if (stored) {
        const drafts = JSON.parse(stored) as ChatDraft[];
        runInAction(() => {
          this.drafts = new Map(drafts.map(d => [d.sessionId, d]));
        });
      }
    } catch (error) {
      console.warn('[DraftStore] Failed to load drafts:', error);
      this.drafts = new Map();
    }
  }

  private async persistDrafts() {
    try {
      const draftsArray = Array.from(this.drafts.values());
      await AsyncStorage.setItem('chat_drafts', JSON.stringify(draftsArray));
    } catch (error) {
      console.warn('[DraftStore] Failed to persist drafts:', error);
    }
  }
}

export const draftStore = new DraftStore();
