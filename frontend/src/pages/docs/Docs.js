import React, { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../portal_page/portalPage.sfdc.css';
import { AuthContext } from '../../context/AuthContext';

const useQuery = () => {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
};

const Docs = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useContext(AuthContext) || {};
  const query = useQuery();
  const qParam = query.get('q') || '';
  const [q, setQ] = React.useState(qParam);

  const onSubmit = (e) => {
    e.preventDefault();
    navigate(`/docs?q=${encodeURIComponent(q)}`);
  };

  return (
    <div style={{ maxWidth: 960, margin: '40px auto', padding: '0 16px' }}>
      <button
        className="sfdc-iconbutton"
        title="Home"
        aria-label="Go to home"
        onClick={() => navigate(isAuthenticated ? '/portal_page/portalPage' : '/')}
        style={{ position: 'fixed', top: 12, left: 12, zIndex: 5 }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3l9-8z"/></svg>
      </button>
      <h1 style={{ marginBottom: 8 }}>Nexora Analytics Docs</h1>
      <p style={{ color: 'var(--text-muted, #6f7780)' }}>
        This docs section is a placeholder and will be filled in later.
      </p>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, margin: '16px 0 24px' }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search documentation"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border, #e1e4e8)' }}
        />
        <button type="submit" className="sfdc-button_brand">Search</button>
      </form>
      {qParam ? (
        <div>
          <div style={{ color: 'var(--text-muted, #6f7780)', marginBottom: 8 }}>
            Showing placeholder results for: <strong>{qParam}</strong>
          </div>
          <div style={{ padding: 12, border: '1px solid var(--border, #e1e4e8)', borderRadius: 10 }}>
            <em>No indexed docs yet. Connect your docs to enable search.</em>
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted, #6f7780)' }}>
          Try a query above to search future docs.
        </div>
      )}
    </div>
  );
};

export default Docs;
