const React = require('react');

// Minimal mocks for testing environment
module.exports = {
  MemoryRouter: ({ children }) => React.createElement(React.Fragment, null, children),
  BrowserRouter: ({ children }) => React.createElement(React.Fragment, null, children),
  Routes: ({ children }) => React.createElement(React.Fragment, null, children),
  Route: ({ element }) => (element || null),
  useNavigate: () => () => {},
  useLocation: () => ({ pathname: '/' }),
  Navigate: ({ children }) => React.createElement('div', null, 'NAVIGATE'),
};
