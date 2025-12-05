import React, { useContext, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Form,
  Spinner,
  Table,
} from 'react-bootstrap';

import PortalPageLayout from '../../../components/PortalPageLayout';
import PortalPageHeader from '../../../components/PortalPageHeader';
import PortalCard from '../../../components/PortalCard';
import PortalStat from '../../../components/PortalStat';
import { AuthContext } from '../../../context/AuthContext';
import { useCommandPalette } from '../../../context/CommandPaletteContext';
import { fetchProviderEducationDashboard } from '../../../services/codingService';
import '../coding/member/memberWorkspace.css';
import { CODING_NAV_ITEMS } from './codingNavItems';

const STATUS_VARIANTS = {
  completed: 'success',
  in_progress: 'warning',
  queued: 'info',
};

const CODING_PROVIDER_EDU_COMMAND_SCOPE = 'coding-provider-education-commands';

const CodingProviderEducationPage = () => {
  const { token, tenant, recordAuditEvent } = useContext(AuthContext) || {};
  const { registerCommands } = useCommandPalette();

  const [filters, setFilters] = useState({ status: '', search: '' });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const effectiveToken = token || 'sample-provider-education';
  const effectiveTenant = tenant || 'prominencehealth';

  const loadEducation = async (overrides = {}) => {
    setLoading(true);
    setError(null);
    const nextFilters = { ...filters, ...overrides };
    try {
      const response = await fetchProviderEducationDashboard(effectiveToken, effectiveTenant, nextFilters);
      setItems(response.items || []);
      recordAuditEvent?.('coding.provider_education.load', { filters: nextFilters });
    } catch (err) {
      setError(err.message || 'Unable to load education dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEducation();
  }, [effectiveTenant, effectiveToken]);

  useEffect(() => {
    const unregister = registerCommands([
      {
        id: 'provider-education-refresh',
        label: 'Refresh provider education',
        category: 'Coding',
        action: () => void loadEducation(),
      },
    ], { id: CODING_PROVIDER_EDU_COMMAND_SCOPE });
    return unregister;
  }, [registerCommands]);

  const layoutProps = {
    backgroundClassName: 'coding-member-workspace portal-theme bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100',
    maxWidthClassName: 'max-w-6xl',
    paddingClassName: 'px-4',
    navItems: CODING_NAV_ITEMS,
    currentNav: 'providers',
    utilityBar: true,
  };

  const headerContent = (
    <PortalPageHeader
      eyebrow="Coding"
      title="Provider education"
      subtitle="Track training modules, completion, and queued sessions for providers."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Providers" value={items.length} meta="Matching" tone="info" />
          <PortalStat label="Completed" value={items.filter((item) => item.status === 'completed').length} meta="Done" tone="success" />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      <PortalCard
        title="Filters"
        subtitle="Filter provider education status."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline-primary" size="sm" onClick={() => void loadEducation()} disabled={loading}>
              {loading ? <Spinner animation="border" size="sm" /> : 'Refresh'}
            </Button>
          </div>
        }
      >
        <Form className="portal-section-grid" onSubmit={(event) => { event.preventDefault(); void loadEducation(); }}>
          <div className="space-y-2">
            <Form.Label>Status</Form.Label>
            <Form.Select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In progress</option>
              <option value="queued">Queued</option>
            </Form.Select>
          </div>
          <div className="space-y-2">
            <Form.Label>Search</Form.Label>
            <Form.Control
              placeholder="Provider name"
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            />
          </div>
        </Form>
        {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
      </PortalCard>

      <PortalCard title="Education dashboard" subtitle="Training progress by provider.">
        <div className="table-responsive">
          <Table hover responsive className="align-middle">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Modules</th>
                <th>Assigned</th>
                <th>Completed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="text-center py-4">
                    <Spinner animation="border" />
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-4 text-muted">
                    No providers match the current filters.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="fw-semibold">{item.name}</div>
                    <div className="text-muted small">NPI {item.npi}</div>
                  </td>
                  <td><Badge bg={STATUS_VARIANTS[item.status] || 'secondary'}>{item.status}</Badge></td>
                  <td>{item.modules_assigned}</td>
                  <td>{item.assigned_at || '-'}</td>
                  <td>{item.completed_at || '-'}</td>
                  <td className="text-end">
                    <Button variant="link" size="sm">
                      Open details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </PortalCard>
    </PortalPageLayout>
  );
};

export default CodingProviderEducationPage;
