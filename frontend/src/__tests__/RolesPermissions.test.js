import {
  ROLES,
  ROLE_DEFINITIONS,
  DEFAULT_ROLE_PERMISSIONS,
  DEMO_PERSONAS,
} from '../constants/permissions';

describe('Role-Based Access Control & Deny-by-Default Persona Authority', () => {
  test('all 4 target personas are defined in ROLES constant', () => {
    expect(ROLES.COORDINATOR).toBe('coordinator');
    expect(ROLES.SUPERVISOR).toBe('supervisor');
    expect(ROLES.BUSINESS_ADMIN).toBe('business_admin');
    expect(ROLES.COMPLIANCE_AUDITOR).toBe('compliance_auditor');
  });

  test('ROLE_DEFINITIONS contains metadata for all 4 personas', () => {
    const roleKeys = ROLE_DEFINITIONS.map((r) => r.key);
    expect(roleKeys).toContain('coordinator');
    expect(roleKeys).toContain('supervisor');
    expect(roleKeys).toContain('business_admin');
    expect(roleKeys).toContain('compliance_auditor');
  });

  describe('Deny-by-Default Permission Boundaries', () => {
    test('Coordinator can access clinical tabs but is denied audit and settings tabs', () => {
      const perms = DEFAULT_ROLE_PERMISSIONS[ROLES.COORDINATOR];
      expect(perms).toContain('tab:timeline');
      expect(perms).toContain('tab:notes');
      expect(perms).toContain('tab:care_journey');
      expect(perms).toContain('tab:clinical_gaps');
      expect(perms).toContain('tab:medications_labs');

      // Denied by default
      expect(perms).not.toContain('tab:audit_log');
      expect(perms).not.toContain('tab:settings');
      expect(perms).not.toContain('sub:gov_master_admin');
      expect(perms).not.toContain('menu:governance_admin');
    });

    test('Supervisor can access clinical tabs + audit log + settings + escalations', () => {
      const perms = DEFAULT_ROLE_PERMISSIONS[ROLES.SUPERVISOR];
      expect(perms).toContain('tab:timeline');
      expect(perms).toContain('tab:notes');
      expect(perms).toContain('tab:care_journey');
      expect(perms).toContain('tab:audit_log');
      expect(perms).toContain('tab:settings');
      expect(perms).toContain('sub:exec_operational');

      // Denied system admin console
      expect(perms).not.toContain('sub:gov_master_admin');
    });

    test('Business Admin can access governance and admin templates, but has restricted clinical notes authoring', () => {
      const perms = DEFAULT_ROLE_PERMISSIONS[ROLES.BUSINESS_ADMIN];
      expect(perms).toContain('menu:governance_admin');
      expect(perms).toContain('sub:gov_master_admin');
      expect(perms).toContain('sub:gov_role_allotment');
      expect(perms).toContain('tab:audit_log');
      expect(perms).toContain('tab:settings');

      // Denied clinical encounters
      expect(perms).not.toContain('tab:notes');
      expect(perms).not.toContain('tab:care_journey');
    });

    test('Compliance Auditor has read-only audit log and chart review, denied notes and administrative configs', () => {
      const perms = DEFAULT_ROLE_PERMISSIONS[ROLES.COMPLIANCE_AUDITOR];
      expect(perms).toContain('tab:timeline');
      expect(perms).toContain('tab:audit_log');
      expect(perms).toContain('sub:gov_audit_trail');

      // Denied mutation tabs
      expect(perms).not.toContain('tab:notes');
      expect(perms).not.toContain('tab:care_journey');
      expect(perms).not.toContain('tab:settings');
      expect(perms).not.toContain('sub:gov_master_admin');
    });
  });

  test('DEMO_PERSONAS provides quick testing accounts for all 4 roles', () => {
    const personaRoles = DEMO_PERSONAS.map((p) => p.role);
    expect(personaRoles).toContain('coordinator');
    expect(personaRoles).toContain('supervisor');
    expect(personaRoles).toContain('business_admin');
    expect(personaRoles).toContain('compliance_auditor');
  });
});
