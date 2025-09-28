import React, { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import '../styles/sessionLock.css';

const SessionLockOverlay = () => {
  const { sessionLocked, unlockSession, logout, user } = useContext(AuthContext) || {};
  const [unlocking, setUnlocking] = useState(false);

  if (!sessionLocked) {
    return null;
  }

  const handleUnlock = () => {
    setUnlocking(true);
    setTimeout(() => {
      unlockSession?.('sso');
      setUnlocking(false);
    }, 350);
  };

  return (
    <div className="session-lock" role="dialog" aria-modal="true" aria-labelledby="session-lock-title">
      <div className="session-lock__panel">
        <h2 id="session-lock-title">Session paused for safety</h2>
        <p>Your workspace stayed intact, but we need to confirm it's still you.</p>
        <div className="session-lock__meta">
          <div>
            <span>Signed in as</span>
            <strong>{user?.email || 'user@nexora.ai'}</strong>
          </div>
        </div>
        <div className="session-lock__actions">
          <button type="button" className="session-lock__primary" onClick={handleUnlock} disabled={unlocking}>
            {unlocking ? 'Reauthenticating…' : 'Re-auth with SSO'}
          </button>
          <button type="button" className="session-lock__secondary" onClick={() => logout?.()}>
            Sign out instead
          </button>
        </div>
        <div className="session-lock__hint">Inactivity locks keep PHI safe. Re-auth unlocks instantly without losing drafts.</div>
      </div>
    </div>
  );
};

export default SessionLockOverlay;
