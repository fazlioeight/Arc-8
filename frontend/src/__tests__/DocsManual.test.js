import {
  ALL_MANUAL_ROLES,
  DEFAULT_MANUAL_ARTICLES,
  filterManualArticlesLocally,
  searchDocsArticles,
} from '../services/docsService';
import { ROLES } from '../constants/permissions';

describe('HIPAA Role-Based Searchable User Manual (docsService)', () => {
  test('seeds all 9 comprehensive system manual chapters across all platform modules', () => {
    expect(DEFAULT_MANUAL_ARTICLES.length).toBeGreaterThanOrEqual(9);
    expect(ALL_MANUAL_ROLES.length).toBe(12);
  });

  test('System Admin and Platform Admin see all 9 manual chapters', () => {
    const adminDocs = filterManualArticlesLocally({ role: ROLES.ADMIN });
    const platformAdminDocs = filterManualArticlesLocally({ role: ROLES.PLATFORM_ADMIN });
    expect(adminDocs.length).toBe(DEFAULT_MANUAL_ARTICLES.length);
    expect(platformAdminDocs.length).toBe(DEFAULT_MANUAL_ARTICLES.length);
  });

  test('Patient / Member role only sees general & self-service chapters (HIPAA Minimum Necessary)', () => {
    const patientDocs = filterManualArticlesLocally({ role: ROLES.PATIENT });
    const titles = patientDocs.map((a) => a.title);

    // Patient can see Getting Started, Providers/NEMT Rides, and Member Self-Service Portal
    expect(titles.some((t) => t.includes('Member Self-Service Portal'))).toBe(true);
    expect(titles.some((t) => t.includes('Getting Started'))).toBe(true);

    // Patient is strictly denied internal clinical coding, SFTP APIs, and admin RBAC chapters
    expect(titles.some((t) => t.includes('Suspect Workbench'))).toBe(false);
    expect(titles.some((t) => t.includes('17-Feed UHS SFTP'))).toBe(false);
    expect(titles.some((t) => t.includes('12-Role RBAC Matrix'))).toBe(false);
  });

  test('Risk Adjustment Coder sees HCC v28 Coding Workbench and Member 360, but not Admin SFTP or RBAC Admin chapters', () => {
    const coderDocs = filterManualArticlesLocally({ role: ROLES.CODER });
    const titles = coderDocs.map((a) => a.title);

    expect(titles.some((t) => t.includes('Suspect Workbench'))).toBe(true);
    expect(titles.some((t) => t.includes('Member 360'))).toBe(true);
    expect(titles.some((t) => t.includes('17-Feed UHS SFTP'))).toBe(false);
    expect(titles.some((t) => t.includes('12-Role RBAC Matrix'))).toBe(false);
  });

  test('Care Coordinator sees clinical Member 360, Tasks & Journeys, Providers/NEMT, but is denied Admin RBAC & SFTP ingestion chapters', () => {
    const coordDocs = filterManualArticlesLocally({ role: ROLES.COORDINATOR });
    const titles = coordDocs.map((a) => a.title);

    expect(titles.some((t) => t.includes('Member 360'))).toBe(true);
    expect(titles.some((t) => t.includes('Clinical Tasks'))).toBe(true);
    expect(titles.some((t) => t.includes('NEMT Ride Booking'))).toBe(true);
    expect(titles.some((t) => t.includes('17-Feed UHS SFTP'))).toBe(false);
    expect(titles.some((t) => t.includes('12-Role RBAC Matrix'))).toBe(false);
  });

  test('Supervisor and Compliance Auditor can access the HIPAA Governance & Audit Log Compliance manual', () => {
    const supDocs = filterManualArticlesLocally({ role: ROLES.SUPERVISOR });
    const auditorDocs = filterManualArticlesLocally({ role: ROLES.COMPLIANCE_AUDITOR });

    expect(supDocs.some((a) => a.title.includes('HIPAA Governance'))).toBe(true);
    expect(auditorDocs.some((a) => a.title.includes('HIPAA Governance'))).toBe(true);
  });

  test('full-text search filters across titles, summaries, markdown content, and tags within role scope', async () => {
    const res = await searchDocsArticles({
      token: 'sample-token',
      tenant: 'prominencehealth',
      query: 'M.E.A.T.',
      role: ROLES.CODER,
    });
    expect(res.hipaa_compliant).toBe(true);
    expect(res.audit_logged).toBe(true);
    expect(res.articles.length).toBe(1);
    expect(res.articles[0].title).toContain('Suspect Workbench');

    // Searching for M.E.A.T. as a Patient returns 0 results due to role scoping
    const patientRes = await searchDocsArticles({
      token: 'sample-token',
      tenant: 'prominencehealth',
      query: 'M.E.A.T.',
      role: ROLES.PATIENT,
    });
    expect(patientRes.articles.length).toBe(0);
  });
});
