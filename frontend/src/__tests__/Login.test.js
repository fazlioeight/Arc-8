import React from "react";
import ReactDOMServer from "react-dom/server";
import Login from "../pages/Login";
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

function renderLoginToString() {
  return ReactDOMServer.renderToString(
    <AuthContext.Provider value={{ login: mockLogin }}>
      <Login />
    </AuthContext.Provider>
  );
}

test("renders login form heading", () => {
  const html = renderLoginToString();
  expect(html).toContain("Sign in");
  expect(html).toContain("Email address");
  expect(html).toContain("Password");
});
