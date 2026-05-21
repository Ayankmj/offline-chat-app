import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import {observer} from 'mobx-react';
import {runInAction} from 'mobx';
import {Searchbar, ProgressBar} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';

import {modelStore} from '../store/ModelStore';
import {
  Model,
  ModelOrigin,
  ModelType,
  HuggingFaceModel,
  ModelFile,
} from '../types';
import {fetchModels} from '../api/hf';
import {downloadManager} from '../services/DownloadManager';
import {hfTokenStore} from '../store/HfTokenStore';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  getPrimaryLlmFile,
  getProjectionModelFiles,
  getRecommendedProjectionModelFile,
} from '../utils/modelMultimodal';

const fmtSize = (b: number) => {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
  return `${b} B`;
};

const fmtParams = (p: number) => {
  if (p >= 1e9) return `${(p / 1e9).toFixed(1)}B`;
  if (p >= 1e6) return `${(p / 1e6).toFixed(0)}M`;
  return `${p}`;
};

const MULTIMODAL_PIPELINE_TAGS = new Set([
  'image-text-to-text',
  'visual-question-answering',
  'image-to-text',
  'document-question-answering',
]);

const MULTIMODAL_TAG_HINTS = [
  'vision',
  'vlm',
  'multimodal',
  'image-text-to-text',
  'visual-question-answering',
  'llava',
  'idefics',
  'paligemma',
  'cogvlm',
  'fuyu',
  'florence',
];

function isVisionCapableHfModel(model: HuggingFaceModel, file?: ModelFile | null): boolean {
  const pipelineTag = model.pipeline_tag?.toLowerCase() || '';
  if (MULTIMODAL_PIPELINE_TAGS.has(pipelineTag)) {
    return true;
  }

  const tags = (model.tags || []).map(tag => tag.toLowerCase());
  if (tags.some(tag => MULTIMODAL_TAG_HINTS.some(hint => tag.includes(hint)))) {
    return true;
  }

  const filename = file?.rfilename?.toLowerCase() || '';
  return (
    /llava|idefics|paligemma|cogvlm|fuyu|florence/.test(filename) ||
    getProjectionModelFiles(model.siblings || []).length > 0
  );
}

const modelKeyExtractor = (item: Model) => `${item.origin}-${item.id}`;

