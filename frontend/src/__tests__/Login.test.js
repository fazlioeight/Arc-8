import React from "react";
import ReactDOMServer from "react-dom/server";
import Login from "../pages/website/Login";
import { AuthContext } from "../context/AuthContext";
// Mock react-router-dom to avoid dependency on actual package
jest.mock("react-router-dom", () => {
  const React = require("react");
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    BrowserRouter: ({ children }) => React.createElement(React.Fragment, null, children),
    useNavigate: () => () => {},
  };
}, { virtual: true });

const mockLogin = jest.fn();
const { MemoryRouter } = jest.requireActual("react-router-dom");

function renderLoginToString() {
  return ReactDOMServer.renderToString(
    <MemoryRouter>
      <AuthContext.Provider value={{ login: mockLogin }}>
        <Login />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

test("renders enterprise login form and OIDC SSO elements", () => {
  const html = renderLoginToString();
  expect(html).toContain("Enterprise Sign In");
  expect(html).toContain("Enterprise OIDC / Cognito Sign-In");
  expect(html).toContain("Sign In to Platform");
  expect(html).toContain("Instant Demo Role Logins");
});
