/**
 * Clickable chip that links a citation marker back to its source record.
 *
 * The chip is the user-facing receipt that the model didn't hallucinate —
 * clicking it opens the originating Member360 sub-tab. A tooltip shows the
 * full snippet without leaving the panel.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';

import type { Citation } from '../../types/ai';

interface CitationChipProps {
  citation: Citation;
}

/**
 * Render policy:
 *   - Small inline button styled like a chip (rounded, brand-tinted)
 *   - On hover, a native title shows the snippet (no JS tooltip = no a11y bugs)
 *   - On click, navigate via react-router so the SPA doesn't full-reload
 *
 * We deliberately don't render the snippet visibly — the answer text already
 * carries the bracketed marker, so the chip's role is the deep link.
 */
const CitationChip: React.FC<CitationChipProps> = ({ citation }) => {
  const navigate = useNavigate();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!citation.url) return;
    navigate(citation.url);
  };

  // Snippet is shown via the native `title` attribute. Long snippets get
  // clipped by the browser, which is fine — full provenance lives in the
  // backend audit event.
  return (
    <button
      type="button"
      onClick={handleClick}
      title={citation.snippet}
      className="ai-citation-chip"
      aria-label={`Open source ${citation.index}: ${citation.aggregate_type} ${citation.aggregate_id}`}
    >
      [{citation.index}]
    </button>
  );
};

export default CitationChip;