const ModelsScreen = observer(({navigation}: any) => {
  const [query, setQuery] = useState('');
  const [hfModels, setHfModels] = useState<Model[]>([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<'local' | 'search'>('local');
  const localModels = modelStore.availableModels;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const searchHF = useCallback(async (q: string) => {
    if (!q.trim()) {
      if (mountedRef.current) setHfModels([]);
      return;
    }

    setSearching(true);
    try {
      const result = await fetchModels({
        search: q,
        filter: 'gguf',
        limit: 20,
        full: true,
        authToken: hfTokenStore.getToken(),
      });

      const converted = result.models
        .map(m => {
          const sibling = getPrimaryLlmFile(m.siblings);
          if (!sibling) return null;

          const author = m.author || m.id.split('/')[0] || 'unknown';
          const repoName = m.id.split('/').slice(1).join('/') || m.id;
          const supportsMultimodal = isVisionCapableHfModel(m, sibling);
          const projectionFiles = getProjectionModelFiles(m.siblings || []);
          const compatibleProjectionModels = projectionFiles.map(
            file => `${m.id}/${file.rfilename}`,
          );
          const defaultProjectionFile = getRecommendedProjectionModelFile(
            sibling.rfilename,
            projectionFiles,
          );

          return {
            id: m.id,
            name: m.id.split('/').pop() || m.id,
            author,
            origin: ModelOrigin.HF,
            isDownloaded: false,
            isLocal: false,
            size: sibling.size || 0,
            params: m.specs?.gguf?.total || 0,
            downloadUrl: `https://huggingface.co/${m.id}/resolve/main/${sibling.rfilename}`,
            hfUrl: `https://huggingface.co/${m.id}`,
            progress: 0,
            filename: sibling.rfilename,
            defaultChatTemplate: {
              name: '',
              addBosToken: false,
              addEosToken: false,
              bosToken: '',
              eosToken: '',
              chatTemplate: '',
              addGenerationPrompt: false,
            },
            chatTemplate: {
              name: '',
              addBosToken: false,
              addEosToken: false,
              bosToken: '',
              eosToken: '',
              chatTemplate: '',
              addGenerationPrompt: false,
            },
            defaultStopWords: [],
            stopWords: [],
            defaultCompletionSettings: {},
            completionSettings: {},
            supportsMultimodal,
            visionEnabled: supportsMultimodal,
            modelType: ModelType.LLM,
            compatibleProjectionModels: supportsMultimodal
              ? compatibleProjectionModels
              : undefined,
            defaultProjectionModel:
              supportsMultimodal && defaultProjectionFile
                ? `${m.id}/${defaultProjectionFile.rfilename}`
                : undefined,
            hfModel: m,
            hfModelFile: sibling,
            repo: repoName,
          };
        })
        .filter(Boolean) as Model[];

      if (mountedRef.current) setHfModels(converted);
    } catch (e) {
      console.error('HF search failed:', e);
      if (mountedRef.current) setHfModels([]);
    } finally {
      if (mountedRef.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchHF(query), 500);
    return () => clearTimeout(t);
  }, [query, searchHF]);

  const handleDownload = useCallback(async (model: Model) => {
    if (!model.downloadUrl || downloadManager.isDownloading(model.id)) return;

    const destPath = `${RNFS.DocumentDirectoryPath}/models/hf/${model.author}/${model.repo}/${model.filename}`;
    try {
      modelStore.syncProjectionModelsFor(model);
      const idx = modelStore.models.findIndex(m => m.id === model.id);
      if (idx < 0) {
        runInAction(() => modelStore.models.push({...model, progress: 0}));
      } else {
        runInAction(() => {
          modelStore.models[idx].progress = 0;
        });
      }

      await downloadManager.startDownload(
        model,
        destPath,
        hfTokenStore.getToken(),
        {
          onProgress: (id, p) => {
            const i = modelStore.models.findIndex(m => m.id === id);
            if (i >= 0) {
              runInAction(() => {
                modelStore.models[i].progress = p.progress;
                modelStore.models[i].downloadSpeed = p.speed;
              });
            }
          },
          onComplete: async id => {
            const i = modelStore.models.findIndex(m => m.id === id);
            if (i >= 0) {
              runInAction(() => {
                modelStore.models[i].isDownloaded = true;
                modelStore.models[i].progress = 100;
                modelStore.models[i].fullPath = destPath;
              });
            }
          },
          onError: id => {
            const i = modelStore.models.findIndex(m => m.id === id);
            if (i >= 0) {
              runInAction(() => {
                modelStore.models[i].progress = 0;
              });
            }
          },
        },
      );

      const defaultProjectionId = model.defaultProjectionModel;
      const projectionModel = defaultProjectionId
        ? modelStore.models.find(m => m.id === defaultProjectionId)
        : undefined;

      if (
        model.supportsMultimodal &&
        projectionModel &&
        !projectionModel.isDownloaded &&
        !downloadManager.isDownloading(projectionModel.id)
      ) {
        const projectionPath = `${RNFS.DocumentDirectoryPath}/models/hf/${projectionModel.author}/${projectionModel.repo}/${projectionModel.filename}`;
        await downloadManager.startDownload(
          projectionModel,
          projectionPath,
          hfTokenStore.getToken(),
          {
            onProgress: (id, p) => {
              const i = modelStore.models.findIndex(m => m.id === id);
              if (i >= 0) {
                runInAction(() => {
                  modelStore.models[i].progress = p.progress;
                });
              }
            },
            onComplete: async id => {
              const i = modelStore.models.findIndex(m => m.id === id);
              if (i >= 0) {
                runInAction(() => {
                  modelStore.models[i].isDownloaded = true;
                  modelStore.models[i].progress = 100;
                  modelStore.models[i].fullPath = projectionPath;
                });
              }
            },
            onError: id => {
              const i = modelStore.models.findIndex(m => m.id === id);
              if (i >= 0) {
                runInAction(() => {
                  modelStore.models[i].progress = 0;
                });
              }
            },
          },
        );
      }
    } catch (e) {
      console.error('Download error:', e);
    }
  }, []);

  const handleCancelDownload = useCallback(async (id: string) => {
    await downloadManager.cancelDownload(id);
  }, []);

  const handleLoad = useCallback(
    async (model: Model) => {
      try {
        await modelStore.selectModel(model);
        navigation.goBack();
      } catch (e) {
        console.error('Load failed:', e);
        Alert.alert(
          'Load Failed',
          e instanceof Error
            ? e.message
            : 'Could not load model. It may be corrupted or incompatible.',
        );
      }
    },
    [navigation],
  );

  const renderCard = useCallback(
    ({item}: {item: Model}) => {
      const storedModel = modelStore.models.find(m => m.id === item.id);
      const displayModel = storedModel || item;
      const isLocal = displayModel.isDownloaded || displayModel.isLocal;
      const isActive = modelStore.activeModelId === displayModel.id;
      const isLoading = modelStore.loadingModel?.id === displayModel.id;
      const progress = displayModel.progress ?? 0;
      const downloading =
        downloadManager.isDownloading(displayModel.id) ||
        (progress > 0 && progress < 100);
      const contextLength = displayModel.ggufMetadata?.context_length;
      const architecture = displayModel.ggufMetadata?.architecture;
      const projectionReady = displayModel.defaultProjectionModel
        ? modelStore.models.find(m => m.id === displayModel.defaultProjectionModel)
            ?.isDownloaded
        : undefined;

      return (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName} numberOfLines={1}>
                {displayModel.name}
              </Text>
              <Text style={styles.cardAuthor} numberOfLines={1}>
                {displayModel.author}
              </Text>
            </View>
            <View style={styles.cardTags}>
              {displayModel.supportsMultimodal && (
                <View style={[styles.tag, styles.tagVision]}>
                  <Text style={[styles.tagText, {color: '#60a5fa'}]}>Vision</Text>
                </View>
              )}
              {displayModel.params > 0 && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{fmtParams(displayModel.params)}</Text>
                </View>
              )}
              {displayModel.size > 0 && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{fmtSize(displayModel.size)}</Text>
                </View>
              )}
              {contextLength ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>
                    {contextLength.toLocaleString()} ctx
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {(architecture || displayModel.supportsMultimodal) && (
            <View style={styles.cardMetaRow}>
              {architecture ? (
                <Text style={styles.cardMetaText}>Arch: {architecture}</Text>
              ) : null}
              {displayModel.supportsMultimodal ? (
                <Text style={styles.cardMetaText}>
                  Vision assets: {projectionReady ? 'Ready' : 'Needs projector'}
                </Text>
              ) : null}
            </View>
          )}

          <View style={styles.cardAction}>
            <Text style={styles.cardOrigin}>
              {displayModel.origin === ModelOrigin.HF
                ? 'HuggingFace'
                : displayModel.isLocal
                  ? 'Local'
                  : 'Preset'}
            </Text>
            {isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color="#4f8ef7" />
                <Text style={styles.loadingStateText}>Loading...</Text>
              </View>
            ) : isActive ? (
              <View style={styles.activeState}>
                <View style={styles.activeDot} />
                <Text style={styles.activeStateText}>Active</Text>
              </View>
            ) : downloading ? (
              <View style={styles.progressWrap}>
                <ProgressBar
                  progress={progress / 100}
                  color="#4f8ef7"
                  style={styles.progressBar}
                />
                <View style={styles.progressRow}>
                  <Text style={styles.progressText}>{progress.toFixed(0)}%</Text>
                  <TouchableOpacity
                    onPress={() => handleCancelDownload(displayModel.id)}
                    activeOpacity={0.7}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : isLocal ? (
              <TouchableOpacity
                style={styles.loadBtn}
                onPress={() => handleLoad(displayModel)}
                activeOpacity={0.8}>
                <Text style={styles.loadBtnText}>Load</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.downloadBtn}
                onPress={() => handleDownload(displayModel)}
                activeOpacity={0.8}>
                <Text style={styles.downloadBtnText}>Download</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [handleLoad, handleCancelDownload, handleDownload],
  );

  const allModels = tab === 'local' ? localModels : hfModels;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}>
          <Text style={styles.backText}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Models</Text>
        <View style={{width: 40}} />
      </View>

      <View style={styles.searchWrap}>
        <Searchbar
          placeholder="Search HuggingFace..."
          onChangeText={setQuery}
          value={query}
          style={styles.searchBar}
          iconColor="#4f8ef7"
          placeholderTextColor="#4a4a4a"
          inputStyle={styles.searchInput}
          onFocus={() => setTab('search')}
        />
      </View>

      <View style={styles.tabs}>
        {(['local', 'search'] as const).map(t => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'local' ? `Downloaded (${localModels.length})` : 'Browse HF'}
            </Text>
          </Pressable>
        ))}
      </View>

      {searching && tab === 'search' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4f8ef7" />
          <Text style={styles.centerText}>Searching...</Text>
        </View>
      ) : allModels.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>{tab === 'local' ? 'Models' : 'Search'}</Text>
          <Text style={styles.emptyTitle}>
            {tab === 'local' ? 'No models downloaded' : 'No results'}
          </Text>
          <Text style={styles.emptyHint}>
            {tab === 'local'
              ? 'Search and download from HuggingFace'
              : 'Try a different query'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={allModels}
          renderItem={renderCard}
          keyExtractor={modelKeyExtractor}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  backBtn: {width: 40, justifyContent: 'center'},
  backText: {color: '#4f8ef7', fontSize: 24, lineHeight: 28},
  headerTitle: {
    color: '#111',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  searchWrap: {paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4},
  searchBar: {
    backgroundColor: '#f7f7f8',
    elevation: 0,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 12,
    height: 44,
  },
  searchInput: {color: '#111', fontSize: 14},
  tabs: {flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8, gap: 8},
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#f7f7f8',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  tabActive: {backgroundColor: '#e8f0fe', borderColor: '#4f8ef7'},
  tabText: {color: '#999', fontSize: 13, fontWeight: '500'},
  tabTextActive: {color: '#4f8ef7', fontWeight: '600'},
  list: {paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4},
  sep: {height: 1, backgroundColor: '#f0f0f0'},
  card: {paddingVertical: 14, paddingHorizontal: 0},
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardInfo: {flex: 1, marginRight: 8},
  cardName: {color: '#111', fontSize: 15, fontWeight: '500'},
  cardAuthor: {color: '#888', fontSize: 12, marginTop: 2},
  cardTags: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  tagVision: {borderColor: '#bfdbfe', backgroundColor: '#eff6ff'},
  tagText: {color: '#666', fontSize: 11, fontWeight: '500'},
  cardMetaRow: {flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 10},
  cardMetaText: {color: '#777', fontSize: 11},
  cardAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardOrigin: {color: '#bbb', fontSize: 11},
  loadingState: {flexDirection: 'row', alignItems: 'center', gap: 6},
  loadingStateText: {color: '#4f8ef7', fontSize: 13},
  activeState: {flexDirection: 'row', alignItems: 'center', gap: 5},
  activeDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e'},
  activeStateText: {color: '#22c55e', fontSize: 13, fontWeight: '500'},
  progressWrap: {flex: 1, marginLeft: 16},
  progressBar: {height: 3, borderRadius: 2, backgroundColor: '#f0f0f0'},
  progressRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 4},
  progressText: {color: '#888', fontSize: 11},
  cancelText: {color: '#ef4444', fontSize: 11, fontWeight: '500'},
  loadBtn: {
    backgroundColor: '#111',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  loadBtnText: {color: '#fff', fontSize: 13, fontWeight: '600'},
  downloadBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    backgroundColor: '#f7f7f8',
  },
  downloadBtnText: {color: '#555', fontSize: 13},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  centerText: {color: '#888', marginTop: 12, fontSize: 14},
  emptyIcon: {
    fontSize: 18,
    marginBottom: 12,
    color: '#777',
    fontWeight: '600',
  },
  emptyTitle: {color: '#111', fontSize: 16, fontWeight: '600'},
  emptyHint: {
    color: '#888',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default ModelsScreen;
