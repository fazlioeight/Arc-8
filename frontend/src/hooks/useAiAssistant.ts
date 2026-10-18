/**
 * Hook backing the AI Assistant panel.
 *
 * Holds the conversation state (a single Q/A pair for the MVP — we don't yet
 * keep multi-turn history because the backend `/api/v1/ai/ask` is stateless).
 *
 * Why no React Query yet? See the architecture decision on 2026-05-19: new
 * code lands in TypeScript without forcing a wider data-layer migration.
 * When TanStack Query lands in Week 5, this hook becomes a thin `useMutation`
 * wrapper without changing the consuming component.
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { AuthContext } from '../context/AuthContext';
import { askAi } from '../services/aiService';
import type { AskResponse } from '../types/ai';

interface UseAiAssistantOptions {
  /** When set, retrieval is narrowed to this member. */
  memberId?: string;
}

interface UseAiAssistantResult {
  question: string;
  setQuestion: (value: string) => void;
  result: AskResponse | null;
  error: string | null;
  isLoading: boolean;
  ask: () => Promise<void>;
  reset: () => void;
}

/**
 * AuthContext is JS, so we don't have a type for it here. The fields we
 * actually consume are narrow — declare them locally and runtime-check on use
 * rather than reaching for `any`.
 */
interface AuthContextShape {
  token: string | null;
  tenant?: string | null;
}

export function useAiAssistant(opts: UseAiAssistantOptions = {}): UseAiAssistantResult {
  const auth = useContext(AuthContext as unknown as React.Context<AuthContextShape | null>);

  const [question, setQuestion] = useState<string>('');
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // AbortController for in-flight request. Cancelled on unmount so the
  // component doesn't update state after it's gone (React 18 warns loudly).
  const inFlightRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      inFlightRef.current?.abort();
    },
    [],
  );

  const ask = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    if (!auth?.token) {
      setError('You are signed out. Please sign in again.');
      return;
    }

    // Cancel any in-flight request — the panel is single-shot for MVP, so a
    // second submit replaces the first answer rather than racing.
    inFlightRef.current?.abort();
    const ctrl = new AbortController();
    inFlightRef.current = ctrl;

    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await askAi(
        auth.token,
        auth.tenant ?? '',
        { question: trimmed, member_id: opts.memberId },
        ctrl.signal,
      );
      setResult(response);
    } catch (err: unknown) {
      // AbortError is the expected outcome of a follow-up submit; don't
      // surface it as an error.
      const name = err && typeof err === 'object' && 'name' in err ? (err as { name: string }).name : '';
      if (name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      if (inFlightRef.current === ctrl) {
        inFlightRef.current = null;
        setIsLoading(false);
      }
    }
  }, [auth?.token, auth?.tenant, opts.memberId, question]);

  const reset = useCallback(() => {
    inFlightRef.current?.abort();
    inFlightRef.current = null;
    setQuestion('');
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { question, setQuestion, result, error, isLoading, ask, reset };
}
