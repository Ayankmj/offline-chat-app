import {AppState, AppStateStatus} from 'react-native';
import {makePersistable} from 'mobx-persist-store';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {computed, makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ContextParams, LlamaContext, initLlama} from 'llama.rn';

import {Model, ModelOrigin, ModelType} from '../types';
import {CompletionEngine, ApiCompletionParams, CompletionStreamData, CompletionResult} from '../utils/completionTypes';
import {getProjectionModelFiles, getRecommendedProjectionModelFile} from '../utils/modelMultimodal';
import {createErrorState, ErrorState} from '../utils/errors';
import {getDeviceCapabilityInfo, hasEnoughMemory, clearDeviceCache} from '../utils/deviceCapabilities';
import {getModelMemoryRequirement, formatMemoryBytes} from '../utils/memoryEstimator';
import {detectThinkingCapability} from '../utils/thinkingCapabilityDetection';
import {resolveUseMmap} from '../utils/memorySettings';
import {downloadManager} from '../services/DownloadManager';
import {migrateModelList, MODEL_LIST_VERSION, needsMigration} from '../utils/modelListVersioning';

// Local completion engine wrapping LlamaContext
class LocalCompletionEngine implements CompletionEngine {
  constructor(private context: LlamaContext) {}

  async completion(
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult> {
    // LlamaContext returns NativeCompletionResult — cast to our interface
    return this.context.completion(params as any, callback) as unknown as Promise<CompletionResult>;
  }

  async stopCompletion(): Promise<void> {
    await this.context.stopCompletion();
  }
}

interface ContextInitParams {
  n_ctx: number;
  n_batch: number;
  n_ubatch: number;
  n_threads: number;
  flash_attn_type?: 'auto' | 'on' | 'off';
  cache_type_k?: string;
  cache_type_v?: string;
  n_gpu_layers: number;
  use_mlock?: boolean;
  use_mmap?: 'true' | 'false' | 'smart';
  no_gpu_devices?: boolean;
  kv_unified?: boolean;
  n_parallel?: number;
  image_max_tokens?: number;
}

interface LoadedModelMetadata {
  ggufMetadata?: Model['ggufMetadata'];
  supportsMultimodal: boolean;
}

const DEFAULT_CONTEXT_PARAMS: ContextInitParams = {
  n_ctx: 4096,
  n_batch: 512,
  n_ubatch: 512,
  n_threads: 4,
  flash_attn_type: 'auto',
  n_gpu_layers: 99,
  use_mmap: 'smart',
  no_gpu_devices: false,
  kv_unified: true,
  n_parallel: 1,
  image_max_tokens: 512,
};

class ModelStore {
  models: Model[] = [];
  appState: AppStateStatus = AppState.currentState;
  useAutoRelease: boolean = true;
  isContextLoading: boolean = false;
  loadingModel: Model | undefined = undefined;
  contextInitParams: ContextInitParams = DEFAULT_CONTEXT_PARAMS;
  activeModelId: string | undefined = undefined;
  isMultimodalActive: boolean = false;
  activeProjectionModelId: string | undefined = undefined;
  context: LlamaContext | undefined = undefined;
  engine: CompletionEngine | undefined = undefined;
  lastUsedModelId: string | undefined = undefined;
  inferencing: boolean = false;
  isStreaming: boolean = false;
  modelLoadError: ErrorState | null = null;
  downloadError: ErrorState | null = null;

  // Memory calibration
  availableMemoryCeiling: number | undefined = undefined;
  largestSuccessfulLoad: number | undefined = undefined;
  memoryCeiling: {
    totalMemoryMB: number;
    availableMemoryMB: number;
    recommendedMaxModelMB: number;
    safeContextLength: number;
    gpuLayers: number;
    calibrationTimestamp: number;
  } | null = null;

  // Model list versioning
  modelListVersion: number = MODEL_LIST_VERSION;

  // Mutex to serialize model load/release operations
  private contextOperationMutex: Promise<void> = Promise.resolve();
  private pendingModelId: string | null = null;
  private activeCompletionPromise: Promise<any> | null = null;
  private appStateSubscription: {remove: () => void} | null = null;

  constructor() {
    makeAutoObservable(this, {
      activeModel: computed,
      contextId: computed,
    });
    makePersistable(this, {
      name: 'ModelStore',
      properties: [
        'models',
        'useAutoRelease',
        'contextInitParams',
        'lastUsedModelId',
        'modelListVersion',
      ],
      storage: AsyncStorage,
    }).then(() => {
      this.applyModelListMigrations();
    });

    this.setupAppStateListener();
    this.setupDownloadManager();
  }

