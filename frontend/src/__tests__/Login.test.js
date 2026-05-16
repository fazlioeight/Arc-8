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

test("renders login form heading", () => {
  const html = renderLoginToString();
  expect(html).toContain("Sign in");
  expect(html).toContain("Workspace");
  expect(html).toContain("Sign in with Microsoft");
});
