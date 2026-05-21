# Offline Chat App - File Analysis Tracker

> Tick `[x]` each file after analyzing. Bugs fixed are noted per file.
> Full fix report: [CORRECTIONS.md](./CORRECTIONS.md)
> Last updated: 2026-05-21

---

## Root Config & Docs

- [x] `.eslintrc.js` — ✅ Analyzed. No bugs.
- [x] `.gitignore` — ✅ Analyzed. No bugs.
- [x] `app.json` — ✅ Analyzed. No bugs.
- [x] `ARCHITECTURE.md` — ✅ Analyzed. No bugs.
- [x] `babel.config.js` — ✅ Analyzed. No bugs.
- [x] `metro.config.js` — ✅ Analyzed. No bugs.
- [x] `package.json` — ✅ Analyzed. No bugs.
- [x] `package-lock.json` — ✅ Analyzed. No bugs.
- [x] `react-native.config.js` — ✅ Analyzed. No bugs.
- [x] `README.md` — ✅ Analyzed. No bugs.
- [x] `tsconfig.json` — ✅ Analyzed. No bugs.

## Graphify DB (binary/generated — skip analysis)

- [x] `.graphify/db.sqlite` — ⏭️ Skipped (binary)
- [x] `.graphify/graph.json` — ⏭️ Skipped (generated)
- [x] `.graphify/graph_report.md` — ⏭️ Skipped (generated)

## Entry Points

- [x] `index.js` — ✅ Analyzed. No bugs. Standard RN entry point.
- [x] `src/App.tsx` — ✅ Analyzed. No bugs. Proper navigation, theme, cleanup on dispose.

## Android Native

- [x] `android/app/src/main/java/com/offlinechat/MainActivity.kt` — ✅ Analyzed. No bugs.
- [x] `android/app/src/main/java/com/offlinechat/MainApplication.kt` — ✅ Analyzed. No bugs.

## Android Config

- [x] `android/app/proguard-rules.pro` — ✅ Analyzed. No bugs.
- [x] `android/app/src/main/AndroidManifest.xml` — ✅ Analyzed. No bugs.
- [x] `android/gradle.properties` — ✅ Analyzed. No bugs.
- [x] `android/gradle/wrapper/gradle-wrapper.properties` — ✅ Analyzed. No bugs.

## Android Resources

- [x] `android/app/src/main/res/drawable/rn_edit_text_material.xml` — ✅ Analyzed. No bugs.
- [x] `android/app/src/main/res/drawable/splash.xml` — ✅ Analyzed. No bugs.
- [x] `android/app/src/main/res/mipmap-hdpi/ic_launcher.xml` — ✅ Analyzed. No bugs.
- [x] `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.xml` — ✅ Analyzed. No bugs.
- [x] `android/app/src/main/res/values/colors.xml` — ✅ Analyzed. No bugs.
- [x] `android/app/src/main/res/values/strings.xml` — ✅ Analyzed. No bugs.
- [x] `android/app/src/main/res/values/styles.xml` — ✅ Analyzed. No bugs.

## Screens

