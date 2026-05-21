import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import {isToday, isYesterday} from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {MessageType} from '../types/message';
import {CompletionParams} from '../utils/completionTypes';

const NEW_SESSION_TITLE = 'New Session';
const TITLE_LIMIT = 40;
const STREAMING_THROTTLE_MS = 150;

export interface SessionMetaData {
  id: string;
  title: string;
  date: string;
  messages: MessageType.Any[];
  completionSettings: CompletionParams;
  settingsSource: 'app' | 'custom';
  messagesLoaded?: boolean;
}

interface SessionGroup {
  [key: string]: SessionMetaData[];
}

const defaultCompletionSettings: CompletionParams = {
  n_predict: 2048,
  temperature: 0.7,
  top_k: 40,
  top_p: 0.9,
  min_p: 0.05,
  penalty_last_n: 64,
  penalty_repeat: 1.0,
  penalty_freq: 0.0,
  penalty_present: 0.0,
  enable_thinking: false,
};

class ChatSessionStore {
  sessions: SessionMetaData[] = [];
  activeSessionId: string | null = null;
  isEditMode: boolean = false;
  editingMessageId: string | null = null;
  isGenerating: boolean = false;
  newChatCompletionSettings: CompletionParams = defaultCompletionSettings;
  dateGroupNames = {
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This week',
    lastWeek: 'Last week',
    older: 'Older',
  };

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'ChatSessionStore',
      properties: ['sessions', 'activeSessionId', 'newChatCompletionSettings'],
      storage: AsyncStorage,
    });
  }

  setIsGenerating(value: boolean) {
    runInAction(() => { this.isGenerating = value; });
  }

  getCurrentCompletionSettings(): CompletionParams {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session?.completionSettings) {
        return session.completionSettings;
      }
    }
    return this.newChatCompletionSettings;
  }

  updateCompletionSettings(settings: CompletionParams) {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        runInAction(() => {
          session.completionSettings = {...session.completionSettings, ...settings};
        });
      }
    } else {
      runInAction(() => {
        this.newChatCompletionSettings = {...this.newChatCompletionSettings, ...settings};
      });
    }
  }

  get currentSessionMessages(): MessageType.Any[] {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        if (this.isEditMode && this.editingMessageId) {
          const messageIndex = session.messages.findIndex(
            msg => msg.id === this.editingMessageId,
          );
          // Messages are stored newest-first (unshift). In edit mode we need
          // messages from the START of the conversation up to and including
          // the editing message. Since array is reversed (newest first),
          // we take from messageIndex to end, then reverse back.
          if (messageIndex >= 0) {
            const messagesUpToEdit = session.messages.slice(messageIndex).reverse();
            return messagesUpToEdit;
          }
        }
        return session.messages;
      }
    }
    return [];
  }

  async addMessageToCurrentSession(message: MessageType.Any): Promise<void> {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        // Don't mutate the caller's object — assign id on a copy
        const msg: MessageType.Any = message.id
          ? message
          : {...message, id: this.generateId()};
        runInAction(() => {
          session.messages.unshift(msg);
        });
        // Update title AFTER adding message so the new message is visible
        await this.updateSessionTitle(session);
      }
    } else {
      await this.createNewSession(NEW_SESSION_TITLE, [message]);
    }
  }

  async createNewSession(
    title: string,
    initialMessages: MessageType.Any[] = [],
    completionSettings: CompletionParams = defaultCompletionSettings,
  ): Promise<void> {
    // Ensure all initial messages have IDs
    const messagesWithIds = initialMessages.map(m =>
      m.id ? m : {...m, id: this.generateId()},
    );
    const newSession: SessionMetaData = {
      id: this.generateId(),
      title,
      date: new Date().toISOString(),
      messages: messagesWithIds,
      completionSettings,
      settingsSource: 'custom',
      messagesLoaded: true,
    };

    runInAction(() => {
      this.sessions.push(newSession);
      this.activeSessionId = newSession.id;
    });
    // Update title using the first user message if present
    await this.updateSessionTitle(newSession);
  }

  private flushStreamingBuffer(): void {
    if (this.streamingThrottleTimer) {
      clearTimeout(this.streamingThrottleTimer);
      this.streamingThrottleTimer = null;
    }
    this.pendingStreamingUpdate = null;
    this.lastStreamingUpdateTime = 0;
  }

  setActiveSession(sessionId: string): void {
    runInAction(() => {
      this.exitEditMode();
      this.activeSessionId = sessionId;
    });
    this.flushStreamingBuffer();
  }

  resetActiveSession() {
    runInAction(() => {
      this.exitEditMode();
      this.activeSessionId = null;
    });
    this.flushStreamingBuffer();
  }

  async deleteSession(id: string): Promise<void> {
    if (id === this.activeSessionId) {
      this.resetActiveSession();
    }
    runInAction(() => {
      this.sessions = this.sessions.filter(session => session.id !== id);
    });
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        runInAction(() => {
          session.messages = session.messages.filter(m => m.id !== messageId);
          if (this.editingMessageId === messageId) {
            this.isEditMode = false;
            this.editingMessageId = null;
          }
        });
      }
    }
  }

  // Remove the last AI response (for regenerate)
  async removeLastAssistantMessage(): Promise<void> {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        runInAction(() => {
          let aiIndex = -1;
          for (let i = 0; i < session.messages.length; i++) {
            const m = session.messages[i];
            if (m.type === 'text' && m.author.id !== 'user' && !m.metadata?.system) {
              aiIndex = i;
              break;
            }
          }
          if (aiIndex >= 0) {
            session.messages.splice(aiIndex, 1);
          }
        });
      }
    }
  }

  async updateSessionTitle(session: SessionMetaData) {
    if (session.messages.length > 0 && session.title === NEW_SESSION_TITLE) {
      // Find the earliest user message that is not a system message
      const firstUserMsg = [...session.messages].reverse().find(
        msg =>
          msg.type === 'text' &&
          msg.author.id === 'user' &&
          !msg.metadata?.system,
      );
      if (firstUserMsg && firstUserMsg.type === 'text') {
        runInAction(() => {
          session.title =
            firstUserMsg.text.length > TITLE_LIMIT
              ? `${firstUserMsg.text.substring(0, TITLE_LIMIT)}...`
              : firstUserMsg.text;
        });
      }
    }
  }

  private streamingThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStreamingUpdate: {
    id: string;
    sessionId: string;
    update: Partial<MessageType.Text>;
  } | null = null;
  private lastStreamingUpdateTime: number = 0;

  updateMessageStreaming(
    id: string,
    sessionId: string,
    update: Partial<MessageType.Text>,
  ): void {
    if (this.pendingStreamingUpdate) {
      if (this.pendingStreamingUpdate.id === id) {
        // Same message — accumulate tokens
        this.pendingStreamingUpdate.update.text =
          (this.pendingStreamingUpdate.update.text || '') + (update.text || '');
        if (update.metadata) {
          this.pendingStreamingUpdate.update.metadata = {
            ...this.pendingStreamingUpdate.update.metadata,
            ...update.metadata,
          };
        }
      } else {
        // Different message — flush old buffer first, then start fresh
        this.applyStreamingUpdate();
        this.pendingStreamingUpdate = {id, sessionId, update};
      }
    } else {
      this.pendingStreamingUpdate = {id, sessionId, update};
    }

    if (this.streamingThrottleTimer) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastStreamingUpdateTime;

    if (timeSinceLastUpdate >= STREAMING_THROTTLE_MS) {
      this.applyStreamingUpdate();
      this.lastStreamingUpdateTime = Date.now();
      return;
    }

    const remainingTime = STREAMING_THROTTLE_MS - timeSinceLastUpdate;
    this.streamingThrottleTimer = setTimeout(() => {
      this.streamingThrottleTimer = null;
      if (this.pendingStreamingUpdate) {
        this.applyStreamingUpdate();
        this.lastStreamingUpdateTime = Date.now();
      }
    }, remainingTime);
  }

  private applyStreamingUpdate(): void {
    if (!this.pendingStreamingUpdate) return;

    const {id, sessionId, update} = this.pendingStreamingUpdate;
    this.pendingStreamingUpdate = null;

    const targetSessionId = sessionId || this.activeSessionId;
    if (!targetSessionId) return;

    const session = this.sessions.find(s => s.id === targetSessionId);
    if (!session) return;

    const message = session.messages.find(msg => msg.id === id);
    if (!message || message.type !== 'text') return;

    runInAction(() => {
      if (update.text !== undefined) {
        const msgText = (message as MessageType.Text).text || '';
        if (update.text.length > 0) {
          (message as MessageType.Text).text = msgText + update.text;
        }
      }
      if (update.metadata !== undefined) {
        (message as MessageType.Text).metadata = {
          ...(message as MessageType.Text).metadata,
          ...update.metadata,
        };
      }
    });
  }

  async updateMessage(
    id: string,
    sessionId: string,
    update: Partial<MessageType.Text>,
  ): Promise<void> {
    // Flush any buffered streaming tokens before finalizing
    if (this.pendingStreamingUpdate && this.pendingStreamingUpdate.id === id) {
      this.applyStreamingUpdate();
    } else if (this.pendingStreamingUpdate) {
      // Different message ID — flush stale buffer so tokens aren't lost
      this.applyStreamingUpdate();
    }
    if (this.streamingThrottleTimer) {
      clearTimeout(this.streamingThrottleTimer);
      this.streamingThrottleTimer = null;
    }
    this.pendingStreamingUpdate = null;

    const targetSessionId = sessionId || this.activeSessionId;
    if (targetSessionId) {
      const session = this.sessions.find(s => s.id === targetSessionId);
      if (session) {
        const index = session.messages.findIndex(msg => msg.id === id);
        if (index >= 0 && session.messages[index].type === 'text') {
          runInAction(() => {
            const existingMessage = session.messages[index] as MessageType.Text;
            session.messages[index] = {
              ...existingMessage,
              ...update,
              metadata: {
                ...existingMessage.metadata,
                ...update.metadata,
              },
            } as MessageType.Text;
          });
        }
      }
    }
  }

  get groupedSessions(): SessionGroup {
    const groups: SessionGroup = {};
    const today = new Date();

    this.sessions.forEach(session => {
      const date = new Date(session.date);
      // Guard against corrupted/invalid date strings
      if (isNaN(date.getTime())) return;

      let dateKey: string;

      if (isToday(date)) dateKey = this.dateGroupNames.today;
      else if (isYesterday(date)) dateKey = this.dateGroupNames.yesterday;
      else {
        const msPerDay = 1000 * 3600 * 24;
        const daysAgo = Math.floor(
          (today.getTime() - date.getTime()) / msPerDay,
        );
        if (daysAgo <= 7) dateKey = this.dateGroupNames.thisWeek;
        else if (daysAgo <= 14) dateKey = this.dateGroupNames.lastWeek;
        else dateKey = this.dateGroupNames.older;
      }

      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(session);
    });

    // Sort each group by date descending
    Object.values(groups).forEach(g =>
      g.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    );

    return groups;
  }

  clearAllSessions(): void {
    runInAction(() => {
      this.sessions = [];
      this.exitEditMode();
      this.activeSessionId = null;
    });
  }

  enterEditMode(messageId: string): void {
    if (this.activeSessionId) {
      const session = this.sessions.find(s => s.id === this.activeSessionId);
      if (session) {
        const messageIndex = session.messages.findIndex(
          msg => msg.id === messageId,
        );
        if (messageIndex >= 0) {
          runInAction(() => {
            this.isEditMode = true;
            this.editingMessageId = messageId;
          });
        }
      }
    }
  }

  exitEditMode(): void {
    runInAction(() => {
      this.isEditMode = false;
      this.editingMessageId = null;
    });
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

export const chatSessionStore = new ChatSessionStore();
