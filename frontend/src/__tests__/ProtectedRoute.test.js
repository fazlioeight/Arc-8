import React from 'react';
import ReactDOMServer from 'react-dom/server';
import ProtectedRoute from '../components/ProtectedRoute';
import { AuthContext } from '../context/AuthContext';

// Mock Navigate to render a visible marker without referencing outer scope
jest.mock('react-router-dom', () => {
  const React = require('react');
  // preserve the real module but override only Navigate so tests can
  // still access hooks like useParams/useLocation when other tests run
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    Navigate: () => React.createElement('div', null, 'NAVIGATE'),
  };
}, { virtual: true });

describe('ProtectedRoute', () => {
  test('renders children when authenticated', () => {
    const html = ReactDOMServer.renderToString(
      <AuthContext.Provider value={{ isAuthenticated: true }}>
        <ProtectedRoute>
          <div>PRIVATE</div>
        </ProtectedRoute>
      </AuthContext.Provider>
    );
    expect(html).toContain('PRIVATE');
  });

  test('renders Navigate when not authenticated', () => {
    const html = ReactDOMServer.renderToString(
      <AuthContext.Provider value={{ isAuthenticated: false }}>
        <ProtectedRoute>
          <div>PRIVATE</div>
        </ProtectedRoute>
      </AuthContext.Provider>
    );
    expect(html).toContain('NAVIGATE');
  });
});