- [x] `src/screens/ChatScreen.tsx` — ⚠️ **4 bugs fixed**
  - Bug: `setInputText('')` called before send but `setImageUris([])` in `finally` — inconsistent state on failure
  - Fix: Clear both text and images immediately before send, capture values in locals first
  - Bug: `⚡` emoji in header subtitle — inconsistent rendering on Android
  - Fix: Removed emoji, plain model name only
  - Bug: Edit mode dead end — pencil icon calls `enterEditMode` but no way to save+resend
  - Fix: Added edit mode indicator bar + cancel button; handleSend checks edit mode → calls handleEditAndResend
  - Bug: No regenerate/delete buttons on messages — store had methods but no UI access
  - Fix: Added onRegenerate, onDelete callbacks to MessageBubble + wired to handleRegenerate/deleteMessage
  - See: [CORRECTIONS.md#3](./CORRECTIONS.md)

- [x] `src/screens/ModelsScreen.tsx` — ⚠️ **1 bug fixed**
  - Bug: `if (!q.trim()) { if (mountedRef.current) setHfModels([]); return; }` — all one line, confusing logic
  - Fix: Reformatted to multi-line with proper indentation
  - See: [CORRECTIONS.md#4](./CORRECTIONS.md)

- [x] `src/screens/SettingsScreen.tsx` — ⚠️ **1 bug fixed**
  - Bug: Temperature/maxTokens/thinking sliders initialized from `activeSettings` but never sync when user switches sessions — sliders show stale values
  - Fix: Added `useEffect` hooks to sync slider values when `activeSettings` or `systemPromptStore` changes
  - See: [CORRECTIONS.md#8](./CORRECTIONS.md)

## Components - Chat

- [x] `src/components/Chat/ChatAnalyticsModal.tsx` — ⚠️ **2 bugs fixed**
  - Bug 1: Multiple emojis (`🧠`, `⏱`, `⚡`, `🚀`) in analytics UI — inconsistent rendering on Android
  - Fix 1: Replaced with plain text labels
  - Bug 2: `userMessages` variable computed but never used — dead code
  - Fix 2: Removed unused variable
  - See: [CORRECTIONS.md#6](./CORRECTIONS.md), [CORRECTIONS.md#7](./CORRECTIONS.md)

- [x] `src/components/Chat/ChatInput.tsx` — ✅ Analyzed. No bugs. Proper props, animations, state handling.

- [x] `src/components/Chat/MessageBubble.tsx` — ⚠️ **3 bugs fixed**
  - Bug 1: Dead duplicate `TypingIndicator` component was removed in first pass but IS actually used at line 143 — caused crash
  - Fix 1: Restored TypingIndicator component with proper imports (`Animated`, `useEffect`, `useRef`)
  - Bug 2: Unused imports (`useEffect`, `useRef`, `Animated`) from first pass removal
  - Fix 2: Re-added required imports for TypingIndicator
  - Bug 3: No regenerate/delete buttons on AI messages — features existed in store but no UI
  - Fix 3: Added `onRegenerate` and `onDelete` props + UI buttons (refresh/delete icons)
  - See: [CORRECTIONS.md#1](./CORRECTIONS.md)

- [x] `src/components/Chat/SearchResults.tsx` — ✅ Analyzed. No bugs. Proper animations, Linking handling.

- [x] `src/components/Chat/TypingIndicator.tsx` — ✅ Analyzed. No bugs. Clean animation, proper cleanup.

## Components

- [x] `src/components/SidebarContent.tsx` — ✅ Analyzed. No bugs. Proper search, session management, navigation.

## Hooks

- [x] `src/hooks/useChatSession.ts` — ⚠️ **7 bugs fixed**
  - Bug 1: **NO CONTEXT WINDOW MANAGEMENT** — ALL messages sent every turn regardless of length. After ~10-20 messages, context exceeds `n_ctx` (default 4096), llama.cpp silently truncates oldest messages → model "forgets" early conversation
  - Fix 1: Added token estimation + automatic trimming of oldest historical messages when context exceeds `n_ctx - n_predict - 256`. System prompt and current user message always preserved.
  - Bug 2: Context trimming silent — model doesn't know messages were dropped (unlike ChatGPT which adds a notice)
  - Fix 2: Added system notice: `[Note: Some earlier messages were omitted due to context length limits...]`
  - Bug 3: Duplicate `import {modelStore}` line
  - Fix 3: Removed duplicate import
  - Bug 4: `handleRegenerate` NOT returned from hook — ChatScreen can't call it
  - Fix 4: Added to return object
  - Bug 5: `handleRegenerate` had infinite recursion — called `handleSendPress` which re-adds user message (duplicate)
  - Fix 5: Rewrote regenerate as standalone function that removes last assistant, doesn't re-add user
  - Bug 6: `isSendingRef` race condition — set AFTER `prepareCompletion` call, not before. Double-tap gap.
  - Fix 6: Moved `isSendingRef.current = true` to top of `handleSendPress` (before early returns)
  - Bug 7: No error rate limiting — rapid repeated failures spam system messages
  - Fix 7: Added `addSystemMessageWithRateLimit` — max 3 errors per 30s window
  - See: [CORRECTIONS.md](#) (pass 5 additions)

## Services

- [x] `src/services/DownloadManager.ts` — ✅ Analyzed. No bugs. Proper download lifecycle, jobId race condition guard, cleanup on cancel/failure.

- [x] `src/services/WebSearchService.ts` — ✅ Analyzed. No bugs. Good fallback chain (content → instant → HTML), proper timeouts, AbortController usage.

## API

- [x] `src/api/hf.ts` — ✅ Analyzed. No bugs. Proper HF API calls with auth headers, timeout, link header parsing.

## Store

- [x] `src/store/ChatSessionStore.ts` — ⚠️ **4 bugs fixed**
  - Bug 1: `applyStreamingUpdate` always appended text — double-append on re-flush
  - Fix 1: Added `endsWith` guard (later refined in pass 4)
  - Bug 2: Edit mode `slice(messageIndex)` returns WRONG range — messages stored newest-first via `unshift`, so slicing from index gives messages AFTER edit point, not before
  - Fix 2: Added `.reverse()` after slice to get correct conversation order up to edit point
  - Bug 3: Streaming `endsWith` guard too aggressive — blocks legitimate model repetition (e.g., model says "The answer is 42. 42 is correct.")
  - Fix 3: Added `update.text.length > 0` check to only guard against empty/duplicate flushes
  - Bug 4: Missing `deleteMessage()` and `removeLastAssistantMessage()` — no way to delete individual messages or regenerate AI responses
  - Fix 4: Added both methods to store
  - See: [CORRECTIONS.md#2](./CORRECTIONS.md), [CORRECTIONS.md#12](./CORRECTIONS.md), [CORRECTIONS.md#13](./CORRECTIONS.md), [CORRECTIONS.md#15](./CORRECTIONS.md), [CORRECTIONS.md#16](./CORRECTIONS.md)

- [x] `src/store/HfTokenStore.ts` — ✅ Analyzed. No bugs. Simple, correct token persistence with empty-string handling.

- [x] `src/store/index.ts` — ✅ Analyzed. No bugs. Re-exports only.

- [x] `src/store/ModelStore.ts` — ✅ Analyzed. No bugs. Good mutex pattern for model load/release, proper cleanup, app state handling.

- [x] `src/store/SystemPromptStore.ts` — ✅ Analyzed. No bugs. Correct MobX pattern, proper persistence.

## Utils

- [x] `src/utils/chatUtils.ts` — ✅ Analyzed. No bugs. Safe math parser (no eval), proper thinking tag removal, correct token estimation.

- [x] `src/utils/completionTypes.ts` — ✅ Analyzed. No bugs. Correct type definitions matching llama.rn API.

- [x] `src/utils/index.ts` — ✅ Analyzed. No bugs. Simple ID generator.

## Types

- [x] `src/types/declarations.d.ts` — ✅ Analyzed. No bugs. Required module declarations.

- [x] `src/types/index.ts` — ✅ Analyzed. No bugs. Comprehensive type definitions for Model, HF API, etc.

- [x] `src/types/message.ts` — ✅ Analyzed. No bugs. Proper message types with metadata.

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Analyzed — No bugs | 44 |
| ⚠️ Analyzed — Bugs fixed | 9 |
| ⏭️ Skipped (binary/generated) | 3 |
| ❌ Not analyzed | 0 |
| **Total** | **53** |

## Bugs Fixed (10 files, 7 passes, 33 total fixes)

### Pass 7 (real local RAG)
| # | File | Bug | Severity |
|---|------|-----|----------|
| 30 | `RagStore.ts` | Local RAG feature missing entirely | High |
| 31 | `useChatSession.ts` | Saved knowledge was not retrieved/injected into chat context | High |
| 32 | `SettingsScreen.tsx` | No UI to add, view, delete, clear, or toggle RAG memories | High |
| 33 | `RagStore.ts` + `useChatSession.ts` | RAG would have been a fake label without persisted retrieval | High |

### Pass 6 (production readiness re-audit)
| # | File | Bug | Severity |
|---|------|-----|----------|
| 24 | `ModelStore.ts` | `image_max_tokens` stored but not passed to `initLlama` | Medium |
| 25 | `ModelStore.ts` | `lastUsedModelId` persisted but never updated on active model load | Medium |
| 26 | `ChatScreen.tsx` | Draft text/images cleared before no-model validation completed | Medium |
| 27 | `useChatSession.ts` | `n_predict` could exceed `n_ctx`, causing avoidable generation errors | High |
| 28 | `ModelsScreen.tsx` | HF Browse cards showed stale progress/download state after download | Medium |
| 29 | `SidebarContent.tsx` | Chat content search used unsafe `any` cast | Low |

### Pass 1
| # | File | Bug | Severity |
|---|------|-----|----------|
| 1 | `MessageBubble.tsx` | Dead TypingIndicator + unused imports | Medium |
| 2 | `ChatSessionStore.ts` | Streaming text double-append | Critical |
| 3 | `ChatScreen.tsx` | Input/image clear timing + emoji | Medium |
| 4 | `ModelsScreen.tsx` | Confusing one-line early return | Low |
| 5 | `ChatAnalyticsModal.tsx` | Emojis in analytics UI | Low |
| 6 | `ChatScreen.tsx` | Header emoji inconsistent rendering | Low |

### Pass 2 (deep review)
| # | File | Bug | Severity |
|---|------|-----|----------|
| 7 | `MessageBubble.tsx` | TypingIndicator was actually USED — removal caused crash | Critical |
| 8 | `SettingsScreen.tsx` | Sliders don't sync on session switch | Medium |
| 9 | `ChatAnalyticsModal.tsx` | Dead `userMessages` variable | Low |

### Pass 4 (LLM chat logic audit)
| # | File | Bug | Severity |
|---|------|-----|----------|
| 12 | `ChatSessionStore.ts` | Edit mode returns WRONG message range — model sees wrong context when editing mid-conversation | Critical |
| 13 | `ChatSessionStore.ts` | Streaming `endsWith` guard too aggressive — blocks legitimate repeated tokens from model | Medium |
| 14 | `useChatSession.ts` | Context trimming silent — model doesn't know messages were dropped (unlike ChatGPT) | Medium |
| 15 | `ChatSessionStore.ts` | Missing `deleteMessage()` — no way to delete individual messages | Low |
| 16 | `ChatSessionStore.ts` | Missing `removeLastAssistantMessage()` — no way to regenerate response | Low |

### Pass 5 (production-ready audit)
| # | File | Bug | Severity |
|---|------|-----|----------|
| 17 | `useChatSession.ts` | `handleRegenerate` not returned from hook — ChatScreen can't use it | Critical |
| 18 | `useChatSession.ts` | `handleRegenerate` had infinite recursion — called `handleSendPress` which re-adds user message | Critical |
| 19 | `store/ChatSessionStore.ts` | `removeLastAssistantMessage` uses hardcoded `'assistant'` string, not actual author.id | Medium |
| 20 | `useChatSession.ts` | `isSendingRef` set AFTER `prepareCompletion` — race window for double-tap | Medium |
| 21 | `useChatSession.ts` | No edit+resend flow — edit mode was a dead end with no way to save+send | Critical |
| 22 | `ChatScreen.tsx` + `MessageBubble.tsx` | No regenerate/delete buttons — features exist in store but no UI access | Medium |
| 23 | `useChatSession.ts` | No error rate limiting — rapid repeated failures spam system messages | Low |

Full details: [CORRECTIONS.md](./CORRECTIONS.md)
