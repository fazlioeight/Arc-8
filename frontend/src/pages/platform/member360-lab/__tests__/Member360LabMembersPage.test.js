import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.unmock("react-router-dom");
const { MemoryRouter } = jest.requireActual("react-router-dom");

import Member360LabMembersPage from "../Member360LabMembersPage";
import { AuthContext } from "../../../../context/AuthContext";

jest.mock("../../../../services/member360LabService", () => ({
  fetchMember360Members: jest.fn(() =>
    Promise.resolve({
      items: [
        {
          id: 1,
          member_key: "M360-0001",
          first_name: "Maria",
          last_name: "Hernandez",
          plan_name: "ProminenceCare Gold",
          line_of_business: "Medicare Advantage",
          risk_tier: "Critical",
          risk_score_composite: 8.6,
          open_care_gaps: 4,
          active_journey_count: 1,
          open_task_count: 1,
          last_interaction_at: "2026-05-15T17:00:00Z",
          next_best_action: "Schedule cardiology follow-up",
          primary_care_provider: "Dr. Whitley",
        },
      ],
      total: 1,
    })
  ),
}));

jest.mock("../../../../context/UserPreferencesContext", () => ({
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

const renderPage = () => {
  const auth = {
    token: "sample-token",
    tenant: "sample-tenant",
    user: { email: "test@arc8.test", role: "admin" },
    hasApplicationAccess: () => true,
    availableApplications: ["portal", "member360"],
    purchasedApplications: ["portal", "member360"],
    availableTenants: [{ key: "sample-tenant", name: "Sample Tenant" }],
    tenantInfo: { key: "sample-tenant", name: "Sample Tenant" },
    setTenant: jest.fn(),
    logout: jest.fn(),
    isImpersonating: false,
    impersonation: null,
    endImpersonation: jest.fn(),
    auditTrail: [],
    recordAuditEvent: jest.fn(),
  };
  render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <Member360LabMembersPage />
      </AuthContext.Provider>
    </MemoryRouter>
  );
};

describe("Member360LabMembersPage", () => {
  it("renders the members table and pagination footer after the fetch resolves", async () => {
    renderPage();

    // Page title — match the h1 specifically so we don't collide with the
    // "Members" entry that LabSubNav renders into the side rail.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^members$/i, level: 1 })).toBeInTheDocument();
    });

    // The single seeded member's name appears
    expect(await screen.findByText(/Maria Hernandez/)).toBeInTheDocument();

    // Pagination footer renders the "Showing 1–1 of 1" message
    await waitFor(() => {
      expect(screen.getByText(/Showing 1–1 of 1/)).toBeInTheDocument();
    });
  });
});
