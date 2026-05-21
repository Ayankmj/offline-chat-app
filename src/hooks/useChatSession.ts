import React, {useRef, useCallback} from 'react';
import {toJS, runInAction} from 'mobx';

import {chatSessionStore} from '../store/ChatSessionStore';
import {modelStore} from '../store/ModelStore';
import {ragStore} from '../store/RagStore';
import {systemPromptStore} from '../store/SystemPromptStore';

import {ChatMessage} from '../types';
import {MessageType, User} from '../types/message';
import {ApiCompletionParams} from '../utils/completionTypes';
import {randId} from '../utils';
import {
  performWebSearch,
  getSearchQuery,
  formatSearchResultsForPrompt,
  SearchResult,
  shouldSearchWeb,
} from '../services/WebSearchService';

// ── Rough token estimator (chars / 4 ≈ tokens for English) ───────────────────
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Auto-generate session title from first user message ──────────────────────
// (Used by ChatSessionStore.updateSessionTitle for auto-titling)

// ── Keep screen awake helpers (no-op if module unavailable) ──────────────────
let keepAwakeActivate: (() => void) | null = null;
let keepAwakeDeactivate: (() => void) | null = null;

try {
  // react-native-keep-awake if installed
  const {activateKeepAwake, deactivateKeepAwake} = require('react-native-keep-awake');
  keepAwakeActivate = activateKeepAwake;
  keepAwakeDeactivate = deactivateKeepAwake;
} catch {
  // Not installed — safe no-op
}

