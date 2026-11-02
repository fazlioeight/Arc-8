import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.unmock("react-router-dom");
const { MemoryRouter, Route, Routes } = jest.requireActual("react-router-dom");

import Member360LabWorkspace from "../Member360LabWorkspace";
import { AuthContext } from "../../../../context/AuthContext";

// Workspace fans out: fetchMember360MemberDetail (left rail + tabs) and
// fetchMember360GapAnalysis (for the Care Gaps tab + record header badge).
// Both must resolve to valid shapes for the page to escape its loading
// state. Other write endpoints aren't touched on initial render and only
// matter if the test simulates a click — left as jest.fn() stubs.
jest.mock("../../../../services/member360LabService", () => ({
  fetchMember360MemberDetail: jest.fn(() =>
    Promise.resolve({
      member: {
        id: 1,
        member_key: "M360-0001",
        first_name: "Maria",
        last_name: "Hernandez",
        plan_name: "ProminenceCare Gold",
        line_of_business: "Medicare Advantage",
        risk_tier: "Critical",
        risk_score_composite: 8.6,
        clinical_risk_score: 9.1,
        utilization_risk_score: 8.2,
        cost_risk_score: 8.8,
        engagement_risk_score: 5.3,
        open_care_gaps: 4,
        preferred_channel: "Phone",
        primary_care_provider: "Dr. Whitley",
      },
      risk_insights: [
        {
          id: 1,
          domain: "Clinical",
          score: 9.1,
          driver: "Uncontrolled HbA1c",
          recommendation: "Schedule diabetes coaching",
          confidence: 0.92,
        },
      ],
      tasks: [],
      care_journeys: [],
      notes: [],
      messages: [],
      claims: [],
      accumulator: null,
      care_options: [],
      savings: [],
      documents: [],
      problems: [],
      medications: [],
      labs: [],
    })
  ),
  fetchMember360GapAnalysis: jest.fn(() =>
    Promise.resolve({
      member: { id: 1, member_key: "M360-0001", risk_tier: "Critical" },
      mao_records: [],
      missing_hcc: [],
      stale_records: [],
      immediate_actions: [],
      submission_year: 2026,
    })
  ),
  updateMember360Member: jest.fn(),
  createMember360Task: jest.fn(),
  updateMember360Task: jest.fn(),
  createMember360Note: jest.fn(),
  createMember360Message: jest.fn(),
  createMember360CareOption: jest.fn(),
  generateMember360SubmissionExport: jest.fn(),
  // Templates load on mount for the Start Journey dialog. Return an empty
  // list so the workspace still renders when the dialog is not opened.
  fetchMember360JourneyTemplates: jest.fn(() => Promise.resolve([])),
  createMember360CareJourney: jest.fn(),
  updateMember360CareJourney: jest.fn(),
  updateMember360CareJourneyStage: jest.fn(),
  uploadMember360Document: jest.fn(),
  downloadMember360Document: jest.fn(),
  fetchMember360MemberAudit: jest.fn(() => Promise.resolve({ items: [], total: 0 })),
}));

// Chart sub-pages live in `./chart/*.jsx`. CRA's Jest defaults don't
// auto-resolve `.jsx` from extension-less imports inside our chart folder,
// so we stub each as an empty React component. The default workspace tab
// is "timeline", so none of these are rendered by this smoke test anyway.
jest.mock("../chart/ProblemsHCCPage", () => () => null);
jest.mock("../chart/MedicationsPage", () => () => null);
jest.mock("../chart/LabsImagingPage", () => () => null);
jest.mock("../chart/CareGapsPage", () => () => null);
jest.mock("../chart/DocumentsPage", () => () => null);
jest.mock("../chart/AuditLogPage", () => () => null);
jest.mock("../chart/SharingPage", () => () => null);
jest.mock("../chart/SettingsPage", () => () => null);

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

const renderWorkspaceAt = (memberId) => {
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
  // The component reads memberId from URL params via useParams() — set up a
  // matching route inside MemoryRouter so the param resolves.
  render(
    <MemoryRouter initialEntries={[`/member360/members/${memberId}`]}>
      <AuthContext.Provider value={auth}>
        <Routes>
          <Route path="/member360/members/:memberId" element={<Member360LabWorkspace />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
};

describe("Member360LabWorkspace", () => {
  it("renders the member name after the detail fetch resolves", async () => {
    renderWorkspaceAt(1);

    // Wait for the loading state to clear and the member's name to render.
    // We look for it as text (the workspace puts it in the record header)
    // rather than role:heading so we don't tie the test to heading-level.
    await waitFor(() => {
      // Heading is "Maria Hernandez" — there will be multiple matches
      // (header + summary card), so getAllByText not getByText.
      const matches = screen.getAllByText(/Maria Hernandez/);
      expect(matches.length).toBeGreaterThan(0);
    });

    // The Timeline tab is the default — the workspace renders a tab list
    // with at least 'Timeline' visible
    expect(screen.getAllByText(/Timeline/i).length).toBeGreaterThan(0);
  });
});
