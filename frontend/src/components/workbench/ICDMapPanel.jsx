import React, { useEffect, useState } from 'react';

const ICDMapPanel = ({ selectedICD, onSelectICD, modelYear, lob, fetchMap }) => {
  const [query, setQuery] = useState('');
  const [mapping, setMapping] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!selectedICD || !fetchMap) {
      setMapping(null);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    fetchMap(selectedICD, { modelYear, lob })
      .then((result) => {
        if (!cancelled) {
          setMapping(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Unable to load mapping');
          setMapping(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedICD, fetchMap, modelYear, lob]);

  const handleSelect = () => {
    if (!query.trim()) return;
    onSelectICD?.(query.trim().toUpperCase());
  };

  return (
    <div>
      <div className="input-group mb-2">
        <input
          className="form-control"
          placeholder="Search ICD-10-CM"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="btn btn-outline-secondary" type="button" onClick={handleSelect}>
          Select
        </button>
      </div>

      {selectedICD ? (
        <div className="mb-2 small text-muted">
          Selected code: <strong>{selectedICD}</strong>
        </div>
      ) : (
        <div className="mb-2 small text-muted">Select or search for an ICD code to view mapping.</div>
      )}

      {loading ? <div className="small text-muted">Loading mapping…</div> : null}
      {error ? <div className="small text-danger">{error}</div> : null}

      {mapping ? (
        <div className="border rounded p-2">
          <div>
            <strong>{mapping.code}</strong> → HCC {mapping.hcc}
          </div>
          {mapping.notes?.length ? (
            <ul className="small mt-2 mb-0">
              {mapping.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          {mapping.alternatives?.length ? (
            <div className="mt-2">
              <div className="small text-muted">More specific alternatives</div>
              <div className="d-flex flex-wrap gap-2 mt-1">
                {mapping.alternatives.map((alt) => (
                  <button
                    key={alt}
                    type="button"
                    className="btn btn-sm btn-light"
                    onClick={() => onSelectICD?.(alt)}
                  >
                    {alt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default ICDMapPanel;
