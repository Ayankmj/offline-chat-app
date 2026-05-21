import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {observer} from 'mobx-react';
import {IconButton} from 'react-native-paper';
import Clipboard from '@react-native-clipboard/clipboard';
import Markdown from 'react-native-markdown-display';

import {chatSessionStore} from '../../store/ChatSessionStore';
import {MessageType} from '../../types/message';
import {TypingIndicator} from './TypingIndicator';

interface MessageBubbleProps {
  message: MessageType.Text;
  isUser: boolean;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onDelete?: (messageId: string) => void;
}

const markdownStyles = {
  body: {color: '#111', fontSize: 15, lineHeight: 24},
  code_block: {
    backgroundColor: '#f5f5f5',
    color: '#333',
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
    fontFamily: 'monospace',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  code_inline: {
    backgroundColor: '#f0f0f0',
    color: '#c7254e',
    borderRadius: 4,
    paddingHorizontal: 5,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  heading1: {color: '#111', fontSize: 20, fontWeight: '700' as const, marginVertical: 8},
  heading2: {color: '#111', fontSize: 18, fontWeight: '600' as const, marginVertical: 6},
  heading3: {color: '#111', fontSize: 16, fontWeight: '600' as const, marginVertical: 4},
  paragraph: {color: '#111', marginVertical: 4, lineHeight: 24},
  list_item: {color: '#111', lineHeight: 24},
  bullet_list: {marginVertical: 4},
  ordered_list: {marginVertical: 4},
  strong: {fontWeight: '700' as const, color: '#111'},
  em: {fontStyle: 'italic' as const, color: '#555'},
  link: {color: '#4f8ef7'},
  fence: {
    backgroundColor: '#f5f5f5',
    color: '#333',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  blockquote: {
    borderLeftColor: '#ddd',
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginLeft: 0,
    color: '#666',
  },
  table: {borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 6, marginVertical: 6},
  thead: {backgroundColor: '#f5f5f5'},
  th: {color: '#111', fontWeight: '600', padding: 8, fontSize: 13},
  td: {color: '#333', padding: 8, fontSize: 13},
  hr: {backgroundColor: '#e8e8e8', height: 1, marginVertical: 8},
} as const;

const MessageBubble = observer(
  ({message, isUser, isStreaming, onRegenerate, onDelete}: MessageBubbleProps) => {
    const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

    const isEditing =
      chatSessionStore.isEditMode && chatSessionStore.editingMessageId === message.id;
    const displayText = message.text || '';
    const reasoningContent =
      message.metadata?.completionResult?.reasoning_content ||
      message.metadata?.partialCompletionResult?.reasoning_content;
    const timings = message.metadata?.timings;
    const tokensPerSecond = useMemo(
      () =>
        timings?.predicted_per_second ??
        timings?.tokens_per_second ??
        timings?.token_per_second ??
        null,
      [timings],
    );

    useEffect(() => {
      if (copyState !== 'copied') {
        return;
      }
      const timeoutId = setTimeout(() => setCopyState('idle'), 1200);
      return () => clearTimeout(timeoutId);
    }, [copyState]);

    const handleCopy = useCallback(() => {
      Clipboard.setString(displayText);
      setCopyState('copied');
    }, [displayText]);

    const handleEdit = useCallback(() => {
      chatSessionStore.enterEditMode(message.id);
    }, [message.id]);

    const formatTime = (timestamp: number) => {
      if (!timestamp || Number.isNaN(timestamp)) {
        return '';
      }
      try {
        return new Date(timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return '';
      }
    };

    if (isUser) {
      return (
        <View style={styles.userRow}>
          <View style={styles.userBubble}>
            {message.imageUris?.map((uri, index) => (
              <Image
                key={`${uri}-${index}`}
                source={{uri}}
                style={styles.imagePreview}
                resizeMode="cover"
              />
            ))}
            {isEditing ? <Text style={styles.editingLabel}>Editing</Text> : null}
            <Text style={styles.userText}>{displayText}</Text>
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.timestamp}>{formatTime(message.createdAt)}</Text>
            <TouchableOpacity
              onPress={handleEdit}
              activeOpacity={0.7}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <IconButton
                icon="pencil-outline"
                size={14}
                iconColor="#ccc"
                style={styles.iconBtn}
              />
            </TouchableOpacity>
            {onDelete ? (
              <TouchableOpacity
                onPress={() => onDelete(message.id)}
                activeOpacity={0.7}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <IconButton
                  icon="delete-outline"
                  size={14}
                  iconColor="#ccc"
                  style={styles.iconBtn}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.aiRow}>
        {reasoningContent ? (
          <View style={styles.thinkingBlock}>
            <View style={styles.thinkingHeader}>
              <Text style={styles.thinkingLabel}>Thinking process</Text>
              <View style={styles.reasoningBadge}>
                <Text style={styles.reasoningBadgeText}>R</Text>
              </View>
            </View>
            <Text style={styles.thinkingText}>{reasoningContent}</Text>
          </View>
        ) : null}

        {isStreaming && !displayText ? (
          <TypingIndicator />
        ) : (
          <Markdown style={markdownStyles}>{displayText}</Markdown>
        )}

        <View style={styles.aiFooter}>
          <Text style={styles.timestamp}>{formatTime(message.createdAt)}</Text>
          {message.metadata?.interrupted ? (
            <View style={styles.stoppedBadge}>
              <Text style={styles.stoppedBadgeText}>Stopped</Text>
            </View>
          ) : null}
          {tokensPerSecond != null ? (
            <Text style={styles.metric}>{tokensPerSecond.toFixed(1)} t/s</Text>
          ) : null}
          {displayText ? (
            <>
              {copyState === 'copied' ? (
                <Text style={styles.copiedText}>Copied</Text>
              ) : null}
              {onRegenerate && !isStreaming ? (
                <TouchableOpacity
                  onPress={onRegenerate}
                  activeOpacity={0.7}
                  hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                  <IconButton
                    icon="refresh"
                    size={14}
                    iconColor="#bbb"
                    style={styles.iconBtn}
                  />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={handleCopy}
                activeOpacity={0.7}
                style={styles.copyBtn}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <IconButton
                  icon="content-copy"
                  size={14}
                  iconColor="#bbb"
                  style={styles.iconBtn}
                />
              </TouchableOpacity>
              {onDelete ? (
                <TouchableOpacity
                  onPress={() => onDelete(message.id)}
                  activeOpacity={0.7}
                  hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                  <IconButton
                    icon="delete-outline"
                    size={14}
                    iconColor="#bbb"
                    style={styles.iconBtn}
                  />
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  userRow: {
    alignItems: 'flex-end',
    marginVertical: 4,
    marginLeft: 60,
    marginRight: 16,
  },
  userBubble: {
    backgroundColor: '#f0f0f0',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  userText: {color: '#111', fontSize: 15, lineHeight: 22},
  editingLabel: {
    color: '#4f8ef7',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#e8e8e8',
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
  },
  aiRow: {
    marginVertical: 8,
    marginLeft: 16,
    marginRight: 16,
  },
  thinkingBlock: {
    backgroundColor: '#f7f9ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#4f8ef7',
  },
  thinkingHeader: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  thinkingLabel: {
    color: '#4f8ef7',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasoningBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e8f0fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasoningBadgeText: {color: '#2563eb', fontSize: 10, fontWeight: '700'},
  thinkingText: {
    color: '#666',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  aiFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 8,
  },
  copyBtn: {marginLeft: 'auto' as any},
  iconBtn: {margin: 0},
  timestamp: {color: '#bbb', fontSize: 11},
  metric: {color: '#999', fontSize: 11},
  copiedText: {color: '#4f8ef7', fontSize: 11, fontWeight: '600'},
  stoppedBadge: {
    backgroundColor: '#fff5f5',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  stoppedBadgeText: {color: '#ef4444', fontSize: 10, fontWeight: '600'},
});

export default MessageBubble;
