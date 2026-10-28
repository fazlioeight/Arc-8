import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

jest.unmock("react-router-dom");
const { MemoryRouter } = jest.requireActual("react-router-dom");

import Member360LabAdminPage from "../Member360LabAdminPage";
import { AuthContext } from "../../../../context/AuthContext";

// Jest hoists jest.mock() calls above module-level declarations, so the
// factory closure can only reference vars whose names start with `mock`
// (case insensitive). All seed rows + captured-mock spies follow that
// convention so the factory can see them.
const mockTemplateRow = {
  id: 1,
  name: "CHF 30-day",
  description: "Post-discharge protocol",
  category: "Cardiac",
  recommended_for_risk_tier: "High",
  default_stages: [{ sequence: 0, name: "Intake", status: "pending" }],
  default_tasks: [],
};
const mockRiskRuleRow = {
  id: 11,
  name: "Uncontrolled HbA1c",
  domain: "Clinical",
  weight: 1.5,
  threshold: 9.0,
  is_active: true,
};
const mockQueueRow = {
  id: 21,
  name: "RN",
  description: "RN outreach",
  sla_priority_hours: { urgent: 1, high: 4 },
  escalation_queue: "MD",
  routing_rules: {},
  is_active: true,
};
const mockChannelRow = {
  id: 31,
  channel_type: "SMS",
  provider: "dryrun",
  consent_required: false,
  preferred_languages: ["en"],
  config: {},
  is_active: true,
};
const mockPolicyRow = {
  id: 41,
  service_type: "MRI - Shoulder",
  line_of_business: "Commercial",
  max_distance_miles: 25,
  min_quality_score: 4,
  min_savings_threshold: 500,
  network_tier: "In Network",
  is_active: true,
};

const mockCreateTemplate = jest.fn(() => Promise.resolve({ ...mockTemplateRow, id: 99 }));
const mockUpdateRiskRule = jest.fn(() => Promise.resolve(mockRiskRuleRow));
const mockDeleteQueue = jest.fn(() => Promise.resolve(null));

jest.mock("../../../../services/member360AdminService", () => ({
  fetchTemplates: jest.fn(() => Promise.resolve([mockTemplateRow])),
  createTemplate: (...args) => mockCreateTemplate(...args),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),

  fetchRiskRules: jest.fn(() => Promise.resolve([mockRiskRuleRow])),
  createRiskRule: jest.fn(),
  updateRiskRule: (...args) => mockUpdateRiskRule(...args),
  deleteRiskRule: jest.fn(),

  fetchTaskQueues: jest.fn(() => Promise.resolve([mockQueueRow])),
  createTaskQueue: jest.fn(),
  updateTaskQueue: jest.fn(),
  deleteTaskQueue: (...args) => mockDeleteQueue(...args),

  fetchOutreachChannels: jest.fn(() => Promise.resolve([mockChannelRow])),
  createOutreachChannel: jest.fn(),
  updateOutreachChannel: jest.fn(),
  deleteOutreachChannel: jest.fn(),

  fetchCareOptionPolicies: jest.fn(() => Promise.resolve([mockPolicyRow])),
  createCareOptionPolicy: jest.fn(),
  updateCareOptionPolicy: jest.fn(),
  deleteCareOptionPolicy: jest.fn(),

  fetchAuditEvents: jest.fn(() => Promise.resolve({ items: [], total: 0 })),
}));

jest.mock("../../../../context/UserPreferencesContext", () => ({
  useUserPreferences: () => ({
    favorites: [], toggleFavorite: jest.fn(), isFavorite: jest.fn(),
    isNavItemEnabled: jest.fn(() => true),
    recordViewPreference: jest.fn(), getViewPreference: jest.fn(),
    markNotificationRead: jest.fn(),
    navVisibility: {}, updateRoleMenus: jest.fn(), setNavVisibility: jest.fn(),
    viewPreferences: {}, notificationPrefs: { dismissed: [], lastRead: null },
  }),
}));

