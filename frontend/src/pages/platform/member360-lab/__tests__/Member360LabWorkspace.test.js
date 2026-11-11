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
  fetchMember360MemberDetail: () =>
    Promise.resolve({
      member: {
        id: 1,
        member_key: "M360-0001",
        first_name: "Maria",
        last_name: "Hernandez",
        date_of_birth: "1955-03-30",
        age: 71,
        gender: "F",
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
      coverages: [
        {
          id: 1,
          member_id: 1,
          plan_name: "ProminenceCare Gold",
          line_of_business: "Medicare Advantage",
          coverage_status: "active",
          effective_date: "2026-01-01",
          term_date: "2026-12-31",
          coverage_tier: "Individual",
          relationship_to_subscriber: "subscriber",
          is_primary: true,
        },
      ],
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
      care_journeys: [
        {
          id: 10,
          member_id: 1,
          name: "Post-Discharge Follow-Up",
          status: "active",
          assigned_to: "care.team@prominencehealth.com",
          start_date: "2026-09-01",
          stages: [
            {
              id: 100,
              sequence: 0,
              name: "Discharge intake",
              status: "completed",
              completed_at: "2026-09-02T12:00:00Z",
            },
          ],
        },
      ],
      notes: [],
      messages: [],
      claims: [],
      accumulator: null,
      care_options: [],
      savings: [],
      documents: [],
      problems: [],
      medications: [
        {
          id: 20,
          member_id: 1,
          rx_number: "RX-1001",
          drug_name: "Insulin glargine 100u/ml",
          refills_remaining: 0,
          prescriber: "Dr. Whitley",
          pharmacy: "CVS Pharmacy",
          status: "active",
        },
      ],
      labs: [],
    }),
  fetchMember360GapAnalysis: () =>
    Promise.resolve({
      member: { id: 1, member_key: "M360-0001", risk_tier: "Critical" },
      mao_records: [],
      missing_hcc: [],
      stale_records: [],
      immediate_actions: [],
      submission_year: 2026,
    }),
  updateMember360Member: () => Promise.resolve({}),
  createMember360Task: () => Promise.resolve({}),
  updateMember360Task: () => Promise.resolve({}),
  createMember360Note: () => Promise.resolve({}),
  createMember360Message: () => Promise.resolve({}),
  createMember360CareOption: () => Promise.resolve({}),
  generateMember360SubmissionExport: () => Promise.resolve({}),
  // Templates load on mount for the Start Journey dialog. Return an empty
  // list so the workspace still renders when the dialog is not opened.
  fetchMember360JourneyTemplates: () => Promise.resolve([]),
  createMember360CareJourney: () => Promise.resolve({}),
  updateMember360CareJourney: () => Promise.resolve({}),
  updateMember360CareJourneyStage: () => Promise.resolve({}),
  uploadMember360Document: () => Promise.resolve({}),
  downloadMember360Document: () => Promise.resolve({}),
  fetchMember360MemberAudit: () => Promise.resolve({ items: [], total: 0 }),
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
    toggleFavorite: () => {},
    isFavorite: () => false,
    isNavItemEnabled: () => true,
    recordViewPreference: () => {},
    getViewPreference: () => null,
    markNotificationRead: () => {},
    navVisibility: {},
    updateRoleMenus: () => {},
    setNavVisibility: () => {},
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
  it("renders the member name, demographics, eligibility, care team, and header alerts", async () => {
    renderWorkspaceAt(1);

    await waitFor(() => {
      const matches = screen.getAllByText(/Maria Hernandez/);
      expect(matches.length).toBeGreaterThan(0);
    });

    // Timeline tab is default and renders recent touchpoints including journey stages
    expect(screen.getAllByText(/Timeline/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Journey stage completed · Discharge intake/i).length).toBeGreaterThan(0);

    // Demographics, Eligibility & Plan, and Care Team sections render
    expect(screen.getAllByText(/Demographics & Contact/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Eligibility & Plan/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Care Team/i).length).toBeGreaterThan(0);

    // Header alerts for active journey and 0-refill Rx render
    expect(screen.getAllByText(/1 active journey/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rx alert: 1 w\/ 0 refills/i).length).toBeGreaterThan(0);
  });
});
