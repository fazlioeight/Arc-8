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

import PortalUtilityBar from '../../../components/PortalUtilityBar';
import { AuthContext } from '../../../context/AuthContext';
import { useCommandPalette } from '../../../context/CommandPaletteContext';
import { fetchProviderEducationDashboard } from '../../../services/codingService';
import CodingPortalHeader from './CodingPortalHeader';

const STATUS_VARIANTS = {
  completed: 'success',
  in_progress: 'warning',
  at_risk: 'danger',
};

const CodingProviderEducationPage = () => {
  const { token, tenant, recordAuditEvent } = useContext(AuthContext) || {};
  const { registerCommands } = useCommandPalette();

  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const effectiveToken = token || 'sample-provider-education';
  const effectiveTenant = tenant || 'prominencehealth';

  const loadProviders = async (nextSearch = search) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchProviderEducationDashboard(effectiveToken, effectiveTenant, { search: nextSearch });
      setItems(response.items || []);
      recordAuditEvent?.('coding.provider_education.load', { search: nextSearch });
    } catch (err) {
      setError(err.message || 'Unable to load provider education data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProviders();
    // eslint-disable-next-line
  }, [effectiveToken, effectiveTenant]);

  useEffect(() => {
    registerCommands([
      {
        id: 'provider-education-refresh',
        label: 'Refresh provider education dashboard',
        category: 'Coding',
        action: () => { void loadProviders(); },
      },
    ]);
    return () => registerCommands([]);
    // eslint-disable-next-line
  }, [registerCommands]);

  const handleSubmit = (event) => {
    event.preventDefault();
    void loadProviders(search);
  };

  const renderStatus = (status) => {
    if (!status) return <span className="text-muted">Unknown</span>;
    const variant = STATUS_VARIANTS[status] || 'secondary';
    return <Badge bg={variant}>{status.replace(/_/g, ' ')}</Badge>;
  };

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      <CodingPortalHeader
        title="Provider education dashboard"
        subtitle="Surface providers with open gaps and plan outreach based on recency."
      />

      <main className="container my-4">
        <Card className="shadow-sm">
          <Card.Header>
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center">
              <div>
                <h2 className="h5 mb-1">Provider education queue</h2>
                <div className="text-muted">Search by name, NPI, or tax ID.</div>
              </div>
              <div className="mt-2 mt-md-0">
                <Button variant="outline-primary" size="sm" onClick={() => void loadProviders()} disabled={loading}>
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
                  placeholder="Search providers"
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
                    <th>Provider</th>
                    <th>NPI</th>
                    <th>Tax ID</th>
                    <th>Members</th>
                    <th>Open gaps</th>
                    <th>MAO records</th>
                    <th>Last contacted</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={8} className="text-center py-4">
                        <Spinner animation="border" />
                      </td>
                    </tr>
                  )}
                  {!loading && items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted py-4">
                        No providers match the current filters.
                      </td>
                    </tr>
                  )}
                  {items.map((item) => (
                    <tr key={item.provider_id}>
                      <td>{item.name || '-'}</td>
                      <td>{item.npi || <span className="text-muted">N/A</span>}</td>
                      <td>{item.tax_id || <span className="text-muted">N/A</span>}</td>
                      <td>{item.member_count}</td>
                      <td>{item.open_gaps}</td>
                      <td>{item.mao_records}</td>
                      <td>{item.last_contacted_at ? new Date(item.last_contacted_at).toLocaleDateString() : <span className="text-muted">Unknown</span>}</td>
                      <td>{renderStatus(item.education_status)}</td>
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

export default CodingProviderEducationPage;
