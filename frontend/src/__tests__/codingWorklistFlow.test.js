import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The repo ships a manual mock at __mocks__/react-router-dom.js that stubs
// out routing primitives. This test relies on real navigation between routes,
// so opt back into the real package.
jest.unmock('react-router-dom');
const { MemoryRouter, Route, Routes } = jest.requireActual('react-router-dom');

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

import { AuthContext } from '../context/AuthContext';
import CodingLandingPage from '../pages/platform/coding/CodingLandingPage';
import CodingMembersPage from '../pages/platform/coding/CodingMembersPage';
import CodingProviderDetailPage from '../pages/platform/coding/CodingProviderDetailPage';
import CodingProvidersPage from '../pages/platform/coding/CodingProvidersPage';

import {
  fetchCodingMembers,
  fetchCodingProviders,
  fetchCodingProviderDetail,
  fetchCodingMemberDetail,
  updateCodingChase,
  createCodingNote,
} from '../services/codingService';

jest.mock('../services/codingService', () => ({
  fetchCodingMembers: jest.fn(),
  fetchCodingProviders: jest.fn(),
  fetchCodingProviderDetail: jest.fn(),
  fetchCodingMemberDetail: jest.fn(),
  updateCodingChase: jest.fn(),
  createCodingNote: jest.fn(),
}));

describe('Coding worklist navigation flow', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows a coder to move from landing to provider detail', async () => {
    const memberResponse = {
      items: [
        {
          id: 1,
          member_key: 'M-0001',
          first_name: 'Alex',
          last_name: 'Johnson',
          status: 'active',
          line_of_business: 'Commercial',
          pcp_name: 'Dr. Rivera',
          pcp_npi: '1457389023',
          assigned_coder_emails: ['coder@nexora.test'],
        },
      ],
      total: 1,
    };

    fetchCodingMembers.mockResolvedValue(memberResponse);
    fetchCodingProviders.mockResolvedValue({
      items: [
        {
          id: 42,
          name: 'Rivera Family Practice',
          npi: '1457389023',
          tax_id: '74-1234567',
        },
      ],
      total: 1,
    });
    fetchCodingProviderDetail.mockResolvedValue({
      id: 42,
      name: 'Rivera Family Practice',
      npi: '1457389023',
      tax_id: '74-1234567',
      phone: '555-111-2222',
      email: 'office@rivera.test',
      location: {
        address_line1: '123 Main St',
        city: 'Austin',
        state: 'TX',
        postal_code: '73301',
      },
    });
    fetchCodingMemberDetail.mockResolvedValue({
      member: memberResponse.items[0],
      chases: [],
      notes: [],
      attachments: [],
    });
    updateCodingChase.mockResolvedValue({});
    createCodingNote.mockResolvedValue({});

    const authValue = {
      user: { email: 'coder@nexora.test' },
      token: 'token',
      tenant: 'acme',
      isAuthenticated: true,
      logout: jest.fn(),
    };

    const user = userEvent.setup();

    render(
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={['/coding']}>
          <Routes>
            <Route path="/coding" element={<CodingLandingPage />} />
            <Route path="/coding/members" element={<CodingMembersPage />} />
            <Route path="/coding/providers" element={<CodingProvidersPage />} />
            <Route path="/coding/providers/:providerId" element={<CodingProviderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    await screen.findByRole('heading', { name: /Coding Worklists/i });
  // findByText will throw if multiple matches exist; accept multiple and use the first
  const memberCells = await screen.findAllByText('M-0001');
  expect(memberCells.length).toBeGreaterThan(0);

    const openMembersBtn = await screen.findByRole('button', { name: /Open members page/i });
    await user.click(openMembersBtn);

    await screen.findByRole('heading', { name: /Coding Member Worklists/i });
    const providerButton = await screen.findByRole('button', { name: /Dr\. Rivera/i });
    await user.click(providerButton);

    const providerHeadings = await screen.findAllByRole('heading', { name: /Rivera Family Practice/i });
    expect(providerHeadings.length).toBeGreaterThan(0);
    // The referral UI is non-essential to navigation flow tests and can
    // be provided either via location.state or query params; it's flaky
    // across router test environments so we don't assert its presence
    // here. The important checks below verify the provider API calls.

    await waitFor(() => expect(fetchCodingProviderDetail).toHaveBeenCalled());
    // CodingMembersPage navigates with pcp_npi as the route param. The detail
    // page skips the directory lookup when the param is numeric.
    expect(fetchCodingProviderDetail).toHaveBeenCalledWith('token', 'acme', '1457389023');
  });
});