// ── prepareCompletion ─────────────────────────────────────────────────────────
const prepareCompletion = async ({
  imageUris,
  message,
  contextId,
  assistant,
  conversationIdRef,
  isMultimodalEnabled,
  currentMessages,
  webSearchEnabled,
  onSearchResults,
}: {
  imageUris: string[];
  message: MessageType.PartialText;
  contextId: string;
  assistant: User;
  conversationIdRef: string;
  isMultimodalEnabled: boolean;
  currentMessages: MessageType.Any[];
  webSearchEnabled?: boolean;
  onSearchResults?: (results: SearchResult[]) => void;
}) => {
  const sessionCompletionSettings =
    chatSessionStore.getCurrentCompletionSettings?.() || {};
  const stopWords = toJS(modelStore.activeModel?.stopWords);

  const hasImages = imageUris && imageUris.length > 0;

  // ── Web search ──────────────────────────────────────────────────────────────
  let searchResults: SearchResult[] = [];
  let enhancedMessage = message.text;

  const shouldRunWebSearch = Boolean(
    webSearchEnabled &&
      message.text &&
      shouldSearchWeb(message.text),
  );

  if (shouldRunWebSearch && message.text) {
    try {
      const query = getSearchQuery(message.text);
      searchResults = await performWebSearch(query, 5);
      if (onSearchResults) {
        onSearchResults(searchResults);
      }
      if (searchResults.length > 0) {
        enhancedMessage = formatSearchResultsForPrompt(searchResults, message.text);
      }
    } catch (searchErr) {
      console.warn('[useChatSession] Web search failed:', searchErr);
      // Continue without search results
    }
  } else if (onSearchResults) {
    onSearchResults([]);
  }

  // ── User message content ───────────────────────────────────────────────────
  type ImageUrlContent = {type: 'image_url'; image_url: {url: string}};
  type TextContent = {type: 'text'; text: string};
  let userMessageContent: string | Array<TextContent | ImageUrlContent>;
  if (hasImages && isMultimodalEnabled) {
    userMessageContent = [
      {type: 'text' as const, text: enhancedMessage},
      ...imageUris.map(path => ({
        type: 'image_url' as const,
        image_url: {url: path},
      })),
    ];
  } else {
    userMessageContent = enhancedMessage;
  }

  // ── Build messages array — system prompt first ─────────────────────────────
  const ragResults = await ragStore.search(message.text, 4);
  const ragContext = ragResults.length > 0
    ? `Relevant local memory:\n${ragResults
        .map(
          (result, index) =>
            `[Memory ${index + 1}] ${result.document.title}\n${result.snippet}`,
        )
        .join('\n\n')}\n\nUse these memories only when relevant to the user's request.`
    : '';
  const systemPrompt = [
    systemPromptStore.effectiveSystemPrompt,
    ragContext || null,
  ].filter(Boolean).join('\n\n');

  const historicalMessages: ChatMessage[] = currentMessages
    .slice()
    .reverse()
    .filter(
      msg =>
        msg.type === 'text' &&
        !msg.metadata?.system &&
        (msg as MessageType.Text).text,
    )
    .map(msg => ({
      role: (msg.author.id === assistant.id ? 'assistant' : 'user') as
        | 'user'
        | 'assistant',
      content: (msg as MessageType.Text).text,
    }));

  // ── Context window management — trim oldest messages if needed ─────────────
  const nCtx = modelStore.contextInitParams.n_ctx ?? 4096;
  const safetyBuffer = 256; // reserve for model overhead
  const requestedPredict = sessionCompletionSettings.n_predict ?? 2048;
  const nPredict = Math.min(
    requestedPredict,
    Math.max(128, nCtx - safetyBuffer),
  );
  const maxInputTokens = Math.max(0, nCtx - nPredict - safetyBuffer);

  // Estimate tokens for system prompt + current user message (always kept)
  const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
  const userContentStr = typeof userMessageContent === 'string'
    ? userMessageContent
    : userMessageContent.map(c => 'text' in c ? c.text : '').join(' ');
  const currentUserTokens = estimateTokens(userContentStr);
  const reservedTokens = systemTokens + currentUserTokens + safetyBuffer;

  // Trim oldest historical messages until we fit
  let trimmedHistorical = [...historicalMessages];
  while (trimmedHistorical.length > 0) {
    const totalTokens = reservedTokens +
      trimmedHistorical.reduce((sum, m) => {
        const content = typeof m.content === 'string' ? m.content : '';
        return sum + estimateTokens(content);
      }, 0);
    if (totalTokens <= maxInputTokens) break;
    trimmedHistorical.shift(); // remove oldest
  }
  const wasTrimmed = trimmedHistorical.length < historicalMessages.length;

  // Guard: if system prompt + user message alone exceeds the budget, truncate
  // the system prompt to fit. This prevents llama.cpp from silently failing.
  let finalSystemPrompt = systemPrompt;
  if (reservedTokens > maxInputTokens) {
    const overflow = reservedTokens - maxInputTokens;
    const maxSystemChars = Math.max(0, (systemPrompt.length - overflow * 4));
    if (maxSystemChars > 0 && systemPrompt) {
      finalSystemPrompt = systemPrompt.substring(0, maxSystemChars) + '\n[truncated due to context length limits]';
    } else {
      finalSystemPrompt = '';
    }
  }

  const messages: ChatMessage[] = [
    ...(finalSystemPrompt ? [{role: 'system' as const, content: finalSystemPrompt}] : []),
    ...(wasTrimmed ? [{role: 'system' as const, content: '[Note: Some earlier messages were omitted due to context length limits. The conversation continues from the most recent messages.]'}] : []),
    ...trimmedHistorical,
    {role: 'user', content: userMessageContent},
  ];

  const completionParams: ApiCompletionParams = {
    ...sessionCompletionSettings,
    n_predict: nPredict,
    messages,
    stop: stopWords,
    ...(sessionCompletionSettings.enable_thinking
      ? {reasoning_format: 'auto' as const}
      : {}),
  };

  const createdAt = Date.now();
  const emptyMessage: MessageType.Text = {
    author: assistant,
    createdAt,
    id: randId(),
    text: '',
    type: 'text',
    metadata: {
      contextId,
      conversationId: conversationIdRef,
      copyable: true,
      multimodal: hasImages,
    },
  };

  await chatSessionStore.addMessageToCurrentSession(emptyMessage);

  return {
    completionParams,
    messageInfo: {
      createdAt,
      id: emptyMessage.id,
      sessionId: chatSessionStore.activeSessionId ?? '',
    },
  };
};

