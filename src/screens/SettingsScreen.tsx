import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {observer} from 'mobx-react';
import {SafeAreaView} from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import {IconButton} from 'react-native-paper';

import {chatSessionStore} from '../store/ChatSessionStore';
import {hfTokenStore} from '../store/HfTokenStore';
import {modelStore} from '../store/ModelStore';
import {ragStore} from '../store/RagStore';
import {DEFAULT_SYSTEM_PROMPT, systemPromptStore} from '../store/SystemPromptStore';

const SectionLabel = ({label}: {label: string}) => (
  <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
);

const Sep = () => <View style={styles.sep} />;

const Row = ({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children?: React.ReactNode;
}) => (
  <View style={styles.row}>
    <View style={styles.rowLeft}>
      <Text style={styles.rowLabel}>{label}</Text>
      {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
    </View>
    {children}
  </View>
);

const DiagnosticsChip = ({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'warn';
}) => (
  <View
    style={[
      styles.diagnosticChip,
      tone === 'good' ? styles.diagnosticChipGood : null,
      tone === 'warn' ? styles.diagnosticChipWarn : null,
    ]}>
    <Text
      style={[
        styles.diagnosticChipText,
        tone === 'good' ? styles.diagnosticChipTextGood : null,
        tone === 'warn' ? styles.diagnosticChipTextWarn : null,
      ]}>
      {label}
    </Text>
  </View>
);

const SettingsScreen = observer(({navigation}: any) => {
  const [hfToken, setHfToken] = useState(hfTokenStore.getToken() || '');
  const [autoRelease, setAutoRelease] = useState(modelStore.useAutoRelease);
  const [nCtx, setNCtx] = useState(modelStore.contextInitParams.n_ctx);
  const [nGpuLayers, setNGpuLayers] = useState(
    modelStore.contextInitParams.n_gpu_layers ?? 99,
  );
  const [flashAttn, setFlashAttn] = useState(
    modelStore.contextInitParams.flash_attn_type !== 'off',
  );
  const [imageMaxTokens, setImageMaxTokens] = useState(
    modelStore.contextInitParams.image_max_tokens ?? 512,
  );

  const activeSettings = (() => {
    const session = chatSessionStore.sessions.find(
      s => s.id === chatSessionStore.activeSessionId,
    );
    return session?.completionSettings || chatSessionStore.newChatCompletionSettings;
  })();

  const [temperature, setTemperature] = useState(
    activeSettings.temperature ?? 0.7,
  );
  const [maxTokens, setMaxTokens] = useState(activeSettings.n_predict ?? 2048);
  const [enableThinking, setEnableThinking] = useState(
    activeSettings.enable_thinking ?? false,
  );
  const [systemPrompt, setSystemPrompt] = useState(
    systemPromptStore.systemPrompt,
  );
  const [systemPromptEnabled, setSystemPromptEnabled] = useState(
    systemPromptStore.isSystemPromptEnabled,
  );
  const [ragEnabled, setRagEnabled] = useState(ragStore.enabled);
  const [ragTitle, setRagTitle] = useState('');
  const [ragContent, setRagContent] = useState('');

  const tokenDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTemperature(activeSettings.temperature ?? 0.7);
    setMaxTokens(activeSettings.n_predict ?? 2048);
    setEnableThinking(activeSettings.enable_thinking ?? false);
  }, [
    activeSettings.temperature,
    activeSettings.n_predict,
    activeSettings.enable_thinking,
  ]);

  useEffect(() => {
    setSystemPrompt(systemPromptStore.systemPrompt);
    setSystemPromptEnabled(systemPromptStore.isSystemPromptEnabled);
  }, [
    systemPromptStore.systemPrompt,
    systemPromptStore.isSystemPromptEnabled,
  ]);

  useEffect(() => {
    hfTokenStore.load().then(() => {
      const token = hfTokenStore.getToken();
      if (token) {
        setHfToken(token);
      }
    });

    return () => {
      if (tokenDebounceRef.current) {
        clearTimeout(tokenDebounceRef.current);
      }
    };
  }, []);

  const activeModel = modelStore.activeModel;
  const activeProjectionModel = useMemo(() => {
    if (!activeModel?.defaultProjectionModel) {
      return null;
    }
    return (
      modelStore.models.find(m => m.id === activeModel.defaultProjectionModel) ||
      null
    );
  }, [activeModel, modelStore.models.length]);

  const effectiveContextLength =
    activeModel?.ggufMetadata?.context_length ||
    activeModel?.hfModel?.specs?.gguf?.context_length ||
    null;
  const activeArchitecture =
    activeModel?.ggufMetadata?.architecture ||
    activeModel?.hfModel?.specs?.gguf?.architecture ||
    null;
  const activeVisionRequested = Boolean(activeModel?.supportsMultimodal);
  const activeProjectionReady = Boolean(
    activeProjectionModel?.isDownloaded && activeModel?.visionEnabled,
  );

  const handleTokenChange = (value: string) => {
    setHfToken(value);
    if (tokenDebounceRef.current) {
      clearTimeout(tokenDebounceRef.current);
    }
    tokenDebounceRef.current = setTimeout(() => {
      hfTokenStore.setToken(value || null);
    }, 500);
  };

  const handleUnloadModel = () => {
    Alert.alert(
      'Unload Model',
      `Unload ${activeModel?.name || 'current model'} from memory?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Unload',
          style: 'destructive',
          onPress: async () => {
            await modelStore.releaseContext(true);
          },
        },
      ],
    );
  };

  const handleClearChats = () => {
    Alert.alert(
      'Clear All Chats',
      'This will permanently delete all conversation history.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            chatSessionStore.clearAllSessions();
          },
        },
      ],
    );
  };

  const handleAddMemory = () => {
    try {
      ragStore.addDocument(ragTitle, ragContent);
      setRagTitle('');
      setRagContent('');
    } catch (error) {
      Alert.alert(
        'Memory not saved',
        error instanceof Error ? error.message : 'Add some content first.',
      );
    }
  };

  const handleClearMemories = () => {
    Alert.alert('Clear Memories', 'Delete all local RAG memories?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => ragStore.clearDocuments(),
      },
    ]);
  };

  const applySessionCompletionSettings = (
    patch: Partial<{
      temperature: number;
      n_predict: number;
      enable_thinking: boolean;
    }>,
  ) => {
    chatSessionStore.updateCompletionSettings(patch);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          size={22}
          iconColor="#4f8ef7"
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        />
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionLabel label="Model" />
        <View style={styles.section}>
          <Row
            label="Active model"
            desc={activeModel ? activeModel.name : 'No model currently loaded'}>
            {activeModel ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleUnloadModel}
                activeOpacity={0.8}>
                <Text style={styles.secondaryBtnText}>Unload</Text>
              </TouchableOpacity>
            ) : null}
          </Row>
          <Sep />
          <View style={styles.diagnosticsWrap}>
            <View style={styles.diagnosticsHeader}>
              <Text style={styles.rowLabel}>Runtime diagnostics</Text>
              <Text style={styles.rowDesc}>
                Loaded metadata and multimodal readiness
              </Text>
            </View>
            <View style={styles.diagnosticsGrid}>
              <DiagnosticsChip
                label={
                  modelStore.isContextLoading
                    ? 'Loading'
                    : modelStore.context
                      ? 'Loaded'
                      : 'Idle'
                }
                tone={modelStore.context ? 'good' : 'neutral'}
              />
              <DiagnosticsChip
                label={
                  modelStore.isMultimodalActive ? 'Vision active' : 'Text only'
                }
                tone={modelStore.isMultimodalActive ? 'good' : 'neutral'}
              />
              {activeVisionRequested ? (
                <DiagnosticsChip
                  label={
                    activeProjectionReady
                      ? 'Projector ready'
                      : 'Projector needed'
                  }
                  tone={activeProjectionReady ? 'good' : 'warn'}
                />
              ) : null}
            </View>
            <View style={styles.statList}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Architecture</Text>
                <Text style={styles.statValue}>
                  {activeArchitecture || 'Unknown'}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Context limit</Text>
                <Text style={styles.statValue}>
                  {effectiveContextLength
                    ? `${effectiveContextLength.toLocaleString()} tokens`
                    : 'Unknown'}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Image budget</Text>
                <Text style={styles.statValue}>
                  {(modelStore.contextInitParams.image_max_tokens ?? 512).toLocaleString()}{' '}
                  tokens
                </Text>
              </View>
              {activeProjectionModel ? (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Projection asset</Text>
                  <Text style={styles.statValue} numberOfLines={1}>
                    {activeProjectionModel.filename}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Sep />
          <Row label="Auto-release" desc="Free VRAM when the app backgrounds">
            <Switch
              value={autoRelease}
              onValueChange={value => {
                setAutoRelease(value);
                modelStore.updateUseAutoRelease(value);
              }}
              trackColor={{false: '#e0e0e0', true: '#c7d9ff'}}
              thumbColor={autoRelease ? '#4f8ef7' : '#aaa'}
            />
          </Row>
          <Sep />
          <Row label="Flash Attention" desc="Faster inference with higher VRAM use">
            <Switch
              value={flashAttn}
              onValueChange={value => {
                setFlashAttn(value);
                modelStore.setFlashAttnType(value ? 'auto' : 'off');
              }}
              trackColor={{false: '#e0e0e0', true: '#c7d9ff'}}
              thumbColor={flashAttn ? '#4f8ef7' : '#aaa'}
            />
          </Row>
          <Sep />
          <View style={styles.sliderRow}>
            <View style={styles.sliderTop}>
              <Text style={styles.rowLabel}>Context size</Text>
              <Text style={styles.sliderVal}>{nCtx.toLocaleString()}</Text>
            </View>
            <Slider
              value={nCtx}
              minimumValue={512}
              maximumValue={32768}
              step={512}
              minimumTrackTintColor="#4f8ef7"
              maximumTrackTintColor="#e0e0e0"
              thumbTintColor="#4f8ef7"
              style={styles.slider}
              onValueChange={value => setNCtx(value)}
              onSlidingComplete={value => modelStore.setNContext(value)}
            />
          </View>
          <Sep />
          <View style={styles.sliderRow}>
            <View style={styles.sliderTop}>
              <Text style={styles.rowLabel}>GPU layers</Text>
              <Text style={styles.sliderVal}>{nGpuLayers}</Text>
            </View>
            <Slider
              value={nGpuLayers}
              minimumValue={0}
              maximumValue={99}
              step={1}
              minimumTrackTintColor="#4f8ef7"
              maximumTrackTintColor="#e0e0e0"
              thumbTintColor="#4f8ef7"
              style={styles.slider}
              onValueChange={value => setNGpuLayers(value)}
              onSlidingComplete={value => modelStore.setNGPULayers(value)}
            />
          </View>
          <Sep />
          <View style={styles.sliderRow}>
            <View style={styles.sliderTop}>
              <Text style={styles.rowLabel}>Image max tokens</Text>
              <Text style={styles.sliderVal}>
                {imageMaxTokens.toLocaleString()}
              </Text>
            </View>
            <Slider
              value={imageMaxTokens}
              minimumValue={128}
              maximumValue={4096}
              step={64}
              minimumTrackTintColor="#4f8ef7"
              maximumTrackTintColor="#e0e0e0"
              thumbTintColor="#4f8ef7"
              style={styles.slider}
              onValueChange={value => setImageMaxTokens(value)}
              onSlidingComplete={value => modelStore.setImageMaxTokens(value)}
            />
            <Text style={styles.sliderHint}>
              Used only when a vision-capable model and projector are loaded.
            </Text>
          </View>
        </View>

        <SectionLabel label="Generation" />
        <View style={styles.section}>
          <Row
            label="Thinking mode"
            desc="Let the model emit reasoning when supported">
            <Switch
              value={enableThinking}
              onValueChange={value => {
                setEnableThinking(value);
                applySessionCompletionSettings({enable_thinking: value});
              }}
              trackColor={{false: '#e0e0e0', true: '#c7d9ff'}}
              thumbColor={enableThinking ? '#4f8ef7' : '#aaa'}
            />
          </Row>
          <Sep />
          <View style={styles.sliderRow}>
            <View style={styles.sliderTop}>
              <Text style={styles.rowLabel}>Temperature</Text>
              <Text style={styles.sliderVal}>{temperature.toFixed(2)}</Text>
            </View>
            <Slider
              value={temperature}
              minimumValue={0}
              maximumValue={2}
              step={0.05}
              minimumTrackTintColor="#4f8ef7"
              maximumTrackTintColor="#e0e0e0"
              thumbTintColor="#4f8ef7"
              style={styles.slider}
              onValueChange={value => {
                setTemperature(value);
                applySessionCompletionSettings({temperature: value});
              }}
            />
          </View>
          <Sep />
          <View style={styles.sliderRow}>
            <View style={styles.sliderTop}>
              <Text style={styles.rowLabel}>Max output tokens</Text>
              <Text style={styles.sliderVal}>{maxTokens.toLocaleString()}</Text>
            </View>
            <Slider
              value={maxTokens}
              minimumValue={128}
              maximumValue={8192}
              step={128}
              minimumTrackTintColor="#4f8ef7"
              maximumTrackTintColor="#e0e0e0"
              thumbTintColor="#4f8ef7"
              style={styles.slider}
              onValueChange={value => {
                setMaxTokens(value);
                applySessionCompletionSettings({n_predict: value});
              }}
            />
          </View>
        </View>

        <SectionLabel label="System Prompt" />
        <View style={styles.section}>
          <Row
            label="Enable system prompt"
            desc="Apply a default instruction to new responses">
            <Switch
              value={systemPromptEnabled}
              onValueChange={value => {
                setSystemPromptEnabled(value);
                systemPromptStore.setEnabled(value);
              }}
              trackColor={{false: '#e0e0e0', true: '#c7d9ff'}}
              thumbColor={systemPromptEnabled ? '#4f8ef7' : '#aaa'}
            />
          </Row>
          <Sep />
          <View style={styles.promptWrap}>
            <Text style={styles.rowLabel}>Prompt</Text>
            <Text style={styles.rowDesc}>
              Saved locally and prepended when enabled
            </Text>
            <TextInput
              style={styles.promptInput}
              placeholder="You are a helpful assistant..."
              placeholderTextColor="#999"
              multiline
              value={systemPrompt}
              onChangeText={value => {
                setSystemPrompt(value);
                systemPromptStore.setSystemPrompt(value);
              }}
            />
            <TouchableOpacity
              style={styles.secondaryOutlineBtn}
              onPress={() => {
                const nextPrompt = DEFAULT_SYSTEM_PROMPT;
                setSystemPrompt(nextPrompt);
                systemPromptStore.setSystemPrompt(nextPrompt);
              }}
              activeOpacity={0.8}>
              <Text style={styles.secondaryOutlineBtnText}>Reset prompt</Text>
            </TouchableOpacity>
          </View>
        </View>

        <SectionLabel label="Memory" />
        <View style={styles.section}>
          <Row
            label="Enable local memory"
            desc="Surface saved notes as extra retrieval context">
            <Switch
              value={ragEnabled}
              onValueChange={value => {
                setRagEnabled(value);
                ragStore.setEnabled(value);
              }}
              trackColor={{false: '#e0e0e0', true: '#c7d9ff'}}
              thumbColor={ragEnabled ? '#4f8ef7' : '#aaa'}
            />
          </Row>
          {ragEnabled ? (
            <>
              <Sep />
              <View style={styles.memoryWrap}>
                <Text style={styles.rowLabel}>Add memory</Text>
                <TextInput
                  style={styles.memoryTitleInput}
                  placeholder="Title"
                  placeholderTextColor="#999"
                  value={ragTitle}
                  onChangeText={setRagTitle}
                />
                <TextInput
                  style={styles.memoryContentInput}
                  placeholder="Add a note, fact, or persistent instruction"
                  placeholderTextColor="#999"
                  multiline
                  value={ragContent}
                  onChangeText={setRagContent}
                />
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleAddMemory}
                  activeOpacity={0.8}>
                  <Text style={styles.primaryBtnText}>Save memory</Text>
                </TouchableOpacity>
              </View>
              <Sep />
              <View style={styles.memoryList}>
                <View style={styles.memoryListHeader}>
                  <Text style={styles.rowLabel}>
                    Saved memories ({ragStore.documents.length})
                  </Text>
                  {ragStore.documents.length > 0 ? (
                    <TouchableOpacity
                      onPress={handleClearMemories}
                      activeOpacity={0.7}>
                      <Text style={styles.deleteText}>Clear all</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {ragStore.documents.slice(0, 8).map(doc => (
                  <View key={doc.id} style={styles.memoryItem}>
                    <View style={styles.memoryItemText}>
                      <Text style={styles.memoryTitle} numberOfLines={1}>
                        {doc.title}
                      </Text>
                      <Text style={styles.memoryPreview} numberOfLines={2}>
                        {doc.content}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => ragStore.deleteDocument(doc.id)}
                      activeOpacity={0.7}>
                      <Text style={styles.deleteText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>

        <SectionLabel label="Chats" />
        <View style={styles.section}>
          <Row
            label="Clear all chats"
            desc="Permanently delete all conversations">
            <TouchableOpacity
              style={styles.dangerBtn}
              onPress={handleClearChats}
              activeOpacity={0.8}>
              <Text style={styles.dangerBtnText}>Clear</Text>
            </TouchableOpacity>
          </Row>
        </View>

        <SectionLabel label="HuggingFace" />
        <View style={styles.section}>
          <View style={styles.tokenWrap}>
            <Text style={styles.rowLabel}>Access token</Text>
            <Text style={styles.rowDesc}>
              Required for gated and private model repositories
            </Text>
            <TextInput
              style={styles.tokenInput}
              placeholder="hf_xxxxxxxxxxxxxxxx"
              placeholderTextColor="#999"
              value={hfToken}
              onChangeText={handleTokenChange}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <SectionLabel label="About" />
        <View style={[styles.section, styles.aboutSection]}>
          <View style={styles.aboutLogo}>
            <Text style={styles.aboutLogoText}>AI</Text>
          </View>
          <Text style={styles.aboutName}>Offline Chat AI</Text>
          <Text style={styles.aboutVersion}>v0.1.0</Text>
          <Text style={styles.aboutDesc}>
            Powered by llama.cpp with on-device inference, local storage, and
            optional Hugging Face downloads.
          </Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  backBtn: {margin: 0},
  headerTitle: {color: '#111', fontSize: 17, fontWeight: '600'},
  headerSpacer: {width: 40},
  scroll: {flex: 1},
  sectionLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginHorizontal: 16,
    marginTop: 28,
    marginBottom: 6,
  },
  section: {
    backgroundColor: '#f7f7f8',
    borderRadius: 12,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    overflow: 'hidden',
  },
  sep: {height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 16},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  rowLeft: {flex: 1, marginRight: 12},
  rowLabel: {color: '#111', fontSize: 15, fontWeight: '500'},
  rowDesc: {color: '#888', fontSize: 12, marginTop: 2, lineHeight: 16},
  diagnosticsWrap: {paddingHorizontal: 16, paddingVertical: 14, gap: 12},
  diagnosticsHeader: {gap: 2},
  diagnosticsGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  diagnosticChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  diagnosticChipGood: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  diagnosticChipWarn: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  diagnosticChipText: {
    color: '#444',
    fontSize: 12,
    fontWeight: '600',
  },
  diagnosticChipTextGood: {color: '#15803d'},
  diagnosticChipTextWarn: {color: '#c2410c'},
  statList: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ececec',
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  statLabel: {color: '#666', fontSize: 12},
  statValue: {color: '#111', fontSize: 12, fontWeight: '600', flexShrink: 1},
  sliderRow: {paddingHorizontal: 16, paddingVertical: 14},
  sliderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sliderVal: {color: '#4f8ef7', fontSize: 14, fontWeight: '600'},
  slider: {width: '100%'},
  sliderHint: {color: '#888', fontSize: 12, lineHeight: 16, marginTop: 6},
  dangerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  dangerBtnText: {color: '#ef4444', fontSize: 13, fontWeight: '500'},
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  secondaryBtnText: {color: '#111', fontSize: 13, fontWeight: '500'},
  secondaryOutlineBtn: {
    marginTop: 8,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f0f5ff',
    borderWidth: 1,
    borderColor: '#c7d9ff',
  },
  secondaryOutlineBtnText: {
    color: '#4f8ef7',
    fontSize: 12,
    fontWeight: '500',
  },
  tokenWrap: {padding: 16},
  tokenInput: {
    backgroundColor: '#fff',
    color: '#111',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginTop: 10,
    fontFamily: 'monospace',
  },
  promptWrap: {padding: 16},
  promptInput: {
    backgroundColor: '#fff',
    color: '#111',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginTop: 10,
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  memoryWrap: {padding: 16},
  memoryTitleInput: {
    backgroundColor: '#fff',
    color: '#111',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginTop: 10,
  },
  memoryContentInput: {
    backgroundColor: '#fff',
    color: '#111',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginTop: 8,
    minHeight: 110,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  primaryBtnText: {color: '#fff', fontSize: 13, fontWeight: '600'},
  memoryList: {padding: 16, gap: 10},
  memoryListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  memoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  memoryItemText: {flex: 1},
  memoryTitle: {color: '#111', fontSize: 13, fontWeight: '600'},
  memoryPreview: {color: '#888', fontSize: 12, marginTop: 2, lineHeight: 16},
  deleteText: {color: '#ef4444', fontSize: 12, fontWeight: '500'},
  aboutSection: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  aboutLogo: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  aboutLogoText: {color: '#fff', fontSize: 20, fontWeight: '800'},
  aboutName: {color: '#111', fontSize: 18, fontWeight: '600'},
  aboutVersion: {color: '#aaa', fontSize: 12, marginTop: 4},
  aboutDesc: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
    maxWidth: 300,
  },
  bottomSpacer: {height: 48},
});

export default SettingsScreen;
