import React, { useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { ROUTES } from '../constants/routes';
import '../styles/sessionLock.css';

const SessionLockOverlay = () => {
  const { sessionLocked, unlockSession, logout, user, isAuthenticated } = useContext(AuthContext) || {};
  const [unlocking, setUnlocking] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  if (!sessionLocked || !isAuthenticated) {
    return null;
  }

  const handleUnlock = () => {
    setUnlocking(true);
    setTimeout(() => {
      unlockSession?.('sso');
      setUnlocking(false);
      if (location.pathname === '/login') {
        const destination = location.state?.lockedFrom || ROUTES.PORTAL.LANDING;
        navigate(destination, { replace: true });
      }
    }, 350);
  };

  return (
    <div className="session-lock" role="dialog" aria-modal="true" aria-labelledby="session-lock-title">
      <div className="session-lock__panel">
        <div className="session-lock__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 id="session-lock-title">Session paused for safety</h2>
        <p className="session-lock__desc">
          Your workspace stayed intact, but we need to confirm it&apos;s still you.
        </p>
        <div className="session-lock__meta">
          <span>Signed in as</span>
          <strong>{user?.email || 'user@arc8.test'}</strong>
        </div>
        <div className="session-lock__actions">
          <button type="button" className="session-lock__primary" onClick={handleUnlock} disabled={unlocking}>
            {unlocking ? 'Reauthenticating…' : 'Re-auth with SSO'}
          </button>
          <button type="button" className="session-lock__secondary" onClick={() => logout?.()}>
            Sign out instead
          </button>
        </div>
        <div className="session-lock__hint">
          Inactivity locks keep PHI safe. Re-auth unlocks instantly without losing drafts.
        </div>
      </div>
    </div>
  );
};

export default SessionLockOverlay;
