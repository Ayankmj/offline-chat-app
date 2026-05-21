import React, {useCallback, useMemo, useRef, useState} from 'react';
import {launchImageLibrary} from 'react-native-image-picker';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {observer} from 'mobx-react';
import {IconButton} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';

import ChatInput from '../components/Chat/ChatInput';
import {ChatAnalyticsModal} from '../components/Chat/ChatAnalyticsModal';
import MessageBubble from '../components/Chat/MessageBubble';
import SearchResults from '../components/Chat/SearchResults';
import {TypingIndicator} from '../components/Chat/TypingIndicator';
import {useChatSession} from '../hooks/useChatSession';
import {SearchResult, shouldSearchWeb} from '../services/WebSearchService';
import {chatSessionStore} from '../store/ChatSessionStore';
import {modelStore} from '../store/ModelStore';
import {MessageType, User} from '../types/message';
import {exportConversationText} from '../utils/chatUtils';

const user: User = {id: 'user', name: 'You'};
const assistant: User = {id: 'assistant', name: 'AI'};

const ChatScreen = observer(({navigation}: any) => {
  const currentMessageInfo = useRef<{
    createdAt: number;
    id: string;
    sessionId: string;
  } | null>(null);

  const [inputText, setInputText] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [enableThinking, setEnableThinking] = useState(
    chatSessionStore.getCurrentCompletionSettings().enable_thinking ?? false,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);

  const {
    handleSendPress,
    handleStopPress,
    handleRegenerate,
    handleEditAndResend,
    resetConversationId,
  } = useChatSession(
    currentMessageInfo,
    user,
    assistant,
    () => enableWebSearch,
    results => {
      setSearchResults(results);
      setShowSearchResults(results.length > 0);
    },
  );

  const fadeAnimRef = useRef<Animated.Value | null>(null);
  if (!fadeAnimRef.current) {
    fadeAnimRef.current = new Animated.Value(0);
  }
  const fadeAnim = fadeAnimRef.current;

  const messages = chatSessionStore.currentSessionMessages;
  const isGenerating = chatSessionStore.isGenerating;
  const isLoadingModel = modelStore.isContextLoading;
  const activeModel = modelStore.activeModel;
  const isMultimodal = modelStore.isMultimodalActive;
  const supportsVisionModel = Boolean(activeModel?.supportsMultimodal);
  const runtimeStatusLabel = isLoadingModel
    ? 'Loading'
    : isMultimodal
      ? 'Vision ready'
      : activeModel
        ? 'Text ready'
        : 'No model';

  React.useEffect(() => {
    const animation = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [fadeAnim]);

  React.useEffect(() => {
    if (!chatSessionStore.activeSessionId) {
      resetConversationId();
    }
  }, [chatSessionStore.activeSessionId, resetConversationId]);

  React.useEffect(() => {
    setEnableThinking(
      chatSessionStore.getCurrentCompletionSettings().enable_thinking ?? false,
    );
  }, [chatSessionStore.activeSessionId, chatSessionStore.newChatCompletionSettings]);

  React.useEffect(() => {
    if (chatSessionStore.isEditMode && chatSessionStore.editingMessageId) {
      const session = chatSessionStore.sessions.find(
        s => s.id === chatSessionStore.activeSessionId,
      );
      const editMsg = session?.messages.find(
        message => message.id === chatSessionStore.editingMessageId,
      );
      if (editMsg && editMsg.type === 'text') {
        setEditingText(editMsg.text);
        setInputText(editMsg.text);
      }
      return;
    }

    if (editingText !== null) {
      setEditingText(null);
    }
  }, [
    chatSessionStore.activeSessionId,
    chatSessionStore.editingMessageId,
    chatSessionStore.isEditMode,
    chatSessionStore.sessions,
  ]);

  const handleToggleThinking = useCallback(() => {
    const nextValue = !enableThinking;
    setEnableThinking(nextValue);
    chatSessionStore.updateCompletionSettings({enable_thinking: nextValue});
  }, [enableThinking]);

  const handleCancelEdit = useCallback(() => {
    chatSessionStore.exitEditMode();
    setInputText('');
  }, []);

  const imageUrisRef = useRef<string[]>(imageUris);
  imageUrisRef.current = imageUris;

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() && imageUrisRef.current.length === 0) {
        return;
      }

      if (chatSessionStore.isEditMode && chatSessionStore.editingMessageId) {
        const editId = chatSessionStore.editingMessageId;
        await handleEditAndResend(editId, text.trim());
        setInputText('');
        setEditingText(null);
        return;
      }

      setSearchResults([]);
      setShowSearchResults(false);

      const willSearch = enableWebSearch && shouldSearchWeb(text);
      if (willSearch) {
        setIsSearching(true);
      }

      const images = [...imageUrisRef.current];
      try {
        await handleSendPress({text, imageUris: images});
        if (modelStore.engine && modelStore.contextId) {
          setInputText('');
          setImageUris([]);
        }
      } finally {
        setIsSearching(false);
      }
    },
    [enableWebSearch, handleEditAndResend, handleSendPress],
  );

  const handleAttachImage = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
      });
      const uri = result.assets?.[0]?.uri;
      if (uri) {
        setImageUris(prev => [...prev, uri]);
      }
    } catch (error) {
      console.error('Image picker error:', error);
    }
  }, []);

  const sessionTitle = useMemo(() => {
    if (!chatSessionStore.activeSessionId) return 'New Chat';
    return (
      chatSessionStore.sessions.find(
        session => session.id === chatSessionStore.activeSessionId,
      )?.title || 'New Chat'
    );
  }, [chatSessionStore.activeSessionId, chatSessionStore.sessions]);

  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const handleShareConversation = useCallback(async () => {
    const textMessages = [...messages]
      .reverse()
      .filter(
        message =>
          message.type === 'text' && !(message as MessageType.Text).metadata?.system,
      )
      .map(message => ({
        role: (message.author.id === user.id ? 'user' : 'assistant') as
          | 'user'
          | 'assistant',
        text: (message as MessageType.Text).text || '',
      }));

    if (!textMessages.length) {
      Alert.alert('Nothing to share', 'Start a conversation first.');
      return;
    }

    const exportText = exportConversationText(sessionTitle, textMessages);
    try {
      await Share.share({message: exportText, title: sessionTitle});
    } catch (error) {
      console.error('Share error:', error);
    }
  }, [messages, sessionTitle]);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => navigation.openDrawer()}
        style={styles.headerBtn}
        activeOpacity={0.7}>
        <IconButton
          icon="menu"
          iconColor="#333"
          size={22}
          style={styles.headerBtnIcon}
        />
      </TouchableOpacity>

      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {sessionTitle}
        </Text>
        <View style={styles.headerSubtitleRow}>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {activeModel ? activeModel.name : 'Offline chat'}
          </Text>
          <View style={styles.headerStatusPill}>
            <Text style={styles.headerStatusText}>{runtimeStatusLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.headerRight}>
        {messages.length > 0 ? (
          <TouchableOpacity
            onPress={() => setShowAnalytics(true)}
            style={styles.headerBtn}
            activeOpacity={0.7}>
            <IconButton
              icon="chart-box-outline"
              iconColor="#333"
              size={20}
              style={styles.headerBtnIcon}
            />
          </TouchableOpacity>
        ) : null}
        {messages.length > 0 ? (
          <TouchableOpacity
            onPress={handleShareConversation}
            style={styles.headerBtn}
            activeOpacity={0.7}>
            <IconButton
              icon="share-variant-outline"
              iconColor="#333"
              size={20}
              style={styles.headerBtnIcon}
            />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => chatSessionStore.resetActiveSession()}
          style={styles.headerBtn}
          activeOpacity={0.7}>
          <View style={styles.newChatCircle}>
            <Text style={styles.newChatPlus}>+</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <Animated.View style={[styles.emptyState, {opacity: fadeAnim}]}>
      <Text style={styles.emptyGreeting}>Hi, I'm Offline AI.</Text>
      <Text style={styles.emptySubtitle}>How can I help you today?</Text>
      {!activeModel ? (
        <TouchableOpacity
          style={styles.loadModelBtn}
          onPress={() => navigation.navigate('Models')}
          activeOpacity={0.8}>
          <Text style={styles.loadModelBtnText}>Load a model to start</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );

  const renderModelLoading = () => (
    <View style={styles.loadingRow}>
      <ActivityIndicator size="small" color="#4f8ef7" />
      <Text style={styles.loadingText}>
        Loading {modelStore.loadingModel?.name || 'model'}...
      </Text>
    </View>
  );

  const renderItem = useCallback(
    ({item}: {item: MessageType.Any}) => {
      if (item.type === 'text') {
        return (
          <MessageBubble
            message={item}
            isUser={item.author.id === user.id}
            isStreaming={
              item.author.id !== user.id &&
              item.id === currentMessageInfo.current?.id &&
              isGenerating
            }
            onRegenerate={
              item.author.id !== user.id && !isGenerating
                ? handleRegenerate
                : undefined
            }
            onDelete={
              !isGenerating
                ? id => chatSessionStore.deleteMessage(id)
                : undefined
            }
          />
        );
      }

      if (item.type === 'system') {
        return (
          <View style={styles.systemMsg}>
            <Text style={styles.systemMsgText}>{item.text}</Text>
          </View>
        );
      }

      return null;
    },
    [handleRegenerate],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {renderHeader()}

      <SearchResults
        results={searchResults}
        isVisible={showSearchResults}
        onDismiss={() => setShowSearchResults(false)}
      />

      <View style={styles.content}>
        {isLoadingModel ? (
          renderModelLoading()
        ) : messages.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item, index) => item.id || `msg-${index}`}
            inverted
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={8}
            windowSize={10}
            initialNumToRender={15}
          />
        )}
      </View>

      {isGenerating && !modelStore.isStreaming ? <TypingIndicator /> : null}

      {chatSessionStore.isEditMode ? (
        <View style={styles.editBar}>
          <Text style={styles.editBarText}>Editing message</Text>
          <TouchableOpacity
            onPress={handleCancelEdit}
            activeOpacity={0.7}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Text style={styles.editBarCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ChatInput
        value={inputText}
        onChangeText={setInputText}
        onSend={handleSend}
        onStop={handleStopPress}
        isGenerating={isGenerating}
        isLoading={isLoadingModel}
        supportsVision={supportsVisionModel}
        onAttachImage={handleAttachImage}
        imageUris={imageUris}
        onRemoveImage={uri =>
          setImageUris(prev => prev.filter(currentUri => currentUri !== uri))
        }
        enableWebSearch={enableWebSearch}
        onToggleWebSearch={() => setEnableWebSearch(prev => !prev)}
        isSearching={isSearching}
        enableThinking={enableThinking}
        onToggleThinking={handleToggleThinking}
      />

      <ChatAnalyticsModal
        messages={reversedMessages}
        visible={showAnalytics}
        onClose={() => setShowAnalytics(false)}
      />
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  content: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerBtn: {justifyContent: 'center', alignItems: 'center', padding: 4},
  headerBtnIcon: {margin: 0},
  headerCenter: {flex: 1, alignItems: 'center'},
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: 2},
  headerTitle: {
    color: '#111',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  headerSubtitle: {color: '#4f8ef7', fontSize: 12, maxWidth: 160},
  headerStatusPill: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  headerStatusText: {color: '#666', fontSize: 10, fontWeight: '600'},
  newChatCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  newChatPlus: {
    color: '#333',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '300',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyGreeting: {
    color: '#111',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
  },
  loadModelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: '#111',
  },
  loadModelBtnText: {color: '#fff', fontSize: 14, fontWeight: '600'},
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  loadingText: {color: '#888', fontSize: 13},
  listContent: {paddingVertical: 8, paddingHorizontal: 0},
  systemMsg: {alignSelf: 'center', paddingVertical: 4, marginVertical: 8},
  systemMsgText: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f5ff',
    borderTopWidth: 1,
    borderTopColor: '#c7d9ff',
  },
  editBarText: {color: '#4f8ef7', fontSize: 13, fontWeight: '500'},
  editBarCancel: {color: '#ef4444', fontSize: 13, fontWeight: '600'},
});

export default ChatScreen;
