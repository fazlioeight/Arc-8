import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PortalUtilityBar from '../components/PortalUtilityBar';
import { AuthContext } from '../context/AuthContext';

test('waffle opens a left-aligned waffle and notifications are right-aligned', async () => {
  const authValue = {
    user: { email: 'tester@nexora.test' },
    tenant: 'demo',
    tenantInfo: { name: 'Demo' },
    hasApplicationAccess: () => true,
    availableTenants: [],
    auditTrail: [],
    recordAuditEvent: () => {},
    setTenant: () => {},
    endImpersonation: () => {},
    logout: () => {},
  };

  const { container } = render(
    <AuthContext.Provider value={authValue}>
      <PortalUtilityBar />
    </AuthContext.Provider>
  );

  const user = userEvent.setup();

  // Open the app launcher (waffle)
  const waffleBtn = await screen.findByTitle('App launcher');
  await user.click(waffleBtn);

  // Waffle should render and use the left-aligned .sfdc-waffle class
  expect(container.querySelector('.sfdc-waffle')).toBeTruthy();
  expect(screen.getByText('Apps')).toBeTruthy();

  // Open notifications and assert it uses the right-aligned dropdown modifier
  const notifBtn = await screen.findByTitle('Notifications');
  await user.click(notifBtn);

  // Notifications dropdown should be present and use the right modifier
  expect(container.querySelector('.sfdc-dropdown--right')).toBeTruthy();
  expect(screen.getByText('Notifications')).toBeTruthy();
});
