import React, { useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { ROUTES } from '../constants/routes';

const StaffImpersonationBanner = () => {
  const { isStaffActor, staffActor, tenantInfo, exitStaffImpersonation } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  if (!isStaffActor) return null;
  if (location.pathname.startsWith('/staff/login')) return null;
  if (location.pathname.startsWith('/staff/bootstrap')) return null;

  const handleExit = () => {
    exitStaffImpersonation();
    navigate(ROUTES.STAFF.CONSOLE, { replace: true });
  };

  const tenantLabel = tenantInfo?.name || tenantInfo?.key || 'tenant';

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-amber-300/40 bg-amber-100/95 px-4 py-2 text-sm text-amber-900 backdrop-blur dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-100">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
        <span>
          <strong>Arc-8 staff session</strong> — you are signed in as{' '}
          <span className="font-mono text-xs">{staffActor?.email || 'staff'}</span>{' '}
          acting on <strong>{tenantLabel}</strong>. All actions are audited.
        </span>
      </div>
      <button
        type="button"
        onClick={handleExit}
        className="rounded-md border border-amber-400 bg-white/70 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-white dark:border-amber-400/60 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
      >
        Exit tenant
      </button>
    </div>
  );
};

export default StaffImpersonationBanner;
