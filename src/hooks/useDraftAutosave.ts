import {useEffect, useRef, useCallback} from 'react';
import {draftStore} from '../store/DraftStore';

export function useDraftAutosave(
  sessionId: string | null,
  text: string,
  onTextChange: (text: string) => void,
) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDraft = useCallback(() => {
    if (!sessionId) return;

    const draft = draftStore.getDraft(sessionId);
    if (draft) {
      onTextChange(draft);
    }
  }, [sessionId, onTextChange]);

  const saveDraft = useCallback(() => {
    if (!sessionId) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      draftStore.saveDraft(sessionId, text);
    }, 500);
  }, [sessionId, text]);

  const clearDraft = useCallback(() => {
    if (!sessionId) return;
    draftStore.clearDraft(sessionId);
  }, [sessionId]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  useEffect(() => {
    saveDraft();

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [text, saveDraft]);

  return {
    loadDraft,
    saveDraft,
    clearDraft,
  };
}
