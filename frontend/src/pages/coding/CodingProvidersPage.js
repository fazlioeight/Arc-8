import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Form, ListGroup, Row, Spinner, Table } from 'react-bootstrap';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import { AuthContext } from '../../context/AuthContext';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import {
  fetchCodingProviderDetail,
  fetchCodingProviders,
} from '../../services/codingService';
import CodingPortalHeader from './CodingPortalHeader';
import InfoTooltip from '../../components/ui/InfoTooltip';
import EmptyState from '../../components/ui/EmptyState';

const CodingProvidersPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, tenant, isAuthenticated } = useContext(AuthContext) || {};
  const { getViewPreference, recordViewPreference } = useUserPreferences();
  const canQuery = useMemo(() => token && tenant, [token, tenant]);

  const [providers, setProviders] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const loadProviders = async (term = search) => {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCodingProviders(token, tenant, { search: term });
      setProviders(response.items || []);
      setTotal(response.total || 0);
    } catch (err) {
      setError(err.message || 'Unable to load providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !canQuery) return;
    const saved = getViewPreference('coding-providers');
    const initialSearch = saved?.search || '';
    setSearch(initialSearch);
    void loadProviders(initialSearch);
    if (saved?.lastSelected) {
      void selectProvider(saved.lastSelected);
    }
    // eslint-disable-next-line
  }, [isAuthenticated, canQuery, getViewPreference]);

  const selectProvider = async providerId => {
    if (!canQuery) return;
    setDetailLoading(true);
    setError(null);
    try {
      const detail = await fetchCodingProviderDetail(token, tenant, providerId);
      setSelectedProvider(detail);
      recordViewPreference('coding-providers', { search, lastSelected: providerId });
    } catch (err) {
      setError(err.message || 'Unable to load provider detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmit = event => {
    event.preventDefault();
    recordViewPreference('coding-providers', { search, lastSelected: selectedProvider?.id });
    void loadProviders(search);
  };

  if (!isAuthenticated) {
    const header = (
      <CodingPortalHeader
        title="Coding provider directory"
        subtitle="Search contracted providers and review locations or contact details."
      />
    );
    return (
      <div className="sfdc-portal coding-portal">
        <PortalUtilityBar />
        {header}
        <div className="coding-content container py-5">
          <Alert variant="warning">You must be logged in to view provider information.</Alert>
        </div>
      </div>
    );
  }

  const header = (
    <CodingPortalHeader
      title="Coding provider directory"
      subtitle="Search contracted providers and review locations or contact details."
    />
  );

  return (
    <div className="sfdc-portal coding-portal">
      <PortalUtilityBar />
      {header}
      <div className="coding-content container py-4">
        <Form onSubmit={handleSubmit} className="mb-3">
          <Row className="g-2 align-items-end">
            <Col md={6}>
              <Form.Label htmlFor="provider-search">Search providers</Form.Label>
              <Form.Control
                id="provider-search"
                placeholder="Name, NPI, or Tax ID"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <Form.Text className="text-muted">Use NPI or tax ID for the most precise matches.</Form.Text>
            </Col>
            <Col md={2} className="d-grid">
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner size="sm" animation="border" /> : 'Search'}
              </Button>
            </Col>
            <Col md={2} className="d-grid">
              <Button variant="outline-secondary" onClick={() => void loadProviders()} disabled={loading}>
                Refresh
              </Button>
            </Col>
            <Col md={2} className="d-grid">
              <Button variant="outline-secondary" onClick={() => setSelectedProvider(null)}>
                Clear selection
              </Button>
            </Col>
          </Row>
        </Form>
        {error && <Alert variant="danger">{error}</Alert>}
        <Row className="g-4">
          <Col md={7}>
            <Card>
              <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-semibold">Providers</span>
                  <InfoTooltip
                    content="Directory of contracted providers and quick links to manage their profiles."
                    placement="right"
                  />
                </div>
                <span className="text-muted small">Total {total}</span>
              </Card.Header>
              <Card.Body className="p-0">
                <Table hover responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>NPI</th>
                      <th>Tax ID</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={4} className="text-center py-3">
                          <Spinner animation="border" />
                        </td>
                      </tr>
                    )}
                    {!loading && providers.length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          <EmptyState
                            icon="search"
                            title="No providers found"
                            description="Adjust your search or sync a fresh provider roster to populate this list."
                          >
                            <Button variant="outline-primary" size="sm" onClick={() => void loadProviders()} disabled={loading}>
                              Refresh list
                            </Button>
                            <Button variant="link" size="sm" href="/jobs/import-data">
                              Open data imports
                            </Button>
                          </EmptyState>
                        </td>
                      </tr>
                    )}
                    {providers.map(provider => (
                      <tr
                        key={provider.id}
                        onClick={() => void selectProvider(provider.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{provider.name}</td>
                        <td>{provider.npi || '-'}</td>
                        <td>{provider.tax_id || '-'}</td>
                        <td className="text-end">
                          <InfoTooltip content="Open the full provider workspace" placement="left">
                            <Button
                              variant="link"
                              size="sm"
                              onClick={event => {
                                event.stopPropagation();
                                navigate(`/coding/providers/${provider.id}`, {
                                  state: {
                                    from: `${location.pathname}${location.search}`,
                                    breadcrumb: provider.name || provider.npi,
                                  },
                                });
                              }}
                            >
                              Open
                            </Button>
                          </InfoTooltip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
          <Col md={5}>
            <Card>
              <Card.Header className="d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-semibold">Provider details</span>
                  <InfoTooltip
                    content="Review key contact info, location, and quick links for the selected provider."
                    placement="left"
                  />
                </div>
              </Card.Header>
              <Card.Body>
                {detailLoading && (
                  <div className="text-center">
                    <Spinner animation="border" />
                  </div>
                )}
                {!detailLoading && !selectedProvider && (
                  <EmptyState
                    icon="info"
                    title="Select a provider"
                    description="Choose a provider from the table to view contact information and locations."
                  >
                    <Button variant="outline-primary" size="sm" onClick={() => void loadProviders()} disabled={loading}>
                      Refresh list
                    </Button>
                  </EmptyState>
                )}
                {!detailLoading && selectedProvider && (
                  <ListGroup variant="flush">
                    <ListGroup.Item><strong>Name:</strong> {selectedProvider.name}</ListGroup.Item>
                    <ListGroup.Item><strong>NPI:</strong> {selectedProvider.npi || '-'}</ListGroup.Item>
                    <ListGroup.Item><strong>Tax ID:</strong> {selectedProvider.tax_id || '-'}</ListGroup.Item>
                    <ListGroup.Item><strong>Phone:</strong> {selectedProvider.phone || '-'}</ListGroup.Item>
                    <ListGroup.Item><strong>Email:</strong> {selectedProvider.email || '-'}</ListGroup.Item>
                    <ListGroup.Item>
                      <strong>Location:</strong>
                      <div>
                        {selectedProvider.location
                          ? [
                              selectedProvider.location.address_line1,
                              selectedProvider.location.city,
                              selectedProvider.location.state,
                              selectedProvider.location.postal_code,
                            ]
                              .filter(Boolean)
                              .join(', ')
                          : '-'}
                      </div>
                    </ListGroup.Item>
                    <ListGroup.Item className="d-flex justify-content-end">
                      <InfoTooltip content="Open the full provider workspace" placement="left">
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() => navigate(`/coding/providers/${selectedProvider.id}`)}
                        >
                          Open full page
                        </Button>
                      </InfoTooltip>
                    </ListGroup.Item>
                  </ListGroup>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default CodingProvidersPage;
