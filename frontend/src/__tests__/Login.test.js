import React from "react";
import ReactDOMServer from "react-dom/server";
import Login from "../pages/Login";
import { AuthContext } from "../context/AuthContext";
// Mock react-router-dom to avoid dependency on actual package
jest.mock("react-router-dom", () => {
  const React = require("react");
  return {
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
  expect(html).toContain("Login to Your Account");
  expect(html).toContain("Email Address");
  expect(html).toContain("Password");
});
