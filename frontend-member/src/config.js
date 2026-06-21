// Runtime configuration: API base + per-tenant resolution for white-labeling.

export const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

/**
 * Resolve the tenant key this portal instance serves.
 * Priority: explicit env override -> host subdomain -> 'default'.
 * The member portal is deployed per tenant (one subdomain each), so the
 * subdomain is the natural source of truth in production.
 */
export function resolveTenantKey() {
  const fromEnv = process.env.REACT_APP_TENANT_KEY;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname || '';
    const parts = host.split('.');
    // e.g. prominencehealth.portal.example.com -> prominencehealth
    if (parts.length > 2 && parts[0] && parts[0] !== 'www') {
      return parts[0];
    }
  }
  return 'default';
}

export const TENANT_KEY = resolveTenantKey();

// localStorage key is tenant-scoped so two tenants opened in one browser don't
// clobber each other's session.
export const SESSION_STORAGE_KEY = `nexora.member.session.${TENANT_KEY}`;
export const LANG_STORAGE_KEY = `nexora.member.lang.${TENANT_KEY}`;
