/**
 * AI Assistant side panel.
 *
 * Mount points (week 1):
 *   - Member360 workspace — `memberId` prop is passed so retrieval is scoped
 *     to the open member.
 *
 * Future mount points (week 5):
 *   - Claim360 — same pattern with `aggregate_type="claim"` (panel doesn't
 *     need to know — backend handles it via the `member_id`-shaped param).
 *
 * Layout:
 *   - Header: title + close button (parent owns the open/close state)
 *   - Body: question textarea + submit; below, answer with citations or error
 *
 * Accessibility:
 *   - Textarea has an associated label
 *   - Submit is disabled while loading
 *   - Errors live in a `role=alert` region
 */
import React, { useMemo } from 'react';

import { useAiAssistant } from '../../hooks/useAiAssistant';
import type { Citation } from '../../types/ai';

import CitationChip from './CitationChip';

import './aiAssistantPanel.css';

interface AiAssistantPanelProps {
  /** When set, the AI scopes retrieval to this member. */
  memberId?: string;
  /** Parent-owned visibility. The panel does not self-dismiss. */
  onClose?: () => void;
  /** Optional title override (e.g., "Ask about Jane Doe"). */
  title?: string;
}

/**
 * Render the answer with citation chips inline.
 *
 * We don't strip the `[N]` markers out of the answer text — the chips render
 * adjacent to them, giving the user a visual link between the assertion and
 * the source.
 *
 * Implementation: split the answer on the `[\d+]` regex, then for each
 * matched marker render the corresponding chip alongside the text.
 */
const renderAnswerWithChips = (answer: string, citations: Citation[]): React.ReactNode => {
  if (!answer) return null;
  const byIndex = new Map<number, Citation>();
  citations.forEach((c) => byIndex.set(c.index, c));

  const parts: React.ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null = regex.exec(answer);
  let nodeKey = 0;
  while (match !== null) {
    if (match.index > lastEnd) {
      parts.push(
        <span key={`t-${nodeKey++}`}>{answer.slice(lastEnd, match.index)}</span>,
      );
    }
    const idx = Number(match[1]);
    const citation = byIndex.get(idx);
    if (citation) {
      parts.push(<CitationChip key={`c-${idx}-${nodeKey++}`} citation={citation} />);
    } else {
      // Marker without a matching citation — preserve the bracketed text so
      // the user can see something is amiss but we don't crash.
      parts.push(<span key={`u-${nodeKey++}`}>{match[0]}</span>);
    }
    lastEnd = match.index + match[0].length;
    match = regex.exec(answer);
  }
  if (lastEnd < answer.length) {
    parts.push(<span key={`t-${nodeKey++}`}>{answer.slice(lastEnd)}</span>);
  }
  return parts;
};

const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({ memberId, onClose, title }) => {
  const { question, setQuestion, result, error, isLoading, ask, reset } = useAiAssistant({
    memberId,
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask();
  };

  const resolvedTitle = title ?? (memberId ? `Ask about this member` : `Ask Nexora`);

  const answerBody = useMemo(() => {
    if (!result) return null;
    return renderAnswerWithChips(result.answer, result.citations);
  }, [result]);

  return (
    <aside className="ai-assistant-panel" aria-label="AI assistant">
      <header className="ai-assistant-panel__header">
        <h2 className="ai-assistant-panel__title">{resolvedTitle}</h2>
        {onClose ? (
          <button
            type="button"
            className="ai-assistant-panel__close"
            onClick={onClose}
            aria-label="Close AI assistant"
          >
            ×
          </button>
        ) : null}
      </header>

      <form className="ai-assistant-panel__form" onSubmit={handleSubmit}>
        <label htmlFor="ai-assistant-question" className="ai-assistant-panel__label">
          Question
        </label>
        <textarea
          id="ai-assistant-question"
          className="ai-assistant-panel__textarea"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={
            memberId
              ? 'e.g. What changed for this member this week?'
              : 'e.g. Which members had a new diabetes diagnosis this month?'
          }
          rows={3}
          maxLength={2000}
          disabled={isLoading}
        />
        <div className="ai-assistant-panel__actions">
          <button
            type="submit"
            className="ai-assistant-panel__submit"
            disabled={isLoading || !question.trim()}
          >
            {isLoading ? 'Thinking…' : 'Ask'}
          </button>
          <button
            type="button"
            className="ai-assistant-panel__reset"
            onClick={reset}
            disabled={isLoading}
          >
            Clear
          </button>
        </div>
      </form>

      {error ? (
        <div className="ai-assistant-panel__error" role="alert">
          {error}
        </div>
      ) : null}

      {result ? (
        <section className="ai-assistant-panel__result" aria-live="polite">
          {!result.grounded ? (
            <p className="ai-assistant-panel__warning" role="note">
              No matching records were found for this question; the answer below is
              not grounded in your tenant&apos;s data.
            </p>
          ) : null}
          <div className="ai-assistant-panel__answer">{answerBody}</div>
          {result.citations.length > 0 ? (
            <footer className="ai-assistant-panel__footer">
              <small>
                {result.retrieved_count} source
                {result.retrieved_count === 1 ? '' : 's'} · model {result.model}
              </small>
            </footer>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
};

export default AiAssistantPanel;
