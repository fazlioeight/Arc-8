import React, { useContext, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import PortalHero from '../../components/PortalHero';
import { AuthContext } from '../../context/AuthContext';
import '../portal_page/portalPage.sfdc.css';

const useQuery = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

const Docs = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useContext(AuthContext) || {};
  const query = useQuery();
  const qParam = query.get('q') || '';
  const [q, setQ] = useState(qParam);

  const onSubmit = (event) => {
    event.preventDefault();
    navigate(`/docs?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="sfdc-portal coding-portal">
      {isAuthenticated && <PortalUtilityBar />}
      <PortalHero
        align="left"
        title="Nexora documentation"
        subtitle="Search knowledge articles and implementation guides (coming soon)."
        actions={(
          <button
            type="button"
            className="sfdc-button_brand"
            onClick={() => navigate(isAuthenticated ? '/portal_page/portalPage' : '/')}
          >
            Back to portal
          </button>
        )}
        wave={false}
      />

      <div style={{ maxWidth: 960, margin: '32px auto', padding: '0 16px' }}>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, margin: '16px 0 24px' }}>
          <input
            type="text"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search documentation"
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border, #e1e4e8)' }}
          />
          <button type="submit" className="sfdc-button_brand">Search</button>
        </form>

        {qParam ? (
          <div>
            <div style={{ color: 'var(--sfdc-muted, #6b7280)', marginBottom: 8 }}>
              Showing placeholder results for: <strong>{qParam}</strong>
            </div>
            <div style={{ padding: 12, border: '1px solid var(--sfdc-border, #e1e4e8)', borderRadius: 10 }}>
              <em>No indexed docs yet. Connect your docs to enable search.</em>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--sfdc-muted, #6b7280)' }}>
            Try a query above to search future docs.
          </div>
        )}
      </div>
    </div>
  );
};

export default Docs;
