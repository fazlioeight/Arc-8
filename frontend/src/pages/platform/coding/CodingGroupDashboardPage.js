import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
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
import { fetchGroupDashboard } from '../../../services/codingService';
import { CODING_NAV_ITEMS } from './codingNavItems';
import '../coding/member/memberWorkspace.css';

const CODING_GROUP_DASHBOARD_COMMAND_SCOPE = 'coding-group-dashboard-commands';

const CodingGroupDashboardPage = () => {
  const { token, tenant, recordAuditEvent } = useContext(AuthContext) || {};
  const { registerCommands } = useCommandPalette();

  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const effectiveToken = token || 'sample-group-dashboard';
  const effectiveTenant = tenant || 'prominencehealth';

  const loadGroups = React.useCallback(
    async (term = search) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchGroupDashboard(effectiveToken, effectiveTenant, { search: term });
        setItems(response.items || []);
        recordAuditEvent?.('coding.group_dashboard.load', { search: term });
      } catch (err) {
        setError(err.message || 'Unable to load group dashboard');
      } finally {
        setLoading(false);
      }
    },
    [effectiveTenant, effectiveToken, recordAuditEvent, search]
  );

  useEffect(() => {
    void loadGroups();
  }, [effectiveToken, effectiveTenant, loadGroups]);

  useEffect(() => {
    const unregister = registerCommands([
      {
        id: 'coding-group-dashboard-refresh',
        label: 'Refresh group dashboard',
        category: 'Coding',
        action: () => { void loadGroups(); },
      },
    ], { id: CODING_GROUP_DASHBOARD_COMMAND_SCOPE });
    return unregister;
  }, [registerCommands, loadGroups]);

  const handleSubmit = (event) => {
    event.preventDefault();
    void loadGroups(search);
  };

  const layoutProps = useMemo(
    () => ({
      backgroundClassName:
        '',
      maxWidthClassName: 'max-w-6xl',
      paddingClassName: 'px-4',
      navItems: CODING_NAV_ITEMS,
      currentNav: 'group',
      utilityBar: true,
    }),
    []
  );

  const groupCount = items.length;
  const openGaps = items.reduce((acc, item) => acc + (item.open_gaps || 0), 0);
  const pendingEd = items.reduce((acc, item) => acc + (item.pending_education || 0), 0);

  const headerContent = (
    <PortalPageHeader
      eyebrow="Coding"
      title="Group dashboard"
      subtitle="Monitor provider groups, open gaps, and risk mix across your panel."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Groups" value={groupCount} meta="Queues" tone="info" />
          <PortalStat label="Open gaps" value={openGaps} meta="Outstanding" tone="warning" />
          <PortalStat label="Education" value={pendingEd} meta="Pending" tone="success" />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      <PortalCard
        title="Provider group summary"
        subtitle="Aggregated counts by tax ID or group identifier."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Form.Control
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search groups"
              style={{ minWidth: 220 }}
            />
            <Button type="button" variant="primary" onClick={() => void loadGroups()} disabled={loading}>
              {loading ? <Spinner animation="border" size="sm" /> : 'Search'}
            </Button>
          </div>
        }
      >
        <Form onSubmit={handleSubmit} className="mb-3 d-none">
          <div className="d-flex gap-2">
            <Form.Control
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search groups"
            />
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? <Spinner animation="border" size="sm" /> : 'Apply'}
            </Button>
          </div>
        </Form>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="table-responsive">
          <Table hover responsive className="align-middle">
            <thead>
              <tr>
                <th>Group</th>
                <th>Tax ID</th>
                <th>Providers</th>
                <th>Members</th>
                <th>Open gaps</th>
                <th>Pending education</th>
                <th>Avg RAF</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-4">
                    <Spinner animation="border" />
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    No groups match the current filters.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.group_key}>
                  <td>{item.group_name || '-'}</td>
                  <td>{item.tax_id || <span className="text-muted">N/A</span>}</td>
                  <td>{item.provider_count}</td>
                  <td>{item.member_count}</td>
                  <td>{item.open_gaps}</td>
                  <td>{item.pending_education}</td>
                  <td>{item.average_risk_score?.toFixed ? item.average_risk_score.toFixed(2) : item.average_risk_score}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </PortalCard>
    </PortalPageLayout>
  );
};

export default CodingGroupDashboardPage;
