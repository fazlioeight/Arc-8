import React from 'react';

const EvidenceSnippetsPanel = ({ suspect, evidenceUsed = [], onChange }) => {
  if (!suspect) {
    return <div className="text-muted">Select a suspect to review evidence.</div>;
  }

  const toggleEvidence = (id) => {
    if (!onChange) return;
    if (evidenceUsed.includes(id)) {
      onChange(evidenceUsed.filter((value) => value !== id));
    } else {
      onChange([...evidenceUsed, id]);
    }
  };

  return (
    <div className="d-flex flex-column gap-2">
      {(suspect.evidence ?? []).slice(0, 10).map((snippet) => {
        const isChecked = evidenceUsed.includes(snippet.snippet_id);
        return (
          <label
            key={snippet.snippet_id}
            className={`border rounded p-2 ${snippet.qualifying ? '' : 'bg-light'}`}
            htmlFor={`snippet-${snippet.snippet_id}`}
          >
            <div className="d-flex justify-content-between">
              <div className="small">
                <strong>{snippet.source_type}</strong> • {snippet.dos} • {snippet.provider?.type || 'Provider'}
              </div>
              <div>
                {snippet.meat?.M ? <span className="badge bg-secondary me-1">M</span> : null}
                {snippet.meat?.E ? <span className="badge bg-secondary me-1">E</span> : null}
                {snippet.meat?.A ? <span className="badge bg-secondary me-1">A</span> : null}
                {snippet.meat?.T ? <span className="badge bg-secondary">T</span> : null}
              </div>
            </div>
            <div className="small text-muted mb-2">
              Confidence {(snippet.confidence * 100).toFixed(0)}%
            </div>
            <div className="mb-2" style={{ whiteSpace: 'pre-wrap' }}>
              {snippet.text}
            </div>
            <div className="form-check">
              <input
                id={`snippet-${snippet.snippet_id}`}
                className="form-check-input"
                type="checkbox"
                checked={isChecked}
                disabled={!snippet.qualifying}
                onChange={() => toggleEvidence(snippet.snippet_id)}
              />
              <label className="form-check-label" htmlFor={`snippet-${snippet.snippet_id}`}>
                Use as evidence
              </label>
            </div>
            {snippet.qualifying ? null : (
              <div className="small text-danger mt-1">Non-qualifying source</div>
            )}
          </label>
        );
      })}
    </div>
  );
};

export default EvidenceSnippetsPanel;