const renderAdmin = () => {
  const auth = {
    token: "sample-token",
    tenant: "sample-tenant",
    user: { email: "admin@arc8.test", role: "admin" },
    hasApplicationAccess: () => true,
    availableApplications: ["portal", "member360"],
    purchasedApplications: ["portal", "member360"],
    availableTenants: [{ key: "sample-tenant", name: "Sample Tenant" }],
    tenantInfo: { key: "sample-tenant", name: "Sample Tenant" },
    setTenant: jest.fn(), logout: jest.fn(),
    isImpersonating: false, impersonation: null, endImpersonation: jest.fn(),
    auditTrail: [], recordAuditEvent: jest.fn(),
  };
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <Member360LabAdminPage />
      </AuthContext.Provider>
    </MemoryRouter>
  );
};

describe("Member360LabAdminPage", () => {
  beforeEach(() => {
    mockCreateTemplate.mockClear();
    mockUpdateRiskRule.mockClear();
    mockDeleteQueue.mockClear();
    // Stub window.confirm so the delete test doesn't open a real native dialog.
    jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders every section + seed row + per-section Add buttons", async () => {
    renderAdmin();

    // All five section headers are present.
    for (const title of [
      "Care journey templates",
      "Risk rules & insight catalog",
      "Task queues & routing",
      "Outreach channels & integrations",
      "Care options policies",
    ]) {
      await screen.findByText(title);
    }

    // Seed row names land in the tables.
    expect(screen.getByText("CHF 30-day")).toBeInTheDocument();
    expect(screen.getByText("Uncontrolled HbA1c")).toBeInTheDocument();
    expect(screen.getByText("RN")).toBeInTheDocument();
    expect(screen.getByText("MRI - Shoulder")).toBeInTheDocument();

    // One "+ Add" button per section.
    const addButtons = screen.getAllByRole("button", { name: /\+ add/i });
    expect(addButtons).toHaveLength(5);
  });

  it("opens the edit drawer prefilled when Edit is clicked on a risk rule", async () => {
    renderAdmin();
    await screen.findByText("Uncontrolled HbA1c");

    // Each row has its own Edit button — pick the one in the row that
    // contains the seeded risk rule name.
    const ruleRow = screen.getByText("Uncontrolled HbA1c").closest("tr");
    const editBtn = ruleRow.querySelector("button");
    // First button in the action cell is Edit; click it.
    const buttons = ruleRow.querySelectorAll("button");
    fireEvent.click(buttons[buttons.length - 2]);  // Edit precedes Delete

    // Drawer title reflects the singular for this section.
    await screen.findByText(/edit risk rule/i);
    // Name input is prefilled.
    const nameInput = screen.getByDisplayValue("Uncontrolled HbA1c");
    expect(nameInput).toBeInTheDocument();
  });

  it("Add → fill required name → Create calls createTemplate with the payload", async () => {
    renderAdmin();
    await screen.findByText("Care journey templates");

    // First "+ Add" belongs to the first section (templates).
    const addButtons = screen.getAllByRole("button", { name: /\+ add/i });
    fireEvent.click(addButtons[0]);

    // Drawer opened in Add mode. Scope further lookups to the dialog so
    // the form's "Name" label doesn't collide with the "Name" column
    // header in the visible table behind it.
    await screen.findByText(/add template/i);
    const dialog = screen.getByRole("dialog");
    const nameLabel = within(dialog).getByText(/^Name$/i);
    const nameInput = nameLabel.parentElement.querySelector("input");
    fireEvent.change(nameInput, { target: { value: "Brand new template" } });

    // Submit.
    fireEvent.click(within(dialog).getByRole("button", { name: /create/i }));

    await waitFor(() => expect(mockCreateTemplate).toHaveBeenCalledTimes(1));
    const [, , payload] = mockCreateTemplate.mock.calls[0];
    expect(payload.name).toBe("Brand new template");
    // JSON-typed fields seeded with their defaultValue should still be present.
    expect(Array.isArray(payload.default_stages)).toBe(true);
  });

  it("Delete on a row calls the section's delete service after confirm", async () => {
    renderAdmin();
    await screen.findByText("RN");

    const queueRowEl = screen.getByText("RN").closest("tr");
    const buttons = queueRowEl.querySelectorAll("button");
    // Last button in the action cell is Delete.
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(mockDeleteQueue).toHaveBeenCalledTimes(1));
    // (token, tenant, id) — id is the seeded queue row's id.
    expect(mockDeleteQueue.mock.calls[0][2]).toBe(21);
  });
});
