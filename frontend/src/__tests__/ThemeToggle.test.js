import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.unmock('react-router-dom');
const { MemoryRouter } = jest.requireActual('react-router-dom');

import { ThemeProvider } from '../context/ThemeContext';
import PortalUtilityBar from '../components/PortalUtilityBar';
import PortalSidebar from '../components/PortalSidebar';
import { AuthContext } from '../context/AuthContext';

jest.mock('../context/CommandPaletteContext', () => ({
  useCommandPalette: () => ({
    openPalette: jest.fn(),
    closePalette: jest.fn(),
    registerCommands: jest.fn(),
    dynamicCommands: [],
    query: '',
    setQuery: jest.fn(),
    isOpen: false,
  }),
}));

jest.mock('../context/UserPreferencesContext', () => ({
  useUserPreferences: () => ({
    favorites: [],
    toggleFavorite: jest.fn(),
    isFavorite: () => false,
    isNavItemEnabled: () => true,
    recordViewPreference: jest.fn(),
    getViewPreference: jest.fn(),
    markNotificationRead: jest.fn(),
    navVisibility: {},
    updateRoleMenus: jest.fn(),
    setNavVisibility: jest.fn(),
    viewPreferences: {},
    notificationPrefs: { dismissed: [], lastRead: null },
  }),
}));

const authValue = {
  user: { name: 'Dr. Sarah Chen', email: 'sarah.chen@arc8.test', role: 'clinician' },
  tenant: 'prominencehealth',
  tenantInfo: { name: 'ProminenceHealth' },
  hasApplicationAccess: () => true,
  hasPermission: () => true,
  availableApplications: ['portal', 'providers'],
  availableTenants: [],
  auditTrail: [],
  recordAuditEvent: jest.fn(),
  setTenant: jest.fn(),
  endImpersonation: jest.fn(),
  logout: jest.fn(),
  switchRolePersona: jest.fn(),
};

describe('System-wide bright default theme & header theme toggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
    document.body.className = '';
  });

  test('defaults to bright (light) theme and migrates legacy auto-saved dark preference once', () => {
    // Simulate legacy session where old App.js auto-saved 'dark' without migration flag
    window.localStorage.setItem('themePreference', 'dark');

    const { container } = render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthContext.Provider value={authValue}>
            <PortalSidebar collapsed={false} onToggleCollapse={jest.fn()} />
            <PortalUtilityBar />
          </AuthContext.Provider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(document.documentElement.classList.contains('light-mode')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // Sidebar uses bright surface with dark: variant classes
    const aside = container.querySelector('aside');
    expect(aside).toBeTruthy();
    expect(aside.className).toContain('bg-white');
    expect(aside.className).toContain('dark:bg-[#0a0f1d]');
  });

  test('toggles entire system between bright and dark via header icon button', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthContext.Provider value={authValue}>
            <PortalSidebar collapsed={false} onToggleCollapse={jest.fn()} />
            <PortalUtilityBar />
          </AuthContext.Provider>
        </ThemeProvider>
      </MemoryRouter>
    );

    const toggleBtn = screen.getByTestId('header-theme-toggle');
    expect(toggleBtn).toHaveAttribute('aria-label', 'Switch to dark mode');

    // Switch to dark mode
    await user.click(toggleBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(toggleBtn).toHaveAttribute('aria-label', 'Switch to light mode');
    expect(window.localStorage.getItem('themePreference')).toBe('dark');

    // Switch back to bright (light) mode
    await user.click(toggleBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light-mode')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(toggleBtn).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(window.localStorage.getItem('themePreference')).toBe('light');
  });
});
