# Offline Chat AI

A native Android offline chat application powered by on-device LLMs. Built by combining the best architecture patterns from **LLM Hub** and **PocketPal AI**.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React Native 0.76 (no Expo) |
| **State Management** | MobX + mobx-persist-store |
| **LLM Runtime** | llama.rn (llama.cpp bindings) |
| **Navigation** | React Navigation (Drawer + Stack) |
| **UI** | React Native Paper |
| **Database** | SQLite (via WatermelonDB or custom) |
| **Model Source** | HuggingFace API |
| **File System** | @dr.pogodin/react-native-fs |

## Architecture

```
src/
├── api/                    # HuggingFace API client
│   └── hf.ts               # fetchModels, fetchGGUFSpecs, download
├── components/             # React Native components
│   ├── Chat/               # ChatInput, MessageBubble
│   ├── Models/             # ModelCard, HFModelSearch
│   ├── Common/             # Shared UI components
│   └── SidebarContent.tsx  # Drawer navigation
├── hooks/                  # Custom React hooks
│   └── useChatSession.ts   # Chat orchestration (send, stream, stop)
├── screens/                # App screens
│   ├── ChatScreen.tsx      # Main chat interface
│   ├── ModelsScreen.tsx    # Browse/download/load models
│   └── SettingsScreen.tsx  # Model params, HF token, clear chats
├── services/               # Background services
│   └── DownloadManager.ts  # Model download with progress
├── store/                  # MobX state stores
│   ├── ModelStore.ts       # Model lifecycle, context, engine
│   ├── ChatSessionStore.ts # Sessions, messages, streaming
│   └── index.ts
├── types/                  # TypeScript type definitions
│   ├── index.ts            # Model, HF types
│   └── message.ts          # Message types
├── utils/                  # Utilities
│   ├── completionTypes.ts  # Completion engine interface
│   └── index.ts            # Helpers (hfAsModel, deepMerge, etc.)
├── config/                 # App configuration
└── App.tsx                 # Root component
```

## Key Design Decisions (from LLM Hub + PocketPal)

### From PocketPal AI
1. **CompletionEngine interface** — Abstract `completion()` + `stopCompletion()` for swapable backends
2. **MobX stores** — Reactive state with `makePersistable` for AsyncStorage
3. **Streaming throttle** — 150ms minimum between UI updates to prevent re-render spam
4. **Mutex serialization** — Prevents race conditions during model switching
5. **Last-one-wins** — Rapid model taps cancel previous loads
6. **Auto-release** — Free model memory when app backgrounds, reload on foreground
7. **Message editing** — Edit user messages and regenerate from that point
8. **Draft autosave** — Never lose typed input when switching sessions
9. **Thinking content separation** — `reasoning_content` displayed in collapsible block
10. **Stop token auto-detection** — Extract from model metadata + chat template

### From LLM Hub
1. **Multi-backend routing** — `UnifiedInferenceService` pattern for future expansion (GGUF, ONNX, LiteRT)
2. **NPU support preparation** — Device capability detection for Hexagon/HTP
3. **RAM-based context capping** — Scale nCtx based on device RAM (8192-131072)
4. **Web search integration** — DuckDuckGo search injected into prompt
5. **RAG memory** — Embedding-based retrieval for persistent knowledge
6. **RAM-based context capping** — Scale nCtx based on device RAM (8192-131072)
7. **Web search integration** — DuckDuckGo search injected into prompt
8. **RAG memory** — Embedding-based retrieval for persistent knowledge
9. **Material 3 design** — Tonal elevation, adaptive colors
10. **Model loading indicator** — Breathing animation with progress

## Setup

```bash
cd "D:\android app\offline-chat-app"
npm install
cd android
./gradlew assembleDebug
./gradlew installDebug
```

## Model Loading Flow

```
1. User selects model from ModelsScreen
2. ModelStore.selectModel(model) → initContext(model)
3. Phase 1 (pre-flight): Check memory, resolve multimodal config
4. Phase 2 (mutex): Release old context → 100ms delay → initLlama()
5. Create LocalCompletionEngine wrapping LlamaContext
6. Auto-detect stop tokens from model metadata
7. Set as active model → return to ChatScreen
```

## Chat Flow

```
1. User types message → ChatInput → handleSendPress()
2. Validate engine exists, create user message
3. Prepare completion: convert messages to llama.rn format
4. engine.completion(params, callback) → streams tokens
5. Streaming callback → chatSessionStore.updateMessageStreaming() (throttled 150ms)
6. Completion finishes → save timings, token counts to DB
7. Error handling → keep partial content or clean up empty message
```

## Features Implemented

- [x] Offline chat with GGUF models via llama.rn
- [x] HuggingFace model search and download
- [x] Model loading/unloading with mutex protection
- [x] Streaming responses with 150ms throttle
- [x] Thinking/reasoning content display (collapsible block)
- [x] Chat sessions with grouped history (Today, Yesterday, This Week)
- [x] Message editing and regeneration
- [x] Draft autosave per session
- [x] Auto-release model on background
- [x] Performance metrics (tok/s, TTFT) per message
- [x] Settings: context size, GPU layers, flash attention, temperature, max tokens
- [x] HuggingFace token for gated models
- [x] Drawer navigation with branded sidebar
- [x] Production-ready dark theme (MD3)
- [x] Animated empty state with feature badges
- [x] Model loading indicator with breathing animation
- [x] Capability chips (Vision, Think, GPU)
- [x] Copy message button
- [x] Typing indicator animation
- [x] Send button with scale animation
- [x] Tabbed Models screen (Downloaded / Browse)
- [x] Slider controls for model params
- [x] Confirmation dialogs for destructive actions

## Features to Add (from source apps)

- [ ] Multimodal (vision) with projection models
- [ ] TTS auto-readout during streaming
- [ ] RAG global memory with embeddings
- [ ] Web search integration
- [ ] Remote model support (OpenAI servers)
- [ ] Image generation (Stable Diffusion)
- [ ] Code preview sandbox
- [ ] SQLite persistence layer
- [ ] Model import from file picker
- [ ] NPU acceleration (Hexagon/HTP)