// ── useChatSession ────────────────────────────────────────────────────────────
export const useChatSession = (
  currentMessageInfo: React.MutableRefObject<{
    createdAt: number;
    id: string;
    sessionId: string;
  } | null>,
  user: User,
  assistant: User,
  getWebSearchEnabled: () => boolean,
  onSearchResults?: (results: SearchResult[]) => void,
) => {
  const conversationIdRef = useRef<string>(randId());
  const isSendingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  // Error rate limiting
  const consecutiveErrorsRef = useRef(0);
  const lastErrorTimeRef = useRef(0);

  const addMessage = async (message: MessageType.Any) => {
    await chatSessionStore.addMessageToCurrentSession(message);
  };

  const addSystemMessage = async (text: string) => {
    const textMessage: MessageType.Text = {
      author: assistant,
      createdAt: Date.now(),
      id: randId(),
      text,
      type: 'text',
      metadata: {system: true},
    };
    await addMessage(textMessage);
  };

  const addSystemMessageWithRateLimit = async (text: string) => {
    const now = Date.now();
    if (consecutiveErrorsRef.current >= 3 && now - lastErrorTimeRef.current < 30000) {
      console.warn('[useChatSession] Rate-limited error message:', text);
      return;
    }
    consecutiveErrorsRef.current++;
    lastErrorTimeRef.current = now;
    const textMessage: MessageType.Text = {
      author: assistant,
      createdAt: Date.now(),
      id: randId(),
      text,
      type: 'text',
      metadata: {system: true},
    };
    await addMessage(textMessage);
  };

  const runAssistantCompletion = async ({
    completionParams,
    messageInfo,
    hasImages,
    isMultimodalEnabled,
    errorLabel = 'Generation failed',
  }: {
    completionParams: ApiCompletionParams;
    messageInfo: {createdAt: number; id: string; sessionId: string};
    hasImages: boolean;
    isMultimodalEnabled: boolean;
    errorLabel?: string;
  }) => {
    modelStore.setInferencing(true);
    modelStore.setIsStreaming(false);
    chatSessionStore.setIsGenerating(true);

    currentMessageInfo.current = messageInfo;

    const engine = modelStore.engine;
    if (!engine) {
      throw new Error('No model loaded. Please select and load a model first.');
    }

    const completionStartTime = Date.now();
    let timeToFirstToken: number | null = null;
    let streamedText = '';
    let streamedReasoning = '';
    const capturedMessageInfo = messageInfo;

    try {
      stopRequestedRef.current = false;
      const completionPromise = engine.completion(completionParams, data => {
        if (!capturedMessageInfo) return;

        const {token, content, reasoning_content: reasoningContent} = data;
        let textChunk = token || '';

        if (!textChunk && content) {
          textChunk = content.startsWith(streamedText)
            ? content.slice(streamedText.length)
            : content;
          if (!content.startsWith(streamedText) && streamedText.length > 0) {
            console.warn('[useChatSession] Non-contiguous content received, replacing accumulated text');
            streamedText = content;
            textChunk = '';
          }
        }

        let reasoningDelta = '';
        if (reasoningContent) {
          reasoningDelta = reasoningContent.startsWith(streamedReasoning)
            ? reasoningContent.slice(streamedReasoning.length)
            : reasoningContent;
        }

        if (timeToFirstToken === null && (textChunk || reasoningDelta)) {
          timeToFirstToken = Date.now() - completionStartTime;
        }

        if (!modelStore.isStreaming && (textChunk || reasoningDelta)) {
          modelStore.setIsStreaming(true);
        }

        if (textChunk) {
          streamedText += textChunk;
        }
        if (reasoningDelta) {
          streamedReasoning += reasoningDelta;
        }

        if (textChunk || reasoningDelta) {
          const update: Partial<MessageType.Text> = {
            metadata: {
              partialCompletionResult: {
                reasoning_content: streamedReasoning || undefined,
                content: streamedText,
              },
            },
          };
          if (textChunk) {
            update.text = textChunk;
          }

          chatSessionStore.updateMessageStreaming(
            capturedMessageInfo.id,
            capturedMessageInfo.sessionId,
            update,
          );
        }
      });

      if (modelStore.context) {
        modelStore.registerCompletionPromise(completionPromise);
      }

      const result = await completionPromise;
      modelStore.clearCompletionPromise();

      const modelName = modelStore.activeModel?.name || modelStore.activeModelId || 'Unknown';
      const finalText = result.text || result.content || streamedText;
      const finalReasoning = result.reasoning_content || streamedReasoning || undefined;

      await chatSessionStore.updateMessage(
        capturedMessageInfo.id,
        capturedMessageInfo.sessionId,
        {
          text: finalText,
          metadata: {
            timings: {
              ...result.timings,
              time_to_first_token_ms: timeToFirstToken,
            },
            copyable: true,
            multimodal: hasImages && isMultimodalEnabled,
            modelName,
            completionResult: {
              reasoning_content: finalReasoning,
              content: finalText,
            },
          },
        },
      );

      consecutiveErrorsRef.current = 0;
    } catch (error) {
      modelStore.clearCompletionPromise();
      console.error(`${errorLabel}:`, error);

      const msgInfo = currentMessageInfo.current;
      if (msgInfo) {
        const session = chatSessionStore.sessions.find(
          s => s.id === msgInfo.sessionId,
        );
        const currentMsg = session?.messages.find(
          msg => msg.id === msgInfo.id,
        );
        const hasPartialContent =
          currentMsg && 'text' in currentMsg && currentMsg.text;

        if (hasPartialContent) {
          await chatSessionStore.updateMessage(
            msgInfo.id,
            msgInfo.sessionId,
            {metadata: {interrupted: true, copyable: true}},
          );
        } else {
          runInAction(() => {
            if (session) {
              session.messages = session.messages.filter(
                msg => msg.id !== msgInfo.id,
              );
            }
          });
        }
      }

      if (!stopRequestedRef.current) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await addSystemMessageWithRateLimit(`Generation failed: ${errorMsg}`);
      }
    } finally {
      stopRequestedRef.current = false;
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
    }
  };

  const handleSendPress = async (message: MessageType.PartialText) => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    try {
      const engine = modelStore.engine;
      if (!engine) {
        await addSystemMessage('No model loaded. Please select and load a model first.');
        isSendingRef.current = false;
        return;
      }

      const contextId = modelStore.contextId;
      if (!contextId) {
        await addSystemMessage('No model loaded. Please select and load a model first.');
        isSendingRef.current = false;
        return;
      }

      const imageUris = message.imageUris;
      const hasImages = (imageUris?.length ?? 0) > 0;
      const isMultimodalEnabled = modelStore.isMultimodalActive;

      if (hasImages && !isMultimodalEnabled) {
        await addSystemMessage(
          'The currently loaded model does not support image inputs. Load a vision-capable model first.',
        );
        isSendingRef.current = false;
        return;
      }

      // currentMessages snapshot BEFORE adding any new messages this turn
      const currentMessages = toJS(chatSessionStore.currentSessionMessages);

      const textMessage: MessageType.Text = {
        author: user,
        createdAt: Date.now(),
        id: randId(),
        text: message.text,
        type: 'text',
        imageUris: hasImages ? imageUris : undefined,
        metadata: {
          contextId,
          conversationId: conversationIdRef.current,
          copyable: true,
          multimodal: hasImages,
        },
      };
      await addMessage(textMessage);

      // ── Keep screen awake during completion ─────────────────────────────
      try {
        keepAwakeActivate?.();
      } catch {}

      // ── Web search FIRST — then show generation spinner ─────────────────
      const {completionParams, messageInfo} = await prepareCompletion({
        imageUris: imageUris || [],
        message,
        contextId,
        assistant,
        conversationIdRef: conversationIdRef.current,
        isMultimodalEnabled,
        currentMessages,
        webSearchEnabled: getWebSearchEnabled(),
        onSearchResults,
      });

      await runAssistantCompletion({
        completionParams,
        messageInfo,
        hasImages,
        isMultimodalEnabled,
        errorLabel: 'Completion error',
      });
    } catch (error) {
      modelStore.clearCompletionPromise();
      console.error('Completion error:', error);
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);

      const msgInfo = currentMessageInfo.current;
      if (msgInfo) {
        const session = chatSessionStore.sessions.find(
          s => s.id === msgInfo.sessionId,
        );
        const currentMsg = session?.messages.find(
          msg => msg.id === msgInfo.id,
        );
        const hasPartialContent =
          currentMsg && 'text' in currentMsg && currentMsg.text;

        if (hasPartialContent) {
          await chatSessionStore.updateMessage(
            msgInfo.id,
            msgInfo.sessionId,
            {metadata: {interrupted: true, copyable: true}},
          );
        } else {
          runInAction(() => {
            if (session) {
              session.messages = session.messages.filter(
                msg => msg.id !== msgInfo.id,
              );
            }
          });
        }
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      await addSystemMessageWithRateLimit(`Generation failed: ${errorMsg}`);
    } finally {
      isSendingRef.current = false;
      consecutiveErrorsRef.current = 0;
      try {
        keepAwakeDeactivate?.();
      } catch {}
    }
  };

  const handleRegenerate = async () => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    try {
      const currentMessages = toJS(chatSessionStore.currentSessionMessages);

      // Find the most recent non-system message. If it's not an assistant
      // message, there is nothing to regenerate (e.g. conversation ends with
      // a user message that hasn't been answered yet).
      const latestNonSystemMsg = currentMessages.find(
        m => m.type === 'text' && !m.metadata?.system,
      );
      if (!latestNonSystemMsg || latestNonSystemMsg.author.id !== assistant.id) {
        isSendingRef.current = false;
        return;
      }

      const lastAssistantMsg = latestNonSystemMsg as MessageType.Text;

      // Find the user message that directly precedes this assistant response.
      // Since the array is newest-first, we search for the first user message
      // that appears AFTER the assistant message in the array.
      const assistantIndex = currentMessages.indexOf(lastAssistantMsg);
      const lastUserMsg = currentMessages
        .slice(assistantIndex + 1)
        .find(
          m => m.type === 'text' && m.author.id === user.id && !m.metadata?.system,
        ) as MessageType.Text | undefined;

      if (!lastUserMsg) {
        isSendingRef.current = false;
        return;
      }

      const userText = lastUserMsg.text;
      const userImageUris = lastUserMsg.imageUris;

      await chatSessionStore.removeLastAssistantMessage();

      const engine = modelStore.engine;
      if (!engine) {
        isSendingRef.current = false;
        return;
      }

      const contextId = modelStore.contextId;
      if (!contextId) {
        isSendingRef.current = false;
        return;
      }

      const imageUris = userImageUris || [];
      const hasImages = imageUris.length > 0;
      const isMultimodalEnabled = modelStore.isMultimodalActive;

      const updatedMessages = toJS(chatSessionStore.currentSessionMessages);

      const {completionParams, messageInfo} = await prepareCompletion({
        imageUris,
        message: {text: userText, imageUris},
        contextId,
        assistant,
        conversationIdRef: conversationIdRef.current,
        isMultimodalEnabled,
        currentMessages: updatedMessages,
        webSearchEnabled: getWebSearchEnabled(),
        onSearchResults,
      });

      await runAssistantCompletion({
        completionParams,
        messageInfo,
        hasImages,
        isMultimodalEnabled,
        errorLabel: 'Regenerate error',
      });
    } catch (error) {
      modelStore.clearCompletionPromise();
      console.error('Regenerate error:', error);
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);

      const msgInfo = currentMessageInfo.current;
      if (msgInfo) {
        const session = chatSessionStore.sessions.find(
          s => s.id === msgInfo.sessionId,
        );
        const currentMsg = session?.messages.find(
          msg => msg.id === msgInfo.id,
        );
        const hasPartialContent =
          currentMsg && 'text' in currentMsg && currentMsg.text;

        if (hasPartialContent) {
          await chatSessionStore.updateMessage(
            msgInfo.id,
            msgInfo.sessionId,
            {metadata: {interrupted: true, copyable: true}},
          );
        } else {
          runInAction(() => {
            if (session) {
              session.messages = session.messages.filter(
                msg => msg.id !== msgInfo.id,
              );
            }
          });
        }
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      await addSystemMessageWithRateLimit(`Generation failed: ${errorMsg}`);
    } finally {
      isSendingRef.current = false;
      if (!modelStore.inferencing) {
        consecutiveErrorsRef.current = 0;
      }
      try {
        keepAwakeDeactivate?.();
      } catch {}
    }
  };

  const handleEditAndResend = async (messageId: string, newText: string) => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    try {
      if (!chatSessionStore.activeSessionId) {
        isSendingRef.current = false;
        return;
      }

      const session = chatSessionStore.sessions.find(
        s => s.id === chatSessionStore.activeSessionId,
      );
      if (!session) {
        isSendingRef.current = false;
        return;
      }

      const msgIndex = session.messages.findIndex(m => m.id === messageId);
      if (msgIndex < 0) {
        isSendingRef.current = false;
        return;
      }

      const editedMsg = session.messages[msgIndex];
      if (editedMsg.type !== 'text') {
        isSendingRef.current = false;
        return;
      }

      const oldImageUris = (editedMsg as MessageType.Text).imageUris;
      const imageUris = oldImageUris || [];
      const hasImages = imageUris.length > 0;
      const isMultimodalEnabled = modelStore.isMultimodalActive;
      const contextId = modelStore.contextId;
      const engine = modelStore.engine;

      if (!engine || !contextId) {
        await addSystemMessage('No model loaded. Please select and load a model first.');
        isSendingRef.current = false;
        return;
      }

      // Update the edited message text
      await chatSessionStore.updateMessage(messageId, chatSessionStore.activeSessionId, {
        text: newText,
      } as Partial<MessageType.Text>);

      chatSessionStore.exitEditMode();

      // Branch the conversation from the edited turn.
      // Messages array is newest-first (unshift), so indices 0..msgIndex-1 are newer
      const toRemove = session.messages.slice(0, msgIndex).map(m => m.id);
      if (toRemove.length > 0) {
        runInAction(() => {
          session.messages = session.messages.filter(m => !toRemove.includes(m.id));
        });
      }

      try {
        keepAwakeActivate?.();
      } catch {}

      const updatedMessages = toJS(chatSessionStore.currentSessionMessages);
      const {completionParams, messageInfo} = await prepareCompletion({
        imageUris,
        message: {text: newText, imageUris},
        contextId,
        assistant,
        conversationIdRef: conversationIdRef.current,
        isMultimodalEnabled,
        currentMessages: updatedMessages,
        webSearchEnabled: getWebSearchEnabled(),
        onSearchResults,
      });

      await runAssistantCompletion({
        completionParams,
        messageInfo,
        hasImages,
        isMultimodalEnabled,
        errorLabel: 'Edit+resend error',
      });
    } catch (error) {
      console.error('Edit+resend error:', error);
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
      chatSessionStore.exitEditMode();
    } finally {
      isSendingRef.current = false;
      if (!modelStore.inferencing) {
        consecutiveErrorsRef.current = 0;
      }
      try {
        keepAwakeDeactivate?.();
      } catch {}
    }
  };

  const handleResetConversation = async () => {
    conversationIdRef.current = randId();
    await addSystemMessage('Conversation reset.');
  };

  const handleStopPress = async () => {
    if (modelStore.inferencing && modelStore.engine) {
      try {
        stopRequestedRef.current = true;
        await modelStore.engine.stopCompletion();
      } catch (e) {
        console.error('Stop completion error:', e);
      }
    }
    // Flush any buffered streaming tokens
    const msgInfo = currentMessageInfo.current;
    if (msgInfo && modelStore.isStreaming) {
      await chatSessionStore.updateMessage(msgInfo.id, msgInfo.sessionId, {
        metadata: {interrupted: true, copyable: true},
      });
    }
    isSendingRef.current = false;
    modelStore.setInferencing(false);
    modelStore.setIsStreaming(false);
    chatSessionStore.setIsGenerating(false);
    try {
      keepAwakeDeactivate?.();
    } catch {}
  };

  return {
    handleSendPress,
    handleResetConversation,
    handleStopPress,
    handleRegenerate,
    handleEditAndResend,
    resetConversationId: useCallback(() => {
      conversationIdRef.current = randId();
    }, []),
  };
};