  private setupDownloadManager() {
    downloadManager.setCallbacks({
      onProgress: (modelId, progress) => {
        const model = this.models.find(m => m.id === modelId);
        if (model) {
          runInAction(() => {
            model.progress = progress.progress;
          });
        }
      },
      onComplete: async modelId => {
        const model = this.models.find(m => m.id === modelId);
        if (model) {
          runInAction(() => {
            model.progress = 100;
            model.isDownloaded = true;
          });
        }
      },
      onError: (modelId, error) => {
        const model = this.models.find(m => m.id === modelId);
        if (model) {
          runInAction(() => {
            model.progress = 0;
            model.isDownloaded = false;
          });
        }
        runInAction(() => {
          this.downloadError = createErrorState(error, 'download', 'error', {modelId});
        });
      },
    });
  }

  private applyModelListMigrations() {
    if (!needsMigration(this.modelListVersion)) {
      return;
    }

    const oldVersion = this.modelListVersion;
    runInAction(() => {
      const result = migrateModelList(this.models, this.modelListVersion);
      this.models = result.models;
      this.modelListVersion = result.version;
    });
    console.log(`[ModelStore] Migrated model list from version ${oldVersion} to ${MODEL_LIST_VERSION}`);
  }

  get activeModel(): Model | undefined {
    return this.models.find(m => m.id === this.activeModelId);
  }

  get contextId(): string | undefined {
    if (this.context) {
      return String(this.context.id);
    }
    return undefined;
  }

  get availableModels(): Model[] {
    return this.models.filter(
      m =>
        (m.isLocal || m.origin === ModelOrigin.LOCAL || m.isDownloaded) &&
        m.modelType !== ModelType.PROJECTION,
    );
  }

  setMemoryCeiling(ceiling: {
    totalMemoryMB: number;
    availableMemoryMB: number;
    recommendedMaxModelMB: number;
    safeContextLength: number;
    gpuLayers: number;
    calibrationTimestamp: number;
  }) {
    runInAction(() => {
      this.memoryCeiling = ceiling;
      this.availableMemoryCeiling = ceiling.availableMemoryMB * 1024 * 1024;
    });
  }

