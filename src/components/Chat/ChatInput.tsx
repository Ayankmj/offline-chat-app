import React from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {IconButton} from 'react-native-paper';
import {estimateTokenCount} from '../../utils/chatUtils';

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  isLoading: boolean;
  supportsVision?: boolean;
  onAttachImage?: () => void;
  imageUris?: string[];
  onRemoveImage?: (uri: string) => void;
  enableWebSearch?: boolean;
  onToggleWebSearch?: () => void;
  isSearching?: boolean;
  enableThinking?: boolean;
  onToggleThinking?: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChangeText,
  onSend,
  onStop,
  isGenerating,
  isLoading,
  supportsVision,
  onAttachImage,
  imageUris,
  onRemoveImage,
  enableWebSearch = false,
  onToggleWebSearch,
  isSearching = false,
  enableThinking = false,
  onToggleThinking,
}) => {
  const scaleRef = React.useRef<Animated.Value | null>(null);
  if (!scaleRef.current) scaleRef.current = new Animated.Value(1);
  const scale = scaleRef.current;

  const hasText = value.trim().length > 0;
  const hasImages = !!imageUris && imageUris.length > 0;
  const canSend = (hasText || hasImages) && !isLoading && !isSearching;

  const handleSend = () => {
    if (!canSend) return;
    onSend(value.trim());
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.88,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <View style={styles.wrapper}>
      {hasImages && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previewRow}
          contentContainerStyle={styles.previewContent}>
          {imageUris!.map((uri, idx) => (
            <View key={`${uri}-${idx}`} style={styles.previewItem}>
              <Image source={{uri}} style={styles.previewThumb} resizeMode="cover" />
              <TouchableOpacity
                style={styles.previewRemove}
                onPress={() => onRemoveImage?.(uri)}
                hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
                <View style={styles.previewRemoveBg}>
                  <Text style={styles.previewRemoveX}>x</Text>
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputCard}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder="Type a message or hold to speak"
          placeholderTextColor="#aaa"
          multiline
          maxLength={4000}
          editable={!isLoading && !isSearching}
          returnKeyType="default"
        />

        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
            {onToggleThinking && (
              <TouchableOpacity
                style={[styles.pill, enableThinking && styles.pillActive]}
                onPress={onToggleThinking}
                activeOpacity={0.7}>
                <IconButton
                  icon="brain"
                  size={16}
                  iconColor={enableThinking ? '#333' : '#666'}
                  style={styles.pillIconButton}
                />
                <Text style={[styles.pillText, enableThinking && styles.pillTextActive]}>
                  Think
                </Text>
              </TouchableOpacity>
            )}

            {onToggleWebSearch && (
              <TouchableOpacity
                style={[styles.pill, enableWebSearch && styles.pillActiveBlue]}
                onPress={onToggleWebSearch}
                activeOpacity={0.7}
                disabled={isSearching}>
                {isSearching ? (
                  <ActivityIndicator size="small" color="#4f8ef7" style={styles.searchSpinner} />
                ) : (
                  <IconButton
                    icon="web"
                    size={16}
                    iconColor={enableWebSearch ? '#4f8ef7' : '#666'}
                    style={styles.pillIconButton}
                  />
                )}
                <Text style={[styles.pillText, enableWebSearch && styles.pillTextBlue]}>
                  {isSearching ? 'Searching' : 'Search'}
                </Text>
              </TouchableOpacity>
            )}

            {onAttachImage && supportsVision && (
              <TouchableOpacity
                style={styles.toolbarIconBtn}
                onPress={onAttachImage}
                activeOpacity={0.7}
                disabled={isGenerating || isLoading}>
                <IconButton
                  icon="plus"
                  size={16}
                  iconColor="#555"
                  style={styles.toolbarIconButton}
                />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.toolbarRight}>
            {hasText && !isGenerating && (
              <Text style={styles.tokenCount}>~{estimateTokenCount(value)} tokens</Text>
            )}
            <Animated.View style={{transform: [{scale}]}}>
              {isGenerating ? (
                <TouchableOpacity
                  style={styles.stopBtn}
                  onPress={onStop}
                  activeOpacity={0.8}>
                  <View style={styles.stopSquare} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
                  onPress={handleSend}
                  disabled={!canSend}
                  activeOpacity={0.8}>
                  <IconButton
                    icon="arrow-up"
                    size={18}
                    iconColor={canSend ? '#fff' : '#999'}
                    style={styles.sendIcon}
                  />
                </TouchableOpacity>
              )}
            </Animated.View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 16,
  },
  previewRow: {maxHeight: 72, marginBottom: 8},
  previewContent: {gap: 8, paddingHorizontal: 4},
  previewItem: {width: 64, height: 64, position: 'relative'},
  previewThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
  },
  previewRemove: {position: 'absolute', top: -6, right: -6, zIndex: 1},
  previewRemoveBg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewRemoveX: {color: '#fff', fontSize: 12, lineHeight: 16, fontWeight: '700'},
  inputCard: {
    backgroundColor: '#f7f7f8',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  input: {
    color: '#111',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 36,
    maxHeight: 140,
    marginBottom: 8,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: '#ebebeb',
    gap: 2,
  },
  pillActive: {
    backgroundColor: '#ebebeb',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  pillActiveBlue: {
    backgroundColor: '#e8f0fe',
    borderWidth: 1,
    borderColor: '#4f8ef7',
  },
  pillIconButton: {margin: 0},
  searchSpinner: {marginRight: 4},
  pillText: {color: '#555', fontSize: 13, fontWeight: '500'},
  pillTextActive: {color: '#333'},
  pillTextBlue: {color: '#4f8ef7', fontWeight: '600'},
  toolbarIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarIconButton: {margin: 0},
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnOff: {backgroundColor: '#e0e0e0'},
  sendIcon: {margin: 0},
  stopBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tokenCount: {
    fontSize: 11,
    color: '#bbb',
    fontVariant: ['tabular-nums'],
  },
});

export default ChatInput;
