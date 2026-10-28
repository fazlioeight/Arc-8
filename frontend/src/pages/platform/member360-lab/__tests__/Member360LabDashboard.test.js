import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.unmock("react-router-dom");
const { MemoryRouter } = jest.requireActual("react-router-dom");

import Member360LabDashboard from "../Member360LabDashboard";
import { AuthContext } from "../../../../context/AuthContext";

// Service mock — the only network call the page makes is
// fetchMember360Dashboard. Returning a minimal but valid shape
// lets the page render its KPI tiles and tables.
jest.mock("../../../../services/member360LabService", () => ({
  fetchMember360Dashboard: jest.fn(() =>
    Promise.resolve({
      metrics: [
        { key: "total_members", label: "Members in active workflows", value: 8, hint: "All tracked" },
        { key: "high_risk", label: "High-risk members", value: 3 },
        { key: "critical_risk", label: "Critical-risk members", value: 2 },
        { key: "open_tasks", label: "Open tasks", value: 5 },
        { key: "overdue_tasks", label: "Overdue tasks", value: 0 },
        { key: "active_journeys", label: "Active care journeys", value: 4 },
        { key: "estimated_savings", label: "Estimated savings", value: 1195 },
        { key: "validated_savings", label: "Validated savings", value: 0 },
      ],
      high_priority_members: [
        {
          id: 1,
          member_key: "M360-0001",
          first_name: "Maria",
          last_name: "Hernandez",
          plan_name: "ProminenceCare Gold",
          risk_tier: "Critical",
          risk_score_composite: 8.6,
          open_care_gaps: 4,
          active_journey_count: 1,
          next_best_action: "Schedule cardiology follow-up",
        },
      ],
      top_risk_drivers: [
        { domain: "Clinical", driver: "Uncontrolled HbA1c", member_count: 3, average_score: 8.2 },
      ],
      recent_activity: [],
      upcoming_actions: [],
    })
  ),
}));

// PortalPageLayout pulls in PortalUtilityBar which depends on
// UserPreferencesContext. Stub it with the minimum surface so the layout
// renders without complaining about undefined methods.
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
        <Member360LabDashboard />
      </AuthContext.Provider>
    </MemoryRouter>
  );
};

describe("Member360LabDashboard", () => {
  it("renders KPI metrics and high-priority members after fetch resolves", async () => {
    renderPage();

    // The page name itself should always render
    await waitFor(() => {
      expect(screen.getByText(/Care intelligence dashboard/i)).toBeInTheDocument();
    });

    // Metrics from the mocked service should appear (label of one tile)
    await waitFor(() => {
      expect(screen.getByText(/Members in active workflows/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Critical-risk members/i)).toBeInTheDocument();

    // The high-priority member's name appears in the table
    expect(await screen.findByText(/Maria Hernandez/)).toBeInTheDocument();
  });
});
