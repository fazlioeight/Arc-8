import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import Brand from './Brand';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuth } from '../context/MemberAuthContext';
import { useI18n } from '../i18n/I18nContext';

const NAV_ITEMS = [
  { to: '/dashboard', key: 'nav.dashboard' },
  { to: '/coverage', key: 'nav.coverage' },
  { to: '/claims', key: 'nav.claims' },
  { to: '/spending', key: 'nav.accumulators' },
  { to: '/documents', key: 'nav.documents' },
  { to: '/providers', key: 'nav.providers' },
  { to: '/account', key: 'nav.account' },
];

export default function Layout() {
  const { t } = useI18n();
  const { logout, email } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const onSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navLinkClass = ({ isActive }) =>
    `block rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 ${
      isActive ? 'bg-brand-50 text-brand-700' : 'text-canvas-ink hover:bg-canvas-bg'
    }`;

  return (
    <div className="min-h-full flex flex-col">
      <a href="#main" className="sr-only mp-link p-2">
        Skip to content
      </a>
      <header className="bg-canvas-panel border-b border-canvas-border">
        <div className="max-w-content mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden mp-btn-secondary px-2 py-1"
              aria-expanded={menuOpen}
              aria-controls="primary-nav"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="sr-only">Menu</span>☰
            </button>
            <Brand />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-canvas-muted truncate max-w-[180px]">{email}</span>
            <LanguageSwitcher />
            <button type="button" className="mp-btn-secondary" onClick={onSignOut}>
              {t('common.signOut')}
            </button>
          </div>
        </div>
        <nav
          id="primary-nav"
          aria-label="Primary"
          className={`${menuOpen ? 'block' : 'hidden'} md:block border-t border-canvas-border md:border-0`}
        >
          <ul className="max-w-content mx-auto px-2 md:px-4 md:flex md:gap-1 py-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={navLinkClass} onClick={() => setMenuOpen(false)}>
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="flex-1 max-w-content mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
