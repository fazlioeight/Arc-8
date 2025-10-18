import React from 'react';

const DocumentViewer = ({ documents = [], activeSnippet }) => {
  if (!documents.length) {
    return <div className="text-muted">No documents available.</div>;
  }

  return (
    <div style={{ minHeight: 420 }}>
      {documents.map((doc) => (
        <div key={doc.id} className="mb-3 p-2 border rounded">
          <div className="small text-muted">
            {doc.source_type} • {doc.dos} • {doc.provider?.name || doc.provider?.type || 'Unknown'}
          </div>
          <div className="mt-2">
            <pre className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
              {doc.preview || '— preview unavailable —'}
            </pre>
          </div>
        </div>
      ))}
      {activeSnippet ? (
        <div className="alert alert-info mt-3">
          Jumped to snippet at page {activeSnippet.location?.page ?? '—'}
        </div>
      ) : null}
    </div>
  );
};

export default DocumentViewer;
