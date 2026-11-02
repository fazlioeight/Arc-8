import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The repo ships a manual mock at __mocks__/react-router-dom.js that stubs out
// MemoryRouter / Routes. These tests need real router behavior, so unmock and
// pull in the real package.
jest.unmock('react-router-dom');
const { MemoryRouter } = jest.requireActual('react-router-dom');

import PortalUtilityBar from '../components/PortalUtilityBar';
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

const renderBar = () => {
  const authValue = {
    user: { email: 'tester@arc8.test' },
    tenant: 'prominencehealth',
    tenantInfo: { name: 'ProminenceHealth' },
    hasApplicationAccess: () => true,
    availableApplications: ['portal', 'providers'],
    availableTenants: [],
    auditTrail: [],
    recordAuditEvent: jest.fn(),
    setTenant: jest.fn(),
    endImpersonation: jest.fn(),
    logout: jest.fn(),
  };

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <PortalUtilityBar />
      </AuthContext.Provider>
    </MemoryRouter>
  );
};

test('opens the waffle launcher and shows accessible apps', async () => {
  renderBar();
  const user = userEvent.setup();

  const waffleBtn = await screen.findByTitle('App launcher');
  await user.click(waffleBtn);

  expect(await screen.findByText(/Quick links/i)).toBeInTheDocument();
});

test('notifications dropdown is right-aligned and shows the heading', async () => {
  const { container } = renderBar();
  const user = userEvent.setup();

  const notifBtn = await screen.findByTitle('Notifications');
  await user.click(notifBtn);

  expect(screen.getByText('Notifications')).toBeInTheDocument();
  // Notifications dropdown uses right-0 utility class for right alignment
  expect(container.querySelector('.right-0')).toBeTruthy();
});
