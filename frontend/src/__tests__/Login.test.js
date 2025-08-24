import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Login from "../pages/Login";
import { AuthContext } from "../context/AuthContext";
import { BrowserRouter } from "react-router-dom";

const mockLogin = jest.fn();

function renderLogin() {
  return render(
    <AuthContext.Provider value={{ login: mockLogin }}>
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

test("renders login form and allows input", () => {
  renderLogin();

  // Check form fields
  expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();

  // Simulate input
  fireEvent.change(screen.getByLabelText(/Email Address/i), {
    target: { value: "test@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Password/i), {
    target: { value: "password123" },
  });

  expect(screen.getByLabelText(/Email Address/i).value).toBe("test@example.com");
  expect(screen.getByLabelText(/Password/i).value).toBe("password123");
});