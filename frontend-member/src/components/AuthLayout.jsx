import React from 'react';

import Brand from './Brand';
import LanguageSwitcher from './LanguageSwitcher';

// Centered card shell for unauthenticated pages (login, register, reset).
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-4 max-w-content mx-auto w-full">
        <Brand />
        <LanguageSwitcher />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mp-card p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-canvas-ink">{title}</h1>
            {subtitle && <p className="text-sm text-canvas-muted mt-1 mb-6">{subtitle}</p>}
            {children}
          </div>
          {footer && <div className="text-center text-sm text-canvas-muted mt-4">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
