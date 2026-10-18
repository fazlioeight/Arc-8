import React, { useContext } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { AuthProvider, AuthContext } from '../context/AuthContext';

const Consumer = () => {
  const { token, isAuthenticated } = useContext(AuthContext);
  return <div data-testid="tok">{isAuthenticated ? token : 'LOGGED_OUT'}</div>;
};

const seed = (extra) =>
  localStorage.setItem(
    'authState',
    JSON.stringify({
      email: 'u@example.com',
      token: 'OLD',
      tenant: 'prominencehealth',
      applications: { portal: 'admin' },
      ...extra,
    }),
  );

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('AuthContext refresh-token rotation', () => {
  test('rotates the access token on 401 instead of logging out', async () => {
    seed({ refreshToken: 'R1', expiresAt: Date.now() + 10 * 60 * 1000 });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'NEW',
        refresh_token: 'R2',
        expires_in: 900,
        email: 'u@example.com',
        tenant: 'prominencehealth',
        applications: { portal: 'admin' },
      }),
    });

    const { getByTestId } = render(<AuthProvider><Consumer /></AuthProvider>);
    expect(getByTestId('tok').textContent).toBe('OLD');

    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    });

    await waitFor(() => expect(getByTestId('tok').textContent).toBe('NEW'));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/refresh'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('logs out on 401 when there is no refresh token (impersonation/staff)', async () => {
    seed({}); // no refreshToken
    global.fetch = jest.fn();

    const { getByTestId } = render(<AuthProvider><Consumer /></AuthProvider>);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    });

    await waitFor(() => expect(getByTestId('tok').textContent).toBe('LOGGED_OUT'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('clears the session when the refresh token is rejected', async () => {
    seed({ refreshToken: 'BAD', expiresAt: Date.now() + 10 * 60 * 1000 });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Invalid refresh token' }),
    });

    const { getByTestId } = render(<AuthProvider><Consumer /></AuthProvider>);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    });

    await waitFor(() => expect(getByTestId('tok').textContent).toBe('LOGGED_OUT'));
  });
});