  private setupAppStateListener() {
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  dispose() {
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (this.appState === 'active' && nextAppState === 'background') {
      if (this.useAutoRelease && this.activeModelId) {
        await this.releaseContext();
      }
    } else if (
      this.appState.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      if (this.lastUsedModelId) {
        const model = this.models.find(
          m => m.id === this.lastUsedModelId && m.isDownloaded,
        );
        if (model) {
          try {
            await this.initContext(model);
          } catch (e) {
            console.error('Failed to reload model on foreground:', e);
            runInAction(() => {
              this.modelLoadError = createErrorState(e, 'model', 'warning');
              this.lastUsedModelId = undefined;
            });
          }
        }
      }
    }
    runInAction(() => {
      this.appState = nextAppState;
    });
  };

  async getModelFullPath(model: Model): Promise<string> {
    if (model.isLocal || model.origin === ModelOrigin.LOCAL) {
      return model.fullPath || `${RNFS.DocumentDirectoryPath}/${model.filename}`;
    }

    const author = model.author || 'unknown';
    const repo = model.repo || 'unknown';
    return `${RNFS.DocumentDirectoryPath}/models/${model.origin === ModelOrigin.HF ? 'hf' : 'preset'}/${author}/${repo}/${model.filename}`;
  }

  async initContext(model: Model): Promise<LlamaContext | null> {
    this.syncProjectionModelsFor(model);
    this.pendingModelId = model.id;
    runInAction(() => {
      this.isContextLoading = true;
      this.loadingModel = model;
      this.modelLoadError = null;
    });

    try {
      const filePath = await this.getModelFullPath(model);
      if (!filePath) throw new Error('Model path is undefined');
      const exists = await RNFS.exists(filePath);
      if (!exists) {
        throw new Error(`Model file not found at ${filePath}`);
      }

      // Memory check before loading
      const fileStat = await RNFS.stat(filePath);
      const modelSize = fileStat.size;
      const memoryEstimate = getModelMemoryRequirement(
        modelSize,
        this.contextInitParams.n_ctx,
        model.ggufMetadata,
      );

      const hasMemory = await hasEnoughMemory(memoryEstimate.totalBytes);
      if (!hasMemory) {
        console.warn(
          `[ModelStore] Insufficient memory for ${model.name}. ` +
          `Need ~${formatMemoryBytes(memoryEstimate.totalBytes)}, ` +
          `available ~${formatMemoryBytes(memoryEstimate.totalBytes * 1.5)}`,
        );
      }

      const operationPromise = this.contextOperationMutex.then(async () => {
        if (this.pendingModelId !== model.id) {
          console.log(`Skipping outdated load for "${model.name}"`);
          return null;
        }

        if (this.activeModelId === model.id && this.context) {
          return this.context;
        }

        await this._releaseContextInternal();
        await new Promise(resolve => setTimeout(resolve, 100));

        // Resolve use_mmap with smart detection
        const resolvedUseMmap = await resolveUseMmap(
          this.contextInitParams.use_mmap ?? 'smart',
          filePath,
        );

        const effectiveParams = {
          ...this.getEffectiveContextInitParams(),
          use_mmap: resolvedUseMmap,
        };

        // Check projection model BEFORE creating the context to avoid native memory leak
        let projectionPath: string | null = null;
        const projectionModel = await this.getProjectionModelFor(model);
        if (projectionModel) {
          const projPath = await this.getModelFullPath(projectionModel);
          const projectionExists = await RNFS.exists(projPath);
          if (!projectionExists) {
            throw new Error(`Projection model file not found at ${projPath}`);
          }
          projectionPath = projPath;
        }

        const ctx = await initLlama(
          {
            model: filePath,
            ...effectiveParams,
            use_progress_callback: true,
          },
          (_progress: number) => {},
        );

        if (projectionModel && projectionPath) {
          await ctx.initMultimodal({
            path: projectionPath,
            image_max_tokens: Math.min(
              this.contextInitParams.image_max_tokens ?? 512,
              this.contextInitParams.n_ctx,
            ),
          });
        }

        const loadedMetadata = await this.extractLoadedModelMetadata(ctx, model);

        // Update stop tokens from model metadata
        await this.updateModelStopTokens(ctx, model);

        // Detect thinking capability
        const hasThinking = detectThinkingCapability(
          loadedMetadata.ggufMetadata?.architecture,
          model.name,
          model.chatTemplate?.chatTemplate,
        );

        runInAction(() => {
          this.context = ctx;
          this.engine = new LocalCompletionEngine(ctx);
          this.setActiveModel(model.id);
          const storeModel = this.models.find(m => m.id === model.id);
          if (storeModel) {
            storeModel.ggufMetadata = loadedMetadata.ggufMetadata;
            storeModel.supportsMultimodal = loadedMetadata.supportsMultimodal;
            storeModel.visionEnabled = loadedMetadata.supportsMultimodal;
            storeModel.supportsThinking = hasThinking;
          }
          this.isMultimodalActive = loadedMetadata.supportsMultimodal;
          this.pendingModelId = null;

          // Track successful load for memory calibration
          this.largestSuccessfulLoad = Math.max(
            this.largestSuccessfulLoad ?? 0,
            modelSize,
          );
        });

        // Clear device cache after successful load
        clearDeviceCache();

        return ctx;
      });

      this.contextOperationMutex = operationPromise
        .then(() => {})
        .catch((err) => {
          console.error('Context operation failed:', err);
        });

      return await operationPromise;
    } catch (error) {
      const errorState = createErrorState(
        error,
        'model',
        error instanceof Error && error.message.includes('memory') ? 'warning' : 'error',
        {modelId: model.id, modelName: model.name},
      );
      runInAction(() => {
        this.modelLoadError = errorState;
      });
      throw error;
    } finally {
      runInAction(() => {
        this.isContextLoading = false;
        this.loadingModel = undefined;
        if (this.pendingModelId === model.id) {
          this.pendingModelId = null;
        }
      });
    }
  }

  private async _releaseContextInternal(clearActiveModel: boolean = false) {
    if (!this.context) {
      if (this.engine || clearActiveModel) {
        if (this.engine) {
          try {
            await this.engine.stopCompletion();
          } catch {}
        }
        runInAction(() => {
          this.engine = undefined;
          if (clearActiveModel) this.activeModelId = undefined;
          this.isMultimodalActive = false;
          this.activeProjectionModelId = undefined;
        });
      }
      return;
    }

    try {
      if (this.inferencing || this.isStreaming || this.activeCompletionPromise) {
        try {
          await this.context.stopCompletion();
        } catch {}

        if (this.activeCompletionPromise) {
          await this.activeCompletionPromise.catch(() => {});
          this.activeCompletionPromise = null;
        }

        runInAction(() => {
          this.inferencing = false;
          this.isStreaming = false;
        });
      }

      await this.context.release();
    } catch (error) {
      console.error('Error during context release:', error);
    } finally {
      runInAction(() => {
        this.context = undefined;
        this.engine = undefined;
        this.isMultimodalActive = false;
        this.activeProjectionModelId = undefined;
        if (clearActiveModel) this.activeModelId = undefined;
      });
    }
  }

  async releaseContext(clearActiveModel: boolean = false) {
    const operationPromise = this.contextOperationMutex.then(async () => {
      return this._releaseContextInternal(clearActiveModel);
    });
    this.contextOperationMutex = operationPromise
      .then(() => {})
      .catch(() => {});
    return operationPromise;
  }

  setActiveModel(modelId: string) {
    runInAction(() => {
      this.activeModelId = modelId;
      this.lastUsedModelId = modelId;
      this.modelLoadError = null;
    });
  }

  selectModel = async (model: Model): Promise<void> => {
    await this.initContext(model);
  };

  syncProjectionModelsFor(model: Model) {
    if (
      model.origin !== ModelOrigin.HF ||
      !model.hfModel ||
      !model.supportsMultimodal
    ) {
      return;
    }

    const projectionFiles = getProjectionModelFiles(model.hfModel.siblings || []);
    if (projectionFiles.length === 0) {
      return;
    }

    const projectionIds: string[] = [];

    projectionFiles.forEach(file => {
      const projectionId = `${model.hfModel!.id}/${file.rfilename}`;
      projectionIds.push(projectionId);

      const existing = this.models.find(m => m.id === projectionId);
      if (existing) {
        return;
      }

      const projectionModel: Model = {
        ...model,
        id: projectionId,
        name: file.rfilename,
        size: file.size || 0,
        downloadUrl: `https://huggingface.co/${model.hfModel!.id}/resolve/main/${file.rfilename}`,
        filename: file.rfilename,
        progress: 0,
        isDownloaded: false,
        fullPath: undefined,
        modelType: ModelType.PROJECTION,
        supportsMultimodal: false,
        visionEnabled: false,
        compatibleProjectionModels: undefined,
        defaultProjectionModel: undefined,
        hfModelFile: file,
      };

      runInAction(() => {
        this.models.push(projectionModel);
      });
    });

    const defaultProjectionFile = getRecommendedProjectionModelFile(
      model.filename,
      projectionFiles,
    );
    const storeModel = this.models.find(m => m.id === model.id);
    if (storeModel) {
      runInAction(() => {
        storeModel.compatibleProjectionModels = projectionIds;
        if (defaultProjectionFile) {
          storeModel.defaultProjectionModel = `${model.hfModel!.id}/${defaultProjectionFile.rfilename}`;
        }
      });
    }
  }

  private async getProjectionModelFor(model: Model): Promise<Model | null> {
    if (
      !model.supportsMultimodal ||
      !model.visionEnabled ||
      !model.defaultProjectionModel
    ) {
      return null;
    }

    this.syncProjectionModelsFor(model);
    const projectionModel =
      this.models.find(m => m.id === model.defaultProjectionModel) || null;
    return projectionModel?.isDownloaded ? projectionModel : null;
  }

  private getEffectiveContextInitParams(): Omit<ContextParams, 'model'> & {
    image_max_tokens?: number;
  } {
    const effectiveContext = this.contextInitParams.n_ctx;
    const effectiveBatch = Math.min(
      this.contextInitParams.n_batch,
      effectiveContext,
    );
    const effectiveUBatch = Math.min(
      this.contextInitParams.n_ubatch,
      effectiveBatch,
    );

    return {
      n_ctx: effectiveContext,
      n_batch: effectiveBatch,
      n_ubatch: effectiveUBatch,
      n_threads: this.contextInitParams.n_threads,
      flash_attn_type: this.contextInitParams.flash_attn_type ?? 'auto',
      n_gpu_layers: this.contextInitParams.n_gpu_layers ?? 99,
      use_mlock: this.contextInitParams.use_mlock,
      use_mmap: (() => {
        const val = this.contextInitParams.use_mmap;
        if (val === 'true') return true;
        if (val === 'false') return false;
        if (val === 'smart' || val === undefined) return undefined;
        return undefined;
      })(),
      kv_unified: this.contextInitParams.kv_unified ?? true,
      n_parallel: this.contextInitParams.n_parallel ?? 1,
      image_max_tokens: this.contextInitParams.image_max_tokens,
    };
  }

  private async updateModelStopTokens(ctx: LlamaContext, model: Model) {
    const storeModel = this.models.find(m => m.id === model.id);
    if (!storeModel) return;

    const stopTokens: string[] = [];

    try {
      const eos_token_id = Number(
        (ctx.model as any)?.metadata?.['tokenizer.ggml.eos_token_id'],
      );
      if (!isNaN(eos_token_id)) {
        const detokenized = await ctx.detokenize([eos_token_id]);
        if (detokenized) stopTokens.push(detokenized);
      }

      const template = storeModel.chatTemplate?.chatTemplate;
      if (template) {
        const stops = ['<|end|>', '<|eot_id|>', '</s>', '<|im_end|>'];
        stopTokens.push(...stops.filter(s => template.includes(s)));
      }

      if (stopTokens.length > 0) {
        runInAction(() => {
          storeModel.stopWords = Array.from(
            new Set([...(storeModel.stopWords || []), ...stopTokens]),
          ).filter(Boolean);
        });
      }
    } catch (error) {
      console.error('Error updating stop tokens:', error);
    }
  }

  private async extractLoadedModelMetadata(
    ctx: LlamaContext,
    model: Model,
  ): Promise<LoadedModelMetadata> {
    const metadata = ((ctx.model as any)?.metadata || {}) as Record<string, unknown>;
    const architecture = String(metadata['general.architecture'] || metadata['general.name'] || '');
    const architectureKey = architecture || 'llama';

    const readNumber = (...keys: string[]): number | undefined => {
      for (const key of keys) {
        const raw = metadata[key];
        if (raw == null) continue;
        const num = Number(raw);
        if (!Number.isNaN(num) && Number.isFinite(num)) {
          return num;
        }
      }
      return undefined;
    };

    const ggufMetadata = architecture
      ? {
          architecture,
          n_layers: readNumber(
            `${architectureKey}.block_count`,
            `${architectureKey}.layer_count`,
          ) || 0,
          n_embd: readNumber(
            `${architectureKey}.embedding_length`,
            `${architectureKey}.hidden_size`,
          ) || 0,
          n_head: readNumber(
            `${architectureKey}.attention.head_count`,
            `${architectureKey}.attention.head_count_kv`,
          ) || 0,
          n_head_kv: readNumber(`${architectureKey}.attention.head_count_kv`) ?? 0,
          n_vocab: readNumber('tokenizer.ggml.tokens', 'tokenizer.ggml.vocab_size') || 0,
          n_embd_head_k: readNumber(`${architectureKey}.attention.key_length`) || 0,
          n_embd_head_v: readNumber(`${architectureKey}.attention.value_length`) || 0,
          sliding_window: readNumber(`${architectureKey}.attention.sliding_window`),
          context_length: readNumber(
            `${architectureKey}.context_length`,
            `${architectureKey}.rope.dimension_count`,
          ),
        }
      : undefined;

    const textMetadata = Object.entries(metadata)
      .map(([key, value]) => `${key}:${String(value).toLowerCase()}`)
      .join('\n');
    const metadataSignals = [
      'vision',
      'image',
      'mmproj',
      'projector',
      'clip',
      'encoder',
      'llava',
      'idefics',
      'paligemma',
      'cogvlm',
      'fuyu',
      'florence',
    ];

    let runtimeMultimodalEnabled = false;
    try {
      runtimeMultimodalEnabled = await ctx.isMultimodalEnabled();
    } catch {}

    const supportsMultimodal = Boolean(
      runtimeMultimodalEnabled ||
      model.supportsMultimodal ||
      model.visionEnabled ||
      metadataSignals.some(signal => textMetadata.includes(signal)),
    );

    return {
      ggufMetadata,
      supportsMultimodal,
    };
  }

  setInferencing(value: boolean) {
    runInAction(() => { this.inferencing = value; });
  }

  setIsStreaming(value: boolean) {
    runInAction(() => { this.isStreaming = value; });
  }

  registerCompletionPromise(promise: Promise<any>) {
    runInAction(() => { this.activeCompletionPromise = promise; });
  }

  clearCompletionPromise() {
    runInAction(() => { this.activeCompletionPromise = null; });
  }

  updateUseAutoRelease(value: boolean) {
    runInAction(() => { this.useAutoRelease = value; });
  }

  setNContext(value: number) {
    runInAction(() => { this.contextInitParams.n_ctx = value; });
  }

  setNGPULayers(value: number) {
    runInAction(() => { this.contextInitParams.n_gpu_layers = value; });
  }

  setFlashAttnType(value: 'auto' | 'on' | 'off') {
    runInAction(() => { this.contextInitParams.flash_attn_type = value; });
  }

  setImageMaxTokens(value: number) {
    runInAction(() => { this.contextInitParams.image_max_tokens = value; });
  }

  get isMultimodalEnabled(): boolean {
    return this.isMultimodalActive;
  }
}

export const modelStore = new ModelStore();
