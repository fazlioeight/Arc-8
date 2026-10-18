import React from "react";
import { render, screen } from "@testing-library/react";

jest.unmock("react-router-dom");
const { MemoryRouter } = jest.requireActual("react-router-dom");

import Member360LandingPage from "./Member360LandingPage";
import { AuthContext } from "../../../context/AuthContext";

jest.mock("../../../services/codingService", () => {
  class MemberSearchService {
    async search() { return { items: [] }; }
    async lookup() { return { items: [] }; }
  }
  return {
    fetchCodingMembers: jest.fn(() => Promise.resolve({ items: [] })),
    MemberSearchService,
  };
});

jest.mock("../../../services/member360LabService", () => ({
  fetchMember360Members: jest.fn(() => Promise.resolve({ items: [], total: 0 })),
}));

jest.mock("../../../context/UserPreferencesContext", () => ({
  useUserPreferences: () => ({
    favorites: [],
    toggleFavorite: jest.fn(),
    isFavorite: jest.fn(),
    isNavItemEnabled: jest.fn(() => true),
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

jest.mock("../../../context/CommandPaletteContext", () => ({
  useCommandPalette: () => ({
    openPalette: jest.fn(),
    closePalette: jest.fn(),
    registerCommands: jest.fn(),
    dynamicCommands: [],
    query: "",
    setQuery: jest.fn(),
    isOpen: false,
  }),
}));

const renderPage = (overrides = {}) => {
  const authValue = {
    token: "sample-token",
    tenant: "sample-tenant",
    user: { email: "test@nexoralab.test", role: "admin" },
    hasApplicationAccess: () => true,
    availableApplications: ["portal", "member360", "providers"],
    purchasedApplications: ["portal", "member360", "providers"],
    availableTenants: [{ key: "sample-tenant", name: "Sample Tenant" }],
    tenantInfo: { key: "sample-tenant", name: "Sample Tenant" },
    setTenant: jest.fn(),
    logout: jest.fn(),
    isImpersonating: false,
    impersonation: null,
    endImpersonation: jest.fn(),
    auditTrail: [],
    recordAuditEvent: jest.fn(),
    ...overrides,
  };

  render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <Member360LandingPage />
      </AuthContext.Provider>
    </MemoryRouter>
  );
};

describe("Member360LandingPage", () => {
  it("renders the member search heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /launch a member chart in seconds/i })
    ).toBeInTheDocument();
  });
});
