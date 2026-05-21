# Architecture Blueprint — Offline Chat AI

## Design Philosophy

Combine **PocketPal AI's** clean React Native + MobX architecture with **LLM Hub's** multi-backend inference routing, NPU support, and feature-rich UX — targeting **native Android** (React Native CLI, no Expo).

---

## 1. Core Architecture Layers

```
PRESENTATION
  React Native Components
  ChatScreen, ModelsScreen, SettingsScreen, Sidebar

STATE MANAGEMENT (MobX)
  ModelStore — Model lifecycle, context, engine
  ChatSessionStore — Sessions, messages, streaming
  UIStore — Theme, language, snackbar
  HFStore — Token, search results, bookmarks

COMPLETION ENGINE
  Abstract CompletionEngine interface
  - LocalCompletionEngine (llama.rn wrapper)
  - OpenAICompletionEngine (SSE, future)
  Streaming: token → content → reasoning_content
  Throttle: 150ms between UI updates

MODEL MANAGEMENT
  - HuggingFace API (search, download, auth)
  - DownloadManager (progress, resume, cancel)
  - GGUF Metadata Extraction (post-download)
  - Projection Model Auto-Download (vision)

HARDWARE ABSTRACTION
  - GPU Detection (Vulkan)
  - NPU Detection (Hexagon/HTP, future)
  - RAM Estimation & Context Capping
  - Thread Count (CPU core detection)

STORAGE
  - SQLite (chats, messages, sessions)
  - File System (model files)
  - AsyncStorage (settings, persisted stores)
  - RAG Vector Store (embeddings, future)
```

---

## 2. Model Loading — Phase-Based with Mutex

**Problem**: Rapid model switching causes memory leaks and deadlocks.

**Solution** (from PocketPal AI):

```
initContext(model)
├── Phase 1: Pre-flight (OUTSIDE mutex)
│   ├── Set pendingModelId = model.id (last-one-wins)
│   ├── Set loading UI state
│   ├── Resolve multimodal config
│   ├── Check memory → show alert if needed
│   └── Check if superseded by newer request
│
└── Phase 2: Execute (INSIDE mutex)
    ├── Final check: pendingModelId still matches
    ├── Release old context (stop → await → release)
    ├── 100ms delay for native cleanup
    └── initLlama(filePath, params)
        ├── Create LocalCompletionEngine(ctx)
        ├── Auto-detect stop tokens
        ├── Detect thinking capability
        └── Set activeModelId
```

**Key Safety Patterns**:
- **Mutex serialization**: `contextOperationMutex` prevents concurrent loads
- **Stop-Await-Release**: Signal stop → await promise → release context
- **Last-one-wins**: `pendingModelId` tracks intent, superseded loads return null

---

## 3. Chat Session — Streaming with Throttle

```
handleSendPress(message)
├── Validate engine + context exist
├── Create user message → add to store
├── Prepare completion (convert to llama.rn format)
├── engine.completion(params, callback)
│   └── Callback fires per token:
│       ├── Capture time-to-first-token
│       ├── Throttle UI updates to 150ms
│       ├── Update message.text (cumulative)
│       └── Update metadata.partialCompletionResult
├── Await completion → save final result
│   ├── metadata.timings (tok/s, TTFT)
│   └── metadata.completionResult
└── Error handling:
    ├── Keep partial content if streamed
    └── Delete empty message if nothing streamed
```

---

## 4. Multi-Backend Inference (LLM Hub Pattern)

**Future expansion** — currently only llama.rn:

```
UnifiedInferenceService
├── Route by model format:
│   ├── "gguf"    → NexaInferenceService (NPU/GPU/CPU)
│   ├── "onnx"    → OnnxInferenceService
│   └── default   → MediaPipeInferenceService
├── Backend fallback: GPU → CPU
├── NPU probe before loading
└── Context capping by RAM:
    ├── VLM: max 8192
    ├── 24GB: 131072
    ├── 16GB: 65536
    ├── 12GB: 32768
    ├── 8GB:  16384
    └── <6GB: 8192
```

---

## 5. HuggingFace Integration

```
HFModelSearch
├── fetchModels({search, filter: 'gguf', limit, authToken})
├── fetchModelFilesDetails(modelId)
├── fetchGGUFSpecs(modelId)
└── fetchModelInfo(repoId)

Download Flow:
├── hfAsModel(hfModel, modelFile) → Model object
├── downloadManager.startDownload(model, path, token)
└── Post-download:
    ├── loadLlamaModelInfo(filePath)
    └── Auto-download projection model (if vision)
```

---

## 6. State Management — MobX Stores

### ModelStore
- models, context, engine, activeModelId
- isContextLoading, inferencing, isStreaming
- Persisted: useAutoRelease, contextInitParams, lastUsedModelId

### ChatSessionStore
- sessions, activeSessionId, isEditMode, isGenerating
- sessionDrafts (ephemeral autosave)
- Persisted: newChatCompletionSettings
- Computed: currentSessionMessages, groupedSessions

---

## 7. UI/UX Patterns

### From PocketPal AI
- Drawer navigation with grouped chat history
- Bottom sheets for model settings
- Message editing + regeneration
- Performance metrics per message (tok/s, TTFT)
- Thinking content in collapsible block
- Code blocks with syntax highlighting

### From LLM Hub
- Model loading indicator with breathing animation
- Capability chips (Vision, GPU, NPU, RAG)
- Settings sheet for model selection + params
- Web search toggle (premium)
- Banner ad above message input

---

## 8. Model Storage Paths

```
DocumentDirectoryPath/
├── models/
│   ├── preset/{author}/{repo}/{filename}.gguf
│   └── hf/{author}/{repo}/{filename}.gguf
└── {local_filename}.gguf  (imported)
```

Backwards compatibility: check old paths first.

---

## 9. Completion Parameters

```typescript
interface CompletionParams {
  n_predict: 2048;
  temperature: 0.7;
  top_k: 40;
  top_p: 0.9;
  min_p: 0.05;
  penalty_repeat: 1.0;
  enable_thinking: boolean;
  stop: string[];  // auto-detected from model
  messages: ChatMessage[];
}
```

---

## 10. Roadmap — What to Build Next

**Phase 1 (Core)**:
- [x] React Native project structure
- [x] MobX stores (ModelStore, ChatSessionStore)
- [x] useChatSession hook
- [x] ChatScreen, ModelsScreen, SettingsScreen
- [x] HuggingFace API integration
- [x] DownloadManager
- [ ] SQLite persistence layer
- [ ] Android native build (gradle, manifests)

**Phase 2 (Features)**:
- [ ] Multimodal vision (projection models)
- [ ] TTS streaming during generation
- [ ] Message editing + regeneration
- [ ] Code block syntax highlighting
- [ ] Model import from file picker

**Phase 3 (Advanced)**:
- [ ] RAG global memory with embeddings
- [ ] Web search integration
- [ ] Remote model support (OpenAI servers)
- [ ] NPU acceleration (Hexagon/HTP)
