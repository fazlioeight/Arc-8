import React, { useContext, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Spinner,
  Table,
} from 'react-bootstrap';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import { AuthContext } from '../../context/AuthContext';
import { useCommandPalette } from '../../context/CommandPaletteContext';
import { fetchGroupDashboard } from '../../services/codingService';
import CodingPortalHeader from './CodingPortalHeader';

const CodingGroupDashboardPage = () => {
  const { token, tenant, recordAuditEvent } = useContext(AuthContext) || {};
  const { registerCommands } = useCommandPalette();

  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const effectiveToken = token || 'sample-group-dashboard';
  const effectiveTenant = tenant || 'demo';

  const loadGroups = async (term = search) => {
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
  };

  useEffect(() => {
    void loadGroups();
    // eslint-disable-next-line
  }, [effectiveToken, effectiveTenant]);

  useEffect(() => {
    registerCommands([
      {
        id: 'coding-group-dashboard-refresh',
        label: 'Refresh group dashboard',
        category: 'Coding',
        action: () => { void loadGroups(); },
      },
    ]);
    return () => registerCommands([]);
    // eslint-disable-next-line
  }, [registerCommands]);

  const handleSubmit = (event) => {
    event.preventDefault();
    void loadGroups(search);
  };

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <CodingPortalHeader
        title="Group dashboard"
        subtitle="Monitor provider groups, open gaps, and risk mix across your panel."
      />

      <main className="container my-4">
        <Card className="shadow-sm">
          <Card.Header>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center">
              <div>
                <h2 className="h5 mb-1">Provider group summary</h2>
                <div className="text-muted">Aggregated counts by tax ID or group identifier.</div>
              </div>
              <div className="mt-2 mt-md-0">
                <Button variant="outline-primary" size="sm" onClick={() => void loadGroups()} disabled={loading}>
                  {loading ? <Spinner animation="border" size="sm" /> : 'Refresh'}
                </Button>
              </div>
            </div>
          </Card.Header>
          <Card.Body>
            <Form onSubmit={handleSubmit} className="mb-3">
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
          </Card.Body>
        </Card>
      </main>
    </div>
  );
};

export default CodingGroupDashboardPage;
